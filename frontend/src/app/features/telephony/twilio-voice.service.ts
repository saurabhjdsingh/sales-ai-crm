import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { CallStateService } from './call-state.service';
import { AudioService } from './audio.service';
import { catchError, of, tap } from 'rxjs';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';

@Injectable({
  providedIn: 'root'
})
export class TwilioVoiceService {
  private readonly apiService = inject(ApiService);
  private readonly callState = inject(CallStateService);
  private readonly audioService = inject(AudioService);
  private readonly conversationIntelligence = inject(ConversationIntelligenceService);

  private twilioDevice: any;
  private activeConnection: any;
  onDisconnectCallback?: () => void;
  private transcriptionProvider: string = 'none';
  private recognition: any;

  /**
   * Initialize Twilio Device with backend Voice capability token.
   * If token is missing, falls back to Simulator mode.
   */
  initDevice(): void {
    if (this.callState.isSimulated()) {
      console.log('Voice running in Call Dialogue Simulator Mode.');
      return;
    }

    this.apiService.get<any>('/telephony/token/').pipe(
      catchError(err => {
        console.warn('Failed to retrieve Twilio token, enabling Simulator Mode fallback:', err);
        this.callState.isSimulated.set(true);
        return of(null);
      })
    ).subscribe(data => {
      if (!data || !data.token) {
        this.callState.isSimulated.set(true);
        return;
      }

      this.transcriptionProvider = data.transcription_provider || 'none';
      this.loadTwilioSdkAndSetup(data.token, data.identity);
    });
  }

