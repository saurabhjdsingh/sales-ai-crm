import { Component, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { marked } from 'marked';
import { ApiService } from '../../../core/services/api.service';
import { AIConversation, AIMessage } from '../../../core/models/crm.model';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-ai-chat-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule, MatDialogModule],
  template: `
    <div class="chat-panel">
      <div class="chat-header">
        <div class="header-title">
          <mat-icon class="ai-icon">psychology</mat-icon>
          <span>AI Copilot</span>
        </div>
        <div class="header-actions">
          @if (conversation()) {
            <span class="tokens-badge" *ngIf="totalTokens() > 0">
              {{ totalTokens() }} tokens
            </span>
          }
          <button
            mat-icon-button
            (click)="toggleDebugMode()"
            [title]="debugMode() ? 'Disable Developer Context Debugger' : 'Enable Developer Context Debugger'"
            class="action-btn"
            [ngClass]="{ 'active-debug': debugMode() }"
          >
            <mat-icon>bug_report</mat-icon>
          </button>

          @if (showExpandButton && !isDialog) {
            <button
              mat-icon-button
              (click)="openInPopup()"
              title="Open in popup"
              class="action-btn"
            >
              <mat-icon>open_in_new</mat-icon>
            </button>
          }
          @if (isDialog) {
            <button
              mat-icon-button
              (click)="closeDialog()"
              title="Close chat"
              class="action-btn"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
      </div>

      <div class="chat-messages" #messageContainer>
        @if (loadingConversation()) {
          <div class="chat-loading">
            <mat-spinner diameter="32"></mat-spinner>
            <p>Initializing assistant...</p>
          </div>
        } @else {
          @for (msg of messages(); track msg.id) {
            <div class="msg-wrapper" [ngClass]="msg.role">
              <div class="msg-avatar">
                <mat-icon>{{ msg.role === 'user' ? 'person' : 'smart_toy' }}</mat-icon>
              </div>
              <div class="msg-bubble">
                <div class="msg-content" [innerHTML]="renderMarkdown(msg.content)"></div>
                
                @if (msg.role === 'assistant' && msg.debug_report && (debugMode() || isStaffUser())) {
                  <div class="debug-report-trigger">
                    <button mat-button class="debug-btn" (click)="toggleReport(msg.id)">
                      <mat-icon class="bug-icon">bug_report</mat-icon>
                      <span>Context Debug Report</span>
                      <mat-icon>{{ activeDebugMsgId() === msg.id ? 'expand_less' : 'expand_more' }}</mat-icon>
                    </button>
                  </div>

                  @if (activeDebugMsgId() === msg.id) {
                    <div class="debug-report-container">
                      <div class="debug-header">
                        <div class="debug-title">
                          <mat-icon>insights</mat-icon> Context Report (Developer Mode)
                        </div>
                        <span class="debug-badge">Base Context: ~{{ msg.debug_report.token_usage?.base_context_tokens || 120 }} tokens</span>
                      </div>

                      <div class="debug-section">
                        <span class="section-title">Execution Timings & Latency</span>
                        <div class="metrics-pills">
                          <span class="pill">Context Build: <strong>{{ msg.debug_report.timings?.context_build_time_ms || 0 }} ms</strong></span>
                          <span class="pill">Tool Execution: <strong>{{ msg.debug_report.timings?.tool_execution_time_ms || 0 }} ms</strong></span>
                          <span class="pill">LLM Response: <strong>{{ msg.debug_report.timings?.llm_response_time_ms || 0 }} ms</strong></span>
                          <span class="pill highlight">Total Turn: <strong>{{ msg.debug_report.timings?.total_time_ms || 0 }} ms</strong></span>
                        </div>
                      </div>

                      <div class="debug-section">
                        <span class="section-title">Token Footprint Breakdown</span>
                        <div class="metrics-pills">
                          <span class="pill">Base Context: <strong>{{ msg.debug_report.token_usage?.base_context_tokens || 0 }}</strong></span>
                          <span class="pill">LLM Input: <strong>{{ msg.debug_report.token_usage?.input_tokens || 0 }}</strong></span>
                          <span class="pill">LLM Output: <strong>{{ msg.debug_report.token_usage?.output_tokens || 0 }}</strong></span>
                          <span class="pill highlight">Total Tokens: <strong>{{ msg.debug_report.token_usage?.total_tokens || 0 }}</strong></span>
                        </div>
                      </div>

                      <div class="debug-section">
                        <span class="section-title">Internal Tool Calls ({{ msg.debug_report.tool_calls?.length || 0 }})</span>
                        <div class="tools-table-wrapper">
                          <table class="debug-tools-table">
                            <thead>
                              <tr>
                                <th>Tool Name</th>
                                <th>Status</th>
                                <th>Latency</th>
                                <th>Payload Summary</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr *ngFor="let tc of msg.debug_report.tool_calls">
                                <td><code>{{ tc.tool_name }}</code></td>
                                <td><span class="status-tag" [ngClass]="tc.status | lowercase">{{ tc.status }}</span></td>
                                <td>{{ tc.execution_time_ms }} ms</td>
                                <td class="summary-cell">{{ tc.summary || 'Done' }}</td>
                              </tr>
                              <tr *ngIf="!msg.debug_report.tool_calls || msg.debug_report.tool_calls.length === 0">
                                <td colspan="4" class="no-tools">No tool calls executed (handled via base context).</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      @if (msg.debug_report.reasoning_trace?.length) {
                        <div class="debug-section">
                          <span class="section-title">Reasoning Trace</span>
                          <ul class="trace-list">
                            <li *ngFor="let step of msg.debug_report.reasoning_trace">{{ step }}</li>
                          </ul>
                        </div>
                      }
                    </div>
                  }
                }

                <div class="msg-time">{{ msg.created_at | date:'shortTime' }}</div>
              </div>
            </div>
          }

          @if (sendingMessage()) {
            <div class="msg-wrapper assistant typing">
              <div class="msg-avatar">
                <mat-icon>smart_toy</mat-icon>
              </div>
              <div class="msg-bubble">
                <div class="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          }

          @if (messages().length === 0) {
            <div class="welcome-state">
              <mat-icon class="welcome-icon">auto_awesome</mat-icon>
              <h3>Ask anything about this {{ entityType }}</h3>
              <p>Examples:</p>
              <ul class="examples-list">
                <li (click)="useExample('Why is this deal stuck?')">"Why is this deal stuck?"</li>
                <li (click)="useExample('Write a personalized follow-up email')">"Write a personalized follow-up email"</li>
                <li (click)="useExample('Summarize recent timeline activities')">"Summarize recent timeline activities"</li>
              </ul>
            </div>
          }
        }
      </div>

      <div class="chat-input-area">
        <input
          [formControl]="messageControl"
          (keydown.enter)="sendMessage()"
          type="text"
          placeholder="Ask AI Copilot..."
          class="chat-input"
          [disabled]="loadingConversation() || sendingMessage()"
        />
        <button
          mat-icon-button
          color="primary"
          (click)="sendMessage()"
          [disabled]="messageControl.invalid || sendingMessage() || loadingConversation()"
          class="send-btn"
        >
          <mat-icon>send</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .chat-panel {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      background-color: #0b1329;
      border-left: 1px solid rgba(255, 255, 255, 0.05);
      font-family: 'Inter', sans-serif;
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background-color: #090f1f;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .action-btn {
      color: #94a3b8 !important;
      width: 32px !important;
      height: 32px !important;
      line-height: 32px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      color: #3b82f6 !important;
      background-color: rgba(255, 255, 255, 0.05) !important;
    }

    .action-btn.active-debug {
      color: #06b6d4 !important;
      background-color: rgba(6, 182, 212, 0.15) !important;
    }

    .action-btn mat-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f8fafc;
      font-weight: 600;
      font-size: 0.95rem;
    }

    .ai-icon {
      color: #3b82f6;
    }

    .tokens-badge {
      font-size: 0.7rem;
      background-color: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #64748b;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .chat-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #64748b;
      gap: 1rem;
    }

    .chat-loading p {
      margin: 0;
      font-size: 0.85rem;
    }

    .msg-wrapper {
      display: flex;
      gap: 0.75rem;
      max-width: 90%;
    }

    .msg-wrapper.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .msg-wrapper.assistant {
      align-self: flex-start;
    }

    .msg-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.05);
      color: #94a3b8;
      flex-shrink: 0;
    }

    .msg-wrapper.user .msg-avatar {
      background-color: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }

    .msg-bubble {
      display: flex;
      flex-direction: column;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      background-color: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
      width: 100%;
    }

    .msg-wrapper.user .msg-bubble {
      background-color: #1e3a8a;
      border-color: rgba(59, 130, 246, 0.3);
      color: #f8fafc;
    }

    .msg-content {
      font-size: 0.85rem;
      line-height: 1.5;
    }

    ::ng-deep .msg-content p {
      margin: 0 0 0.5rem 0;
    }

    ::ng-deep .msg-content p:last-child {
      margin-bottom: 0;
    }

    ::ng-deep .msg-content ul, ::ng-deep .msg-content ol {
      margin: 0 0 0.5rem 0;
      padding-left: 1.25rem;
    }

    ::ng-deep .msg-content li {
      margin-bottom: 0.25rem;
    }

    /* Context Debugger UI Styles */
    .debug-report-trigger {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px dashed rgba(255, 255, 255, 0.1);
    }

    .debug-btn {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #06b6d4 !important;
      font-size: 0.75rem !important;
      padding: 0.15rem 0.5rem !important;
      line-height: 1.2 !important;
      background: rgba(6, 182, 212, 0.08) !important;
      border: 1px solid rgba(6, 182, 212, 0.2) !important;
      border-radius: 4px !important;
    }

    .bug-icon {
      font-size: 14px !important;
      width: 14px !important;
      height: 14px !important;
    }

    .debug-report-container {
      margin-top: 0.5rem;
      padding: 0.75rem;
      background: #050b18;
      border: 1px solid rgba(6, 182, 212, 0.3);
      border-radius: 8px;
      font-size: 0.75rem;
    }

    .debug-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
      padding-bottom: 0.35rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .debug-title {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #38bdf8;
      font-weight: 600;
    }

    .debug-title mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .debug-badge {
      font-size: 0.7rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }

    .debug-section {
      margin-bottom: 0.75rem;
    }

    .section-title {
      display: block;
      color: #64748b;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.35rem;
      font-weight: 600;
    }

    .metrics-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      color: #94a3b8;

      strong {
        color: #e2e8f0;
      }
    }

    .pill.highlight {
      background: rgba(6, 182, 212, 0.12);
      border-color: rgba(6, 182, 212, 0.3);
      color: #38bdf8;

      strong {
        color: #38bdf8;
      }
    }

    .tools-table-wrapper {
      overflow-x: auto;
    }

    .debug-tools-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.72rem;

      th, td {
        padding: 0.35rem 0.5rem;
        text-align: left;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      th {
        color: #64748b;
        font-weight: 600;
      }

      code {
        color: #38bdf8;
        font-family: monospace;
      }

      .summary-cell {
        color: #94a3b8;
        max-width: 180px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .no-tools {
        color: #64748b;
        font-style: italic;
      }
    }

    .status-tag {
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 600;

      &.success {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }

      &.cache_hit {
        background: rgba(168, 85, 247, 0.15);
        color: #c084fc;
      }

      &.failed {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
    }

    .trace-list {
      margin: 0;
      padding-left: 1rem;
      color: #94a3b8;

      li {
        margin-bottom: 0.2rem;
      }
    }

    .msg-time {
      font-size: 0.7rem;
      color: #64748b;
      align-self: flex-end;
      margin-top: 0.25rem;
    }

    .msg-wrapper.user .msg-time {
      color: #93c5fd;
    }

    .welcome-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3rem 1rem;
      color: #64748b;
      margin-top: auto;
      margin-bottom: auto;
    }

    .welcome-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #3b82f6;
      margin-bottom: 1rem;
      animation: pulse 2s infinite;
    }

    .welcome-state h3 {
      color: #e2e8f0;
      font-size: 1rem;
      margin: 0 0 0.5rem 0;
    }

    .welcome-state p {
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .examples-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: 100%;
    }

    .examples-list li {
      font-size: 0.8rem;
      background-color: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 0.5rem;
      cursor: pointer;
      color: #94a3b8;
      transition: all 0.15s ease;
    }

    .examples-list li:hover {
      background-color: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      border-color: rgba(59, 130, 246, 0.2);
    }

    .chat-input-area {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      background-color: #090f1f;
      gap: 0.5rem;
    }

    .chat-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: #f8fafc;
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      outline: none;
    }

    .chat-input:focus {
      border-color: #3b82f6;
    }

    .send-btn {
      color: #3b82f6 !important;
    }

    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 14px;
    }

    .typing-indicator span {
      width: 6px;
      height: 6px;
      background-color: #94a3b8;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }

    .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `]
})
export class AIChatPanelComponent implements OnChanges, OnInit {
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogData = inject(MAT_DIALOG_DATA, { optional: true });
  private readonly dialogRef = inject(MatDialogRef<AIChatPanelComponent>, { optional: true });

