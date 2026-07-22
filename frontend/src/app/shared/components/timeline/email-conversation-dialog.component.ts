import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-email-conversation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <div class="title-area">
          <mat-icon class="header-icon">email</mat-icon>
          <div>
            <h2 mat-dialog-title class="dialog-title">{{ thread()?.subject || 'Email Conversation' }}</h2>
            <p class="subtitle" *ngIf="thread()">
              Participants: {{ thread()?.participants?.join(', ') }}
            </p>
          </div>
        </div>
        <button mat-icon-button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content class="dialog-content">
        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Loading email thread...</p>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <mat-icon class="error-icon">error_outline</mat-icon>
            <p>{{ error() }}</p>
          </div>
        } @else if (thread()) {
          <div class="messages-list">
            @for (msg of thread()?.messages; track msg.id) {
              <div class="message-card" [class.outgoing]="msg.direction === 'outgoing'">
                <div class="message-header">
                  <div class="sender-info">
                    <span class="sender-avatar">
                      {{ (msg.sender || 'U').charAt(0).toUpperCase() }}
                    </span>
                    <div class="sender-details">
                      <span class="sender-name">{{ msg.sender }}</span>
                      <span class="recipients">to {{ msg.recipients?.join(', ') }}</span>
                      @if (msg.cc?.length) {
                        <span class="cc-list">cc: {{ msg.cc?.join(', ') }}</span>
                      }
                    </div>
                  </div>
                  <div class="meta-info">
                    <span class="direction-badge" [ngClass]="msg.direction">
                      {{ msg.direction === 'outgoing' ? 'Sent' : 'Received' }}
                    </span>
                    <span class="message-time">
                      {{ msg.internal_date | date:'medium' }}
                    </span>
                  </div>
                </div>

                <div class="message-body">
                  @if (msg.plain_text_body) {
                    <div class="text-body">{{ msg.plain_text_body }}</div>
                  } @else if (msg.html_body) {
                    <iframe [srcdoc]="msg.html_body" class="html-body-frame" sandbox="allow-same-origin"></iframe>
                  } @else {
                    <div class="empty-body"><em>No message content.</em></div>
                  }
                </div>

                @if (msg.attachments?.length) {
                  <div class="attachments-section">
                    <span class="attach-title">
                      <mat-icon>attach_file</mat-icon> Attachments ({{ msg.attachments.length }})
                    </span>
                    <div class="attachments-grid">
                      @for (att of msg.attachments; track att.id) {
                        <div class="attachment-chip" title="File attachment">
                          <mat-icon class="att-icon">insert_drive_file</mat-icon>
                          <div class="att-info">
                            <span class="att-name">{{ att.filename }}</span>
                            <span class="att-size">{{ formatBytes(att.size) }}</span>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        @if (thread()) {
          <button type="button" mat-stroked-button (click)="reply(true)" class="reply-ai-btn">
            <mat-icon style="color: #8b5cf6; font-size: 16px; width: 16px; height: 16px;">auto_awesome</mat-icon>
            <span>Reply with AI</span>
          </button>
          <button type="button" mat-stroked-button (click)="reply(false)" class="reply-custom-btn">
            <mat-icon style="color: #3b82f6; font-size: 16px; width: 16px; height: 16px;">reply</mat-icon>
            <span>Reply</span>
          </button>
        }
        <button mat-button (click)="close()">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      width: 100%;
      box-sizing: border-box;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    .title-area {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .header-icon {
      color: #3b82f6;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .dialog-title {
      font-size: 1.2rem;
      font-weight: 700;
      margin: 0 !important;
      padding: 0 !important;
      line-height: 1.2;
    }

    .subtitle {
      color: #64748b;
      font-size: 0.75rem;
      margin: 0.25rem 0 0 0;
      max-width: 500px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .close-btn {
      color: #94a3b8;
    }

    .dialog-content {
      padding: 1.25rem 1.5rem !important;
      margin: 0;
      flex: 1;
      overflow-y: auto;
      max-height: 60vh;
    }

    .loading-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 0;
      color: #94a3b8;
      gap: 1rem;
    }

    .error-state { color: #f87171; }
    .error-icon { font-size: 40px; width: 40px; height: 40px; }

    .messages-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .message-card {
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 10px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .message-card.outgoing {
      background: rgba(59, 130, 246, 0.04);
      border-color: rgba(59, 130, 246, 0.2);
    }

    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      padding-bottom: 0.6rem;
      flex-wrap: wrap;
    }

    .sender-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .sender-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: #3b82f6;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
    }

    .message-card.outgoing .sender-avatar {
      background-color: #10b981;
    }

    .sender-details {
      display: flex;
      flex-direction: column;
    }

    .sender-name {
      font-weight: 600;
      font-size: 0.85rem;
    }

    .recipients, .cc-list {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .meta-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
    }

    .direction-badge {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .direction-badge.incoming {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }

    .direction-badge.outgoing {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }

    .message-time {
      font-size: 0.72rem;
      color: #64748b;
    }

    .message-body {
      font-size: 0.85rem;
      line-height: 1.5;
    }

    .text-body {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .html-body-frame {
      width: 100%;
      min-height: 140px;
      border: none;
      background: transparent;
    }

    .attachments-section {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid rgba(0,0,0,0.06);
    }

    .attach-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .attachments-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.4rem;
    }

    .attachment-chip {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(0,0,0,0.04);
      border: 1px solid rgba(0,0,0,0.08);
      padding: 0.35rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
    }

    .dialog-actions {
      padding: 0.75rem 1.5rem !important;
      border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .reply-ai-btn {
      color: #8b5cf6 !important;
      border-color: rgba(139, 92, 246, 0.3) !important;
    }

    .reply-custom-btn {
      color: #3b82f6 !important;
      border-color: rgba(59, 130, 246, 0.3) !important;
    }
  `]
})
export class EmailConversationDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<EmailConversationDialogComponent>);
  private readonly apiService = inject(ApiService);

  readonly thread = signal<any | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(@Inject(MAT_DIALOG_DATA) public data: { threadId: string }) {}

  ngOnInit(): void {
    if (this.data.threadId) {
      this.loadThread(this.data.threadId);
    } else {
      this.loading.set(false);
      this.error.set('Thread identifier was not provided.');
    }
  }

  loadThread(id: string): void {
    this.loading.set(true);
    this.apiService.get<any>(`/emails/threads/${id}/`).subscribe({
      next: (res) => {
        this.thread.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Failed to load full conversation details.');
      }
    });
  }

  reply(isAI: boolean): void {
    this.dialogRef.close({
      action: 'reply',
      thread: this.thread(),
      isAI
    });
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  close(): void {
    this.dialogRef.close();
  }
}
