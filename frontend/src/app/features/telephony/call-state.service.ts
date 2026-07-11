import { Injectable, signal, computed } from '@angular/core';

export interface TranscriptSegment {
  speaker: 'agent' | 'contact' | 'dialogue';
  text: string;
  timestamp: Date;
}

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class CallStateService {
  // Call general signals
  readonly activeCall = signal<any | null>(null);
  readonly callDuration = signal<number>(0);
  readonly isMuted = signal<boolean>(false);
  readonly isHeld = signal<boolean>(false);
  readonly aiAssistEnabled = signal<boolean>(false);
  readonly isSimulated = signal<boolean>(false);

  // Live dialogue transcript signals
  readonly transcript = signal<TranscriptSegment[]>([]);

  // CRM details context signal
  readonly crmContext = signal<any | null>(null);

  // AI Assist Insights signals
  readonly painPoints = signal<string[]>([]);
  readonly buyingSignals = signal<string[]>([]);
  readonly objections = signal<string[]>([]);
  readonly suggestedQuestions = signal<string[]>([]);
  readonly suggestions = signal<any | null>(null);

  // AI Copilot pane signals
  readonly copilotMessages = signal<CopilotMessage[]>([]);
  readonly conversationId = signal<string | null>(null);

  private timerInterval?: any;

  /**
   * Reset all active call signals to default values.
   */
  resetCallState(): void {
    this.stopTimer();
    this.activeCall.set(null);
    this.callDuration.set(0);
    this.isMuted.set(false);
    this.isHeld.set(false);
    this.aiAssistEnabled.set(false);
    this.isSimulated.set(false);
    this.transcript.set([]);
    this.crmContext.set(null);
    this.painPoints.set([]);
    this.buyingSignals.set([]);
    this.objections.set([]);
    this.suggestedQuestions.set([]);
    this.suggestions.set(null);
    this.copilotMessages.set([]);
    this.conversationId.set(null);
  }

  /**
   * Start call stopwatch.
   */
  startTimer(): void {
    this.stopTimer();
    this.callDuration.set(0);
    this.timerInterval = setInterval(() => {
      this.callDuration.update((d) => d + 1);
    }, 1000);
  }

  /**
   * Stop call stopwatch.
   */
  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
  }

  /**
   * Append a dialogue transcript line locally.
   */
  appendTranscriptLine(speaker: 'agent' | 'contact' | 'dialogue', text: string): void {
    this.transcript.update((list) => [
      ...list,
      { speaker, text, timestamp: new Date() }
    ]);
  }

  /**
   * Append message into the Copilot chat thread.
   */
  appendCopilotMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this.copilotMessages.update((msgs) => [
      ...msgs,
      { role, content, created_at: new Date() }
    ]);
  }
}