  @Input() entityType!: 'company' | 'contact' | 'deal';
  @Input() entityId!: string;
  @Input() showExpandButton = true;

  @ViewChild('messageContainer') private messageContainer!: ElementRef;

  readonly messageControl = new FormControl('', [Validators.required]);
  readonly loadingConversation = signal(false);
  readonly sendingMessage = signal(false);
  readonly conversation = signal<AIConversation | null>(null);
  readonly messages = signal<AIMessage[]>([]);
  readonly totalTokens = signal<number>(0);
  readonly debugMode = signal<boolean>(false);
  readonly activeDebugMsgId = signal<string | null>(null);

  isDialog = false;

  ngOnInit(): void {
    if (this.dialogData) {
      this.isDialog = true;
      this.entityType = this.dialogData.entityType;
      this.entityId = this.dialogData.entityId;
      this.showExpandButton = false;
      this.initConversation();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isDialog) return;
    if ((changes['entityId'] && this.entityId) || (changes['entityType'] && this.entityType)) {
      this.initConversation();
    }
  }

  toggleDebugMode(): void {
    this.debugMode.update((v) => !v);
    if (this.debugMode() && this.conversation()) {
      this.loadConversation(this.conversation()!.id);
    }
  }

  toggleReport(msgId: string): void {
    this.activeDebugMsgId.update((current) => (current === msgId ? null : msgId));
  }

