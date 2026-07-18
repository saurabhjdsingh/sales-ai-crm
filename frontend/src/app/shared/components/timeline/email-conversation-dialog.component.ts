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
    <div class="dialog-container dark-theme">
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
                      {{ msg.sender.charAt(0).toUpperCase() }}
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
                    <!-- Safe preview fallback using srcdoc iframe or simple text conversion -->
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
                        <div class="attachment-chip" title="File downloading can be implemented later">
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
        <button mat-flat-button color="primary" (click)="close()">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      background-color: #0b1329;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      border-radius: 12px;
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background-color: #090f1f;
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
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
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
      padding: 1.5rem !important;
      margin: 0;
      flex: 1;
      overflow-y: auto;
      max-height: 60vh;
      background-color: #090f1f;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 0;
      color: #94a3b8;
      gap: 1rem;
    }

    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 0;
      color: #f87171;
      gap: 1rem;
    }

    .error-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
    }

    .messages-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .message-card {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .message-card.outgoing {
      background: rgba(59, 130, 246, 0.02);
      border-color: rgba(59, 130, 246, 0.1);
    }

    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      padding-bottom: 0.75rem;
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
      font-size: 0.875rem;
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
      color: #f8fafc;
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
      gap: 0.35rem;
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
      color: #60a5fa;
    }

    .direction-badge.outgoing {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
    }

    .message-time {
      font-size: 0.75rem;
      color: #64748b;
    }

    .message-body {
      color: #cbd5e1;
      font-size: 0.875rem;
      line-height: 1.6;
    }

    .text-body {
      white-space: pre-wrap;
    }

    .html-body-frame {
      width: 100%;
      height: 250px;
      border: none;
      background: #ffffff;
      border-radius: 6px;
    }

    .attachments-section {
      border-top: 1px solid rgba(255, 255, 255, 0.03);
      padding-top: 0.75rem;
      margin-top: 0.25rem;
    }

    .attach-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .attach-title mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .attachments-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .attachment-chip {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 0.35rem 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      max-width: 250px;
      cursor: not-allowed;
    }

    .att-icon {
      color: #94a3b8;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .att-info {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .att-name {
      font-size: 0.75rem;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .att-size {
      font-size: 0.65rem;
      color: #64748b;
    }

    .dialog-actions {
      padding: 1rem 1.5rem !important;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      background-color: #0b1329;
    }

    /* ===== Light Theme Overrides ===== */
    :host-context(body.light-theme) .dialog-container {
      background-color: #ffffff;
      color: #1e293b;
    }

    :host-context(body.light-theme) .dialog-header {
      background-color: #f8fafc;
      border-bottom-color: rgba(0, 0, 0, 0.08);
    }

    :host-context(body.light-theme) .dialog-title {
      color: #0f172a;
    }

    :host-context(body.light-theme) .subtitle {
      color: #64748b;
    }

    :host-context(body.light-theme) .close-btn {
      color: #475569;
    }

    :host-context(body.light-theme) .dialog-content {
      background-color: #ffffff;
    }

    :host-context(body.light-theme) .loading-state {
      color: #64748b;
    }

    :host-context(body.light-theme) .message-card {
      background: #f8fafc;
      border-color: rgba(0, 0, 0, 0.08);
    }

    :host-context(body.light-theme) .message-card.outgoing {
      background: rgba(59, 130, 246, 0.04);
      border-color: rgba(59, 130, 246, 0.15);
    }

    :host-context(body.light-theme) .message-header {
      border-bottom-color: rgba(0, 0, 0, 0.06);
    }

    :host-context(body.light-theme) .sender-name {
      color: #0f172a;
    }

    :host-context(body.light-theme) .recipients,
    :host-context(body.light-theme) .cc-list {
      color: #64748b;
    }

    :host-context(body.light-theme) .message-time {
      color: #64748b;
    }

    :host-context(body.light-theme) .message-body {
      color: #334155;
    }

    :host-context(body.light-theme) .attachments-section {
      border-top-color: rgba(0, 0, 0, 0.06);
    }

    :host-context(body.light-theme) .attachment-chip {
      background: #f1f5f9;
      border-color: rgba(0, 0, 0, 0.08);
    }

    :host-context(body.light-theme) .att-icon {
      color: #64748b;
    }

    :host-context(body.light-theme) .att-name {
      color: #334155;
    }

    :host-context(body.light-theme) .att-size {
      color: #94a3b8;
    }

    :host-context(body.light-theme) .dialog-actions {
      background-color: #f8fafc;
      border-top-color: rgba(0, 0, 0, 0.08);
    }
  `]
})
export class EmailConversationDialogComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly dialogRef = inject(MatDialogRef<EmailConversationDialogComponent>);

  readonly thread = signal<any>(null);
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
