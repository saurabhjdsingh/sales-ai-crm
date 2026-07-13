import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/auth/token.service';
import { NotificationService } from '../../core/services/notification.service';
import { catchError, of } from 'rxjs';
import { CallStateService } from '../telephony/call-state.service';

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}


@Injectable({
  providedIn: 'root'
})
export class ConversationIntelligenceService {
  private readonly apiService = inject(ApiService);
  private readonly tokenService = inject(TokenService);
  private readonly notification = inject(NotificationService);
  private readonly callState = inject(CallStateService);

  // Reactive state signals for UI updates
  readonly streamStatus = signal<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  readonly liveTranscript = signal<TranscriptSegment[]>([]);
  readonly activeConversationId = signal<string | null>(null);

  private wsAgent?: WebSocket;
  private wsCustomer?: WebSocket;
  private localStream?: MediaStream;
  private remoteStream?: MediaStream;
  
  private agentIntervalId?: any;
  private customerIntervalId?: any;
  private activeRecorders: MediaRecorder[] = [];
  
  private conversationId?: string;
  private sessionKey?: string;
  private isStreamingActive = false;

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeoutId?: any;

  // Track sent and processed chunks to synchronize post-call AI review
  private agentChunksSent = 0;
  private agentChunksProcessed = 0;
  private customerChunksSent = 0;
  private customerChunksProcessed = 0;
  private teardownTimeoutId?: any;

  /**
   * Start Conversation Intelligence stream capture.
   */
  startStreaming(
    callId: string, 
    localStream: MediaStream, 
    remoteStream: MediaStream,
    contactId?: string,
    companyId?: string,
    dealId?: string
  ): void {
    this.forceTeardown();

    console.log('[CI] startStreaming called with CallId:', callId);
    this.localStream = localStream;
    this.remoteStream = remoteStream;
    this.isStreamingActive = true;
    this.streamStatus.set('connecting');
    this.liveTranscript.set([]);

    // Reset counters for the new session
    this.agentChunksSent = 0;
    this.agentChunksProcessed = 0;
    this.customerChunksSent = 0;
    this.customerChunksProcessed = 0;
    if (this.teardownTimeoutId) {
      clearTimeout(this.teardownTimeoutId);
      this.teardownTimeoutId = undefined;
    }

    const payload = {
      call_id: callId,
      contact_id: contactId,
      company_id: companyId,
      deal_id: dealId
    };

    this.apiService.post<any>('/conversation-intelligence/conversations/initiate/', payload).pipe(
      catchError(err => {
        console.error('Failed to initiate Conversation Intelligence session:', err);
        this.streamStatus.set('error');
        this.isStreamingActive = false;
        
        // Show validation/error message
        const errMsg = err?.error?.detail || err?.error?.[0] || 'AI Assist model is not configured. Please set up your AI Provider in the Settings page.';
        this.notification.error(errMsg);
        
        return of(null);
      })
    ).subscribe(res => {
      if (!res || !res.conversation_id) {
        this.streamStatus.set('error');
        this.isStreamingActive = false;
        return;
      }

      console.log('[CI] Initiate session successful. ConversationId:', res.conversation_id);
      this.conversationId = res.conversation_id;
      this.sessionKey = res.session_key;
      this.activeConversationId.set(res.conversation_id);
      
      this.connectWebSockets();
    });
  }