  isStaffUser(): boolean {
    return true; // Developer mode check
  }

  openInPopup(): void {
    this.dialog.open(AIChatPanelComponent, {
      width: '900px',
      height: '80vh',
      data: {
        entityType: this.entityType,
        entityId: this.entityId
      },
      panelClass: 'ai-chat-dialog-panel'
    });
  }

  closeDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  initConversation(): void {
    this.loadingConversation.set(true);
    this.messages.set([]);
    this.conversation.set(null);

    const params: any = {
      entity_type: this.entityType,
      entity_id: this.entityId
    };
    if (this.debugMode()) {
      params.debug = 'true';
    }

    this.apiService.get<any>('/ai/conversations/', params).subscribe({
      next: (res) => {
        if (res.results && res.results.length > 0) {
          this.loadConversation(res.results[0].id);
        } else {
          this.createConversation();
        }
      },
      error: () => {
        this.loadingConversation.set(false);
        this.notification.error('Failed to initialize AI Copilot');
      }
    });
  }

  private loadConversation(id: string): void {
    const params: any = {};
    if (this.debugMode()) {
      params.debug = 'true';
    }

    this.apiService.get<AIConversation>(`/ai/conversations/${id}/`, params).subscribe({
      next: (conv) => {
        this.conversation.set(conv);
        this.messages.set(conv.messages || []);
        this.updateTokenCount();
        this.loadingConversation.set(false);
        this.scrollToBottom();
      },
      error: () => {
        this.loadingConversation.set(false);
        this.notification.error('Failed to load chat history');
      }
    });
  }

