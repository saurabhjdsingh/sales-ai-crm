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
                <li (click)="useExample('Should we pursue this company?')">"Should we pursue this company?"</li>
                <li (click)="useExample('Write a personalized follow-up email')">"Write a personalized follow-up email"</li>
                <li (click)="useExample('Identify potential buying signals and objections')">"Identify potential objections"</li>
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
    }

    .action-btn:hover {
      color: #3b82f6 !important;
      background-color: rgba(255, 255, 255, 0.05) !important;
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
      max-width: 85%;
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

    // Try to find existing conversation for this entity
    this.apiService.get<any>('/ai/conversations/', {
      entity_type: this.entityType,
      entity_id: this.entityId
    }).subscribe({
      next: (res) => {
        if (res.results && res.results.length > 0) {
          // Load details of the first conversation found
          this.loadConversation(res.results[0].id);
        } else {
          // Create new conversation
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
    this.apiService.get<AIConversation>(`/ai/conversations/${id}/`).subscribe({
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

    // Optimistically add user message to list
    const tempUserMsg: AIMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    this.messages.update((msgs) => [...msgs, tempUserMsg]);
    this.scrollToBottom();

    this.apiService.post<AIMessage>(`/ai/conversations/${conv.id}/messages/`, {
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
    return marked.parse(content) as string;
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