  /**
   * Establish double WebSocket streams.
   */
  private connectWebSockets(): void {
    console.log('[CI] Establishing WebSockets...');
    if (!this.conversationId || !this.isStreamingActive) return;
    const token = this.tokenService.getAccessToken() || '';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname;
    const wsPort = window.location.port;
    const wsHostWithPort = wsPort === '4200' ? `${wsHost}:8000` : `${wsHost}${wsPort ? `:${wsPort}` : ''}`;
    
    // Connect sales rep stream
    const agentUrl = `${wsProtocol}//${wsHostWithPort}/ws/conversation/stream/${this.conversationId}/sales_rep/?token=${token}`;
    this.wsAgent = new WebSocket(agentUrl);

    // Connect remote customer stream
    const customerUrl = `${wsProtocol}//${wsHostWithPort}/ws/conversation/stream/${this.conversationId}/customer/?token=${token}`;
    this.wsCustomer = new WebSocket(customerUrl);

    let agentConnected = false;
    let customerConnected = false;

    const checkConnected = () => {
      console.log('[CI] checkConnected status - Agent:', agentConnected, 'Customer:', customerConnected);
      if (agentConnected && customerConnected) {
        console.log('[CI] Sockets connected successfully! Starting chunking...');
        this.streamStatus.set('connected');
        this.reconnectAttempts = 0;
        this.startChunking();
      }
    };

    this.wsAgent.onopen = () => {
      agentConnected = true;
      checkConnected();
    };

    this.wsCustomer.onopen = () => {
      customerConnected = true;
      checkConnected();
    };

    // Pipe real-time transcript updates to UI signals
    this.wsAgent.onmessage = (event) => {
      this.handleSocketMessage(event);
    };

    this.wsCustomer.onmessage = (event) => {
      this.handleSocketMessage(event);
    };

    this.wsAgent.onerror = (e) => this.handleSocketError(e);
    this.wsCustomer.onerror = (e) => this.handleSocketError(e);

    this.wsAgent.onclose = (e) => this.handleSocketClose(e);
    this.wsCustomer.onclose = (e) => this.handleSocketClose(e);
  }

  private handleSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      // Handle processing confirmation events
      if (data.event === 'chunk_processed') {
        if (data.speaker === 'sales_rep') {
          this.agentChunksProcessed++;
        } else if (data.speaker === 'customer') {
          this.customerChunksProcessed++;
        }
        console.log(`[CI] Chunk processed - Agent: ${this.agentChunksProcessed}/${this.agentChunksSent}, Customer: ${this.customerChunksProcessed}/${this.customerChunksSent}`);
        this.checkTeardownReady();
      }