  private createConversation(): void {
    this.apiService.post<AIConversation>('/ai/conversations/', {
      entity_type: this.entityType,
      entity_id: this.entityId,
      title: `Chat regarding this ${this.entityType}`
    }).subscribe({
      next: (conv) => {
        this.conversation.set(conv);
        this.messages.set([]);
        this.loadingConversation.set(false);
      },
      error: () => {
        this.loadingConversation.set(false);
        this.notification.error('Failed to start a new AI session');
      }
    });
  }

  sendMessage(): void {
    const text = this.messageControl.value?.trim();
    const conv = this.conversation();
    if (!text || !conv || this.sendingMessage()) return;

    this.messageControl.reset();
    this.sendingMessage.set(true);

    const tempUserMsg: AIMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    this.messages.update((msgs) => [...msgs, tempUserMsg]);
    this.scrollToBottom();

    const endpoint = `/ai/conversations/${conv.id}/messages/${this.debugMode() ? '?debug=true' : ''}`;

    this.apiService.post<AIMessage>(endpoint, {
      message: text
    }).subscribe({
      next: (aiMsg) => {
        this.messages.update((msgs) => [...msgs.filter((m) => m.id !== tempUserMsg.id), tempUserMsg, aiMsg]);
        this.sendingMessage.set(false);
        this.updateTokenCount();
        this.scrollToBottom();
      },
      error: (err) => {
        this.sendingMessage.set(false);
        this.messages.update((msgs) => msgs.filter((m) => m.id !== tempUserMsg.id));
        const msg = err.error?.error?.message || 'Failed to send message to copilot';
        this.notification.error(msg);
      }
    });
  }

  useExample(text: string): void {
    this.messageControl.setValue(text);
    this.sendMessage();
  }

  renderMarkdown(content: string): string {
    if (!content) return '';
    let html = marked.parse(content) as string;
    return html.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]+)"([^>]*)>/gi, (match, href, rest) => {
      if (!rest.includes('target=')) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`;
      }
      return match.replace(/target="[^"]*"/gi, 'target="_blank" rel="noopener noreferrer"');
    });
  }

  private updateTokenCount(): void {
    const tokens = this.messages().reduce((acc, m) => acc + (m.tokens_used || 0), 0);
    this.totalTokens.set(tokens);
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        const el = this.messageContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      } catch (err) {}
    }, 50);
  }
}