  private async loadTwilioSdkAndSetup(token: string, identity: string): Promise<void> {
    try {
      // Dynamically load the Twilio Voice SDK to prevent compilation issues
      // if NPM packages are loading or if browser environment has strict constraints
      const { Device } = await import('@twilio/voice-sdk');

      this.twilioDevice = new Device(token, {
        codecPreferences: ['opus', 'pcmu'],
        fakeLocalDTMF: true,
        enableIceRestart: true,
      } as any);

      this.twilioDevice.on('registered', () => {
        console.log('Twilio softphone registered successfully with identity:', identity);
      });

      this.twilioDevice.on('error', (error: any) => {
        console.error('Twilio Voice SDK Error:', error);
      });

      this.twilioDevice.on('incoming', (connection: any) => {
        const getParam = (name: string) => {
          if (!connection.customParameters) return null;
          if (typeof connection.customParameters.get === 'function') {
            return connection.customParameters.get(name);
          }
          return (connection.customParameters as any)[name];
        };

        const callerNum = getParam('callerNumber') || connection.parameters.From || 'Unknown';
        const callerName = getParam('callerName') || '';
        const dbCallId = getParam('dbCallId') || connection.parameters.CallSid || 'inbound_' + Date.now();
        
        console.log('Incoming call received. DB Call ID:', dbCallId, 'Caller:', callerNum);
        this.activeConnection = connection;

        // Register disconnect listener for the incoming connection
        connection.on('disconnect', () => {
          console.log('Incoming call disconnected by remote caller.');
          this.hangup();
          if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
          }
        });
        
        // Populate the active call signal to expand and open the incoming call box in the UI!
        this.callState.activeCall.set({
          id: dbCallId,
          direction: 'inbound',
          status: 'ringing',
          participants: [
            { 
              phone_number: callerNum,
              name: callerName
            }
          ],
          ai_assist_enabled: true
        });

        // Trigger incoming call modal in CallState
        this.callState.appendTranscriptLine('contact', `Incoming Call from: ${callerName || callerNum}`);
      });

      await this.twilioDevice.register();

    } catch (e) {
      console.error('Could not load or register Twilio Device SDK:', e);
      this.callState.isSimulated.set(true);
    }
  }

  /**
   * Place outbound call.
   */
  makeCall(phoneNumber: string, callId: string): void {
    this.audioService.playDtmfTone('2'); // feedback tone
    
    if (this.callState.isSimulated()) {
      console.log('Simulator dialing number:', phoneNumber);
      this.callState.startTimer();
      
      // Simulate answering call after 2 seconds
      setTimeout(() => {
        // Transition call status to in-progress to route UI to the active screen
        this.callState.activeCall.update(c => c ? { ...c, status: 'in-progress' } : null);
        this.callState.appendTranscriptLine('agent', 'Hello, this is agent connecting. Am I speaking with the lead?');
        
        // Feed mock transcript chunks
        this.runSimulatorDialogue();
      }, 2000);
      return;
    }

    if (!this.twilioDevice) {
      console.warn('Twilio Device not registered. Defaulting to Simulator.');
      this.callState.isSimulated.set(true);
      this.makeCall(phoneNumber, callId);
      return;
    }

    try {
      const params = { To: phoneNumber, callId: callId };
      this.twilioDevice.connect({ params }).then((connection: any) => {
        this.activeConnection = connection;
        this.callState.startTimer();

        const handleAccept = async () => {
          console.log('Call connected! Accessing media streams...');
          // Transition call status to in-progress to route UI to the active screen
          this.callState.activeCall.update(c => c ? { ...c, status: 'in-progress' } : null);
          try {
            // 1. Capture Sales Rep Microphone stream directly (like POC)
            const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 2. Capture Remote Customer audio stream from Twilio Connection
            const remoteStream = typeof connection.getRemoteStream === 'function' 
              ? connection.getRemoteStream() 
              : null;
            
            if (localStream) {
              console.log('Audio streams successfully captured!');
              this.audioService.startCallRecording(localStream, remoteStream || new MediaStream(), callId);
              
              if (this.callState.aiAssistEnabled()) {
                const context = this.callState.crmContext();
                this.conversationIntelligence.startStreaming(
                  callId,
                  localStream,
                  remoteStream || new MediaStream(),
                  context?.contact?.id,
                  context?.company?.id,
                  context?.deals?.[0]?.id
                );
              }
            } else {
              console.warn('Failed to capture microphone stream.');
            }
          } catch (err) {
            console.error('Error capturing streams from browser or connection:', err);
          }

          if (this.transcriptionProvider === 'none' && !this.callState.aiAssistEnabled()) {
            this.startBrowserSpeechRecognition(callId);
          }
        };

        // Handle race conditions where connection transitions to open before listener registration
        if (connection.state === 'open' || connection.status?.() === 'open') {
          handleAccept();
        } else {
          connection.on('accept', handleAccept);
        }

        connection.on('disconnect', () => {
          console.log('Call disconnected.');
          this.hangup();
          if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
          }
        });
      });
    } catch (e) {
      console.error('Failed to dial number using WebRTC:', e);
      this.callState.isSimulated.set(true);
      this.makeCall(phoneNumber, callId);
    }
  }

  /**
   * Accept an incoming call.
   */
  acceptIncomingCall(callId: string): void {
    if (this.activeConnection) {
      this.activeConnection.accept();
      this.callState.startTimer();

      const handleAccept = async () => {
        console.log('Inbound call accepted! Accessing media streams...');
        try {
          // 1. Capture Sales Rep Microphone stream directly (like POC)
          const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          
          // 2. Capture Remote Customer audio stream from Twilio Connection
          const remoteStream = typeof this.activeConnection.getRemoteStream === 'function'
            ? this.activeConnection.getRemoteStream()
            : null;
          
          if (localStream) {
            console.log('Inbound audio streams successfully captured!');
            this.audioService.startCallRecording(localStream, remoteStream || new MediaStream(), callId);
            
            if (this.callState.aiAssistEnabled()) {
              const context = this.callState.crmContext();
              this.conversationIntelligence.startStreaming(
                callId,
                localStream,
                remoteStream || new MediaStream(),
                context?.contact?.id,
                context?.company?.id,
                context?.deals?.[0]?.id
              );
            }
          } else {
            console.warn('Failed to capture inbound microphone stream.');
          }
        } catch (err) {
          console.error('Error capturing inbound streams:', err);
        }

        if (this.transcriptionProvider === 'none' && !this.callState.aiAssistEnabled()) {
          this.startBrowserSpeechRecognition(callId);
        }
      };

      if (this.activeConnection.state === 'open' || this.activeConnection.status?.() === 'open') {
        handleAccept();
      } else {
        this.activeConnection.on('accept', handleAccept);
      }
    }
  }

  /**
   * End the current call.
   */
  hangup(): void {
    this.audioService.stopCallRecording();
    this.conversationIntelligence.stopStreaming();
    this.callState.stopTimer();

    if (this.callState.isSimulated()) {
      console.log('Simulator call hung up.');
      return;
    }

    if (this.twilioDevice) {
      try {
        this.twilioDevice.disconnectAll();
      } catch (e) {
        console.error('Error during Twilio disconnectAll:', e);
      }
    }

    if (this.activeConnection) {
      try {
        if (this.activeConnection.status() === 'pending') {
          this.activeConnection.reject();
        } else {
          this.activeConnection.disconnect();
        }
      } catch (e) {
        try {
          this.activeConnection.disconnect();
        } catch (innerErr) {}
      }
      this.activeConnection = null;
    }
    this.stopBrowserSpeechRecognition();
  }

  /**
   * Toggle mute on the connection.
   */
  toggleMute(muteState: boolean): void {
    this.callState.isMuted.set(muteState);
    if (this.activeConnection) {
      this.activeConnection.mute(muteState);
    }
  }

  /**
   * Toggle hold on the connection.
   */
  toggleHold(holdState: boolean, callId: string): void {
    this.callState.isHeld.set(holdState);
    // Notify backend to apply hold music TwiML or local control
    const endpoint = holdState ? `/telephony/calls/${callId}/hold/` : `/telephony/calls/${callId}/resume/`;
    // Standard mock or REST toggle
    console.log(`Call hold state toggled: ${holdState}`);
  }

  /**
   * Simulated caller dialogue stream to demonstrate the AI Assist's power in sandbox environments.
   */
  private runSimulatorDialogue(): void {
    const dialogs = [
      { delay: 4000, speaker: 'contact', text: 'Hi! Yes, this is Sarah. I was looking into your CRM application.' },
      { delay: 9000, speaker: 'agent', text: 'Great to connect, Sarah! What specific pain points are you currently facing in managing your sales team?' },
      { delay: 14000, speaker: 'contact', text: 'Well, our reps struggle to log details correctly. Honestly, the objection is the team says it takes too much time to write summaries manually.' },
      { delay: 20000, speaker: 'agent', text: 'That is exactly what our AI Assist solves. It transcribes and updates deals automatically.' },
      { delay: 25000, speaker: 'contact', text: 'Oh really? That is a huge buying signal for us. We would love to book a technical demo to see this automation live next Monday.' },
      { delay: 30000, speaker: 'agent', text: 'Perfect. Let me note that down and we will get that scheduled.' }
    ];

    dialogs.forEach((dialog) => {
      setTimeout(() => {
        if (this.callState.activeCall()) {
          this.callState.appendTranscriptLine(dialog.speaker as any, dialog.text);
          
          // Post to backend to mimic WebRTC speech recognition chunks
          const callId = this.callState.activeCall().id;
          this.apiService.post<any>(`/telephony/calls/${callId}/append-transcript/`, {
            speaker: dialog.speaker,
            text: dialog.text
          }).subscribe(res => {
            if (res && res.analysis) {
              const ans = res.analysis;
              if (ans.pain_points) this.callState.painPoints.set(ans.pain_points);
              if (ans.buying_signals) this.callState.buyingSignals.set(ans.buying_signals);
              if (ans.objections) this.callState.objections.set(ans.objections);
              if (ans.suggested_questions) this.callState.suggestedQuestions.set(ans.suggested_questions);
            }
          });
        }
      }, dialog.delay);
    });
  }

  private startBrowserSpeechRecognition(callId: string): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Browser Speech Recognition (Web Speech API) not supported.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        const lastIndex = event.results.length - 1;
        const text = event.results[lastIndex][0].transcript.trim();

        if (text && this.callState.activeCall()) {
          console.log('Browser Speech Recognized:', text);
          this.callState.appendTranscriptLine('agent', text);

          this.apiService.post<any>(`/telephony/calls/${callId}/append-transcript/`, {
            speaker: 'agent',
            text: text
          }).subscribe(res => {
            if (res && res.analysis) {
              const ans = res.analysis;
              if (ans.pain_points) this.callState.painPoints.set(ans.pain_points);
              if (ans.buying_signals) this.callState.buyingSignals.set(ans.buying_signals);
              if (ans.objections) this.callState.objections.set(ans.objections);
              if (ans.suggested_questions) this.callState.suggestedQuestions.set(ans.suggested_questions);
            }
          });
        }
      };

      this.recognition.onerror = (err: any) => {
        console.error('Browser Speech Recognition Error:', err);
      };

      this.recognition.onend = () => {
        if (this.callState.activeCall() && this.recognition) {
          try {
            this.recognition.start();
          } catch (e) {}
        }
      };

      this.recognition.start();
      console.log('Browser Speech Recognition started.');
    } catch (e) {
      console.error('Failed starting Browser Speech Recognition:', e);
    }
  }

  private stopBrowserSpeechRecognition(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = undefined;
    }
  }
}