      if (data.event === 'segment_transcribed') {
        const newSegment: TranscriptSegment = {
          speaker: data.speaker,
          text: data.text,
          start_time: data.start_time,
          end_time: data.end_time
        };
        
        let isNew = false;
        this.liveTranscript.update(current => {
          const exists = current.some(
            s => s.speaker === newSegment.speaker && 
                 s.start_time === newSegment.start_time
          );
          if (exists) return current;
          isNew = true;
          const merged = [...current, newSegment];
          return merged.sort((a, b) => a.start_time - b.start_time);
        });

        // Forward to CallStateService to update UI live transcript board in real-time
        if (isNew) {
          const uiSpeaker = data.speaker === 'sales_rep' ? 'agent' : 'contact';
          this.callState.appendTranscriptLine(uiSpeaker, data.text);
        }
      }
    } catch (e) {
      console.error('Failed to parse socket message:', e);
    }
  }

  private handleSocketError(e: Event): void {
    console.error('WebSocket connection error:', e);
    this.streamStatus.set('error');
  }

  private handleSocketClose(e: CloseEvent): void {
    if (!this.isStreamingActive) return;

    console.warn('WebSocket connection closed unexpectedly:', e);
    this.stopChunking();
    this.streamStatus.set('connecting');
    
    if (this.reconnectTimeoutId) {
      console.log('[CI] Reconnection already scheduled, ignoring close event.');
      return;
    }

    // Auto reconnect attempts
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`[CI] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectTimeoutId = undefined;
        this.connectWebSockets();
      }, delay);
    } else {
      this.streamStatus.set('error');
      this.notification.error('Conversation Intelligence disconnected.');
    }
  }

  private startChunking(): void {
    console.log('[CI] startChunking called. localStream:', !!this.localStream, 'remoteStream:', !!this.remoteStream);
    this.stopChunking();

    if (this.localStream && this.wsAgent) {
      console.log('[CI] Starting recorder for localStream (microphone)...');
      this.agentIntervalId = this.startRecorderForStream(this.localStream, this.wsAgent);
    }
    if (this.remoteStream && this.wsCustomer) {
      console.log('[CI] Starting recorder for remoteStream (customer)...');
      this.customerIntervalId = this.startRecorderForStream(this.remoteStream, this.wsCustomer);
    }
  }

  private getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }

  private startRecorderForStream(stream: MediaStream, socket: WebSocket): any {
    const chunkDuration = 4000; // 4 seconds chunk
    const mimeType = this.getSupportedMimeType();
    console.log('[CI] Resolved supported MIME type:', mimeType || 'default');
    
    const recordChunk = () => {
      if (socket.readyState !== WebSocket.OPEN) return;

      try {
        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        this.activeRecorders.push(recorder);
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          console.log('[MediaRecorder] ondataavailable size:', e.data?.size);
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          console.log('[MediaRecorder] onstop. Chunks collected:', chunks.length);
          if (chunks.length > 0 && socket.readyState === WebSocket.OPEN) {
            const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
            console.log('[MediaRecorder] Sending audio blob size:', blob.size);
            socket.send(blob);
            if (socket === this.wsAgent) {
              this.agentChunksSent++;
            } else if (socket === this.wsCustomer) {
              this.customerChunksSent++;
            }
            console.log(`[CI] Sent chunk - Agent total: ${this.agentChunksSent}, Customer total: ${this.customerChunksSent}`);
          }
          this.activeRecorders = this.activeRecorders.filter(r => r !== recorder);
        };

        recorder.start();
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, chunkDuration);

      } catch (err) {
        console.error('Failed to configure MediaRecorder:', err);
      }
    };

    recordChunk();
    return setInterval(recordChunk, chunkDuration);
  }

  private stopChunking(): void {
    if (this.agentIntervalId) clearInterval(this.agentIntervalId);
    if (this.customerIntervalId) clearInterval(this.customerIntervalId);
    this.agentIntervalId = undefined;
    this.customerIntervalId = undefined;

    this.activeRecorders.forEach(r => {
      try {
        if (r.state !== 'inactive') r.stop();
      } catch (e) {}
    });
    this.activeRecorders = [];
  }

  stopStreaming(): void {
    console.log('[CI] stopStreaming called. Stopping chunking and waiting for pending chunks...');
    this.isStreamingActive = false;
    this.stopChunking();

    // Check if we can teardown immediately
    this.checkTeardownReady();

    // Safety fallback timeout: force teardown after 60 seconds if chunks get lost
    if (!this.teardownTimeoutId) {
      this.teardownTimeoutId = setTimeout(() => {
        console.warn('[CI] Safety timeout hit. Forcing teardown.');
        this.finalizeTeardown();
      }, 60000);
    }
  }

  private checkTeardownReady(): void {
    if (this.isStreamingActive) return;

    const agentReady = !this.wsAgent || this.agentChunksProcessed >= this.agentChunksSent;
    const customerReady = !this.wsCustomer || this.customerChunksProcessed >= this.customerChunksSent;

    console.log(`[CI] checkTeardownReady - Agent Ready: ${agentReady} (${this.agentChunksProcessed}/${this.agentChunksSent}), Customer Ready: ${customerReady} (${this.customerChunksProcessed}/${this.customerChunksSent})`);

    if (agentReady && customerReady) {
      this.finalizeTeardown();
    }
  }

  private forceTeardown(): void {
    this.isStreamingActive = false;
    this.stopChunking();

    if (this.teardownTimeoutId) {
      clearTimeout(this.teardownTimeoutId);
      this.teardownTimeoutId = undefined;
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = undefined;
    }

    if (this.wsAgent) {
      this.wsAgent.onopen = null;
      this.wsAgent.onclose = null;
      this.wsAgent.onerror = null;
      this.wsAgent.onmessage = null;
      try { this.wsAgent.close(); } catch (e) {}
      this.wsAgent = undefined;
    }
    if (this.wsCustomer) {
      this.wsCustomer.onopen = null;
      this.wsCustomer.onclose = null;
      this.wsCustomer.onerror = null;
      this.wsCustomer.onmessage = null;
      try { this.wsCustomer.close(); } catch (e) {}
      this.wsCustomer = undefined;
    }
  }

  private finalizeTeardown(): void {
    console.log('[CI] All pending chunks processed. Finalizing session.');
    this.forceTeardown();

    const convId = this.conversationId;
    if (convId) {
      this.apiService.post<any>(`/conversation-intelligence/conversations/${convId}/end/`, {}).subscribe();
    }

    this.streamStatus.set('disconnected');
  }

  getConversationDetail(conversationId: string) {
    return this.apiService.get<any>(`/conversation-intelligence/conversations/${conversationId}/`);
  }

  confirmReview(conversationId: string, reviewData: any) {
    return this.apiService.post<any>(`/conversation-intelligence/conversations/${conversationId}/confirm/`, reviewData);
  }
}
