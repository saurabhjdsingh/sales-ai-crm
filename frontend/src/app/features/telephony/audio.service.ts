import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { CallStateService } from './call-state.service';
import { catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private readonly apiService = inject(ApiService);
  private readonly callState = inject(CallStateService);

  private audioCtx?: AudioContext;
  private mediaRecorder?: MediaRecorder;
  private audioChunks: Blob[] = [];
  private recorderInterval?: any;
  
  // DTMF Synthesizer frequency maps
  private readonly dtmfFrequencies: Record<string, [number, number]> = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
  };

  /**
   * Play standard telephone keypad DTMF tones using OscillatorNodes.
   */
  playDtmfTone(key: string): void {
    const freqs = this.dtmfFrequencies[key];
    if (!freqs) return;

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = freqs[0];
      osc2.frequency.value = freqs[1];
      gain.gain.value = 0.1;

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();

      setTimeout(() => {
        osc1.stop();
        osc2.stop();
        ctx.close();
      }, 100);
    } catch (e) {
      console.warn('AudioContext not supported or blocked:', e);
    }
  }

  /**
   * Merge local microphone track and remote WebRTC peer connection audio track,
   * then stream chunked recordings to the backend for AI transcription.
   */
  startCallRecording(localStream: MediaStream, remoteStream: MediaStream, callId: string): void {
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const localSource = this.audioCtx.createMediaStreamSource(localStream);
      const remoteSource = this.audioCtx.createMediaStreamSource(remoteStream);
      const dest = this.audioCtx.createMediaStreamDestination();

      // Mix local + remote tracks
      localSource.connect(dest);
      remoteSource.connect(dest);

      // Initialize MediaRecorder on mixed stream
      this.mediaRecorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.uploadAudioChunk(new Blob(this.audioChunks, { type: 'audio/webm' }), callId);
          this.audioChunks = []; // clear for next chunk
        }
      };

      // Record in 5-second intervals
      this.mediaRecorder.start();
      this.recorderInterval = setInterval(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
      }, 5000);

    } catch (e) {
      console.error('Failed to initialize AudioContext mixer for call recording:', e);
    }
  }

  /**
   * Stop recording and release Web Audio nodes.
   */
  stopCallRecording(): void {
    if (this.recorderInterval) {
      clearInterval(this.recorderInterval);
      this.recorderInterval = undefined;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(console.error);
    }

    this.mediaRecorder = undefined;
    this.audioCtx = undefined;
  }

  private uploadAudioChunk(blob: Blob, callId: string): void {
    const formData = new FormData();
    formData.append('audio', blob, 'chunk.webm');

    this.apiService.post<any>(`/telephony/calls/${callId}/transcribe-chunk/`, formData)
      .pipe(
        catchError(err => {
          console.error('Failed uploading audio transcript chunk:', err);
          return of(null);
        })
      )
      .subscribe(res => {
        if (res) {
          if (res.transcribed) {
            this.callState.appendTranscriptLine('contact', res.transcribed);
          }
          if (res.analysis) {
            const ans = res.analysis;
            if (ans.pain_points) this.callState.painPoints.set(ans.pain_points);
            if (ans.buying_signals) this.callState.buyingSignals.set(ans.buying_signals);
            if (ans.objections) this.callState.objections.set(ans.objections);
            if (ans.suggested_questions) this.callState.suggestedQuestions.set(ans.suggested_questions);
          }
        }
      });
  }
}
