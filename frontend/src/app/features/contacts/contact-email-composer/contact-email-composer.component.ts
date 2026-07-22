import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Contact, EmailThread } from '../../../core/models/crm.model';

export interface ContactEmailComposerData {
  contact: Contact;
  thread?: EmailThread;
  initialPrompt?: string;
}

@Component({
  selector: 'app-contact-email-composer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="composer-container">
      <!-- Header -->
      <div class="composer-header">
        <div class="header-info">
          <div class="title-row">
            <h2>{{ isReply ? 'Reply to Email Thread' : 'Compose Email Outreach' }}</h2>
            <span class="contact-tag">{{ data.contact.full_name }} ({{ data.contact.email }})</span>
          </div>
          <p class="subtitle">{{ isReply ? 'Reply directly to email thread' : 'Send direct 1-to-1 outreach email' }}</p>
        </div>

        <div class="header-badges">
          @if (mailboxStatus().loading) {
            <span class="status-badge checking">
              <mat-spinner diameter="12"></mat-spinner> Checking Mailbox...
            </span>
          } @else if (mailboxStatus().connected) {
            <span class="status-badge connected" title="Sending via connected {{ mailboxStatus().email }}">
              <mat-icon class="badge-icon">check_circle</mat-icon> {{ mailboxStatus().email }}
            </span>
          } @else {
            <span class="status-badge disconnected">
              <mat-icon class="badge-icon">warning</mat-icon> Mailbox Disconnected
            </span>
          }
        </div>
      </div>

      <!-- Mailbox Disconnected Warning Banner -->
      @if (!mailboxStatus().loading && !mailboxStatus().connected) {
        <div class="warning-banner">
          <mat-icon class="warn-icon">error_outline</mat-icon>
          <div class="warn-text">
            <strong>No active Gmail or Mailbox account connected.</strong>
            <span>Please connect your Gmail/Outlook account in Integrations Settings before sending emails. CRM platform SMTP will not be used for contact outreach.</span>
          </div>
        </div>
      }

      <div class="composer-body">
        <!-- AI Prompt Box -->
        <div class="ai-prompt-card">
          <div class="prompt-header">
            <mat-icon class="ai-sparkle">auto_awesome</mat-icon>
            <strong>Generate Draft with AI</strong>
          </div>
          <div class="prompt-input-row">
            <input
              type="text"
              [(ngModel)]="aiPrompt"
              placeholder="e.g. Write a friendly check-in email about our proposal pricing..."
              class="prompt-input"
              (keyup.enter)="generateAIDraft()"
            />
            <button
              type="button"
              (click)="generateAIDraft()"
              [disabled]="generatingAI() || !aiPrompt.trim()"
              class="generate-btn"
            >
              @if (generatingAI()) {
                <mat-spinner diameter="16"></mat-spinner>
                <span>Generating...</span>
              } @else {
                <mat-icon class="btn-icon">auto_fix_high</mat-icon>
                <span>Generate</span>
              }
            </button>
          </div>

          @if (contextSummary()) {
            <div class="rationale-box">
              <mat-icon class="rationale-icon">psychology</mat-icon>
              <span>{{ contextSummary() }}</span>
            </div>
          }
        </div>

        <!-- Editor Form -->
        <div class="editor-card">
          <div class="form-row">
            <div class="form-group flex-2">
              <label class="form-label">Subject Line</label>
              <input type="text" [(ngModel)]="subject" class="form-input" placeholder="Subject..." />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Reply-To Address</label>
              <input type="email" [(ngModel)]="replyTo" class="form-input" placeholder="user@company.com" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Email Message (Plain Text / HTML)</label>
            <textarea
              [ngModel]="bodyText"
              (ngModelChange)="onBodyTextChange($event)"
              rows="8"
              class="form-textarea"
              placeholder="Write your email message..."
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Dialog Actions -->
      <div class="composer-actions">
        <button type="button" (click)="close()" class="cancel-btn">Cancel</button>
        <button
          type="button"
          (click)="sendEmail()"
          [disabled]="sending() || !subject.trim() || !bodyText.trim() || !mailboxStatus().connected"
          class="send-btn"
        >
          @if (sending()) {
            <mat-spinner diameter="18"></mat-spinner>
            <span>Sending Email...</span>
          } @else {
            <mat-icon class="btn-icon">send</mat-icon>
            <span>Send Email</span>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .composer-container {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      width: 100%;
      box-sizing: border-box;
    }

    .composer-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      padding-bottom: 1rem;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    h2 {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0;
    }

    .contact-tag {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .subtitle {
      font-size: 0.85rem;
      color: #64748b;
      margin: 0.2rem 0 0 0;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.3rem 0.64rem;
      border-radius: 6px;
    }
    .status-badge.checking { background: rgba(148, 163, 184, 0.15); color: #64748b; }
    .status-badge.connected { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-badge.disconnected { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-icon { font-size: 14px; width: 14px; height: 14px; }

    .warning-banner {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      color: #ef4444;
      font-size: 0.82rem;
    }
    .warn-icon { color: #ef4444; font-size: 20px; width: 20px; height: 20px; }
    .warn-text { display: flex; flex-direction: column; gap: 0.2rem; }

    .composer-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .ai-prompt-card {
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .prompt-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: #8b5cf6;
      font-size: 0.85rem;
    }
    .ai-sparkle { color: #8b5cf6; font-size: 18px; width: 18px; height: 18px; }

    .prompt-input-row {
      display: flex;
      gap: 0.5rem;
    }

    .prompt-input {
      flex: 1;
      background: rgba(0, 0, 0, 0.04);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      font-family: inherit;
    }
    .prompt-input:focus { border-color: #8b5cf6; outline: none; }

    .generate-btn {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.5rem 1rem;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s;
    }
    .generate-btn:hover:not(:disabled) { opacity: 0.9; }
    .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .rationale-box {
      font-size: 0.78rem;
      color: #7c3aed;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(139, 92, 246, 0.08);
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
    }
    .rationale-icon { font-size: 16px; width: 16px; height: 16px; color: #8b5cf6; }

    .editor-card {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .form-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .flex-2 { flex: 2; min-width: 200px; }
    .flex-1 { flex: 1; min-width: 150px; }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .form-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: #64748b;
    }

    .form-input, .form-textarea {
      background: rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 6px;
      padding: 0.6rem 0.75rem;
      font-size: 0.85rem;
      font-family: inherit;
    }
    .form-input:focus, .form-textarea:focus { border-color: #3b82f6; outline: none; }

    .composer-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      padding-top: 1rem;
    }

    .cancel-btn {
      background: transparent;
      border: 1px solid rgba(0, 0, 0, 0.15);
      color: #64748b;
      padding: 0.55rem 1.1rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .cancel-btn:hover { background: rgba(0, 0, 0, 0.05); }

    .send-btn {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.55rem 1.2rem;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .send-btn:hover:not(:disabled) { opacity: 0.9; }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-icon { font-size: 18px; width: 18px; height: 18px; }
  `]
})
export class ContactEmailComposerComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<ContactEmailComposerComponent>);
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);

  @Inject(MAT_DIALOG_DATA) public readonly data: ContactEmailComposerData = inject(MAT_DIALOG_DATA);

  aiPrompt = '';
  subject = '';
  replyTo = '';
  bodyText = '';
  bodyHtml = '';
  contextSummary = signal<string>('');

  isReply = false;
  generatingAI = signal<boolean>(false);
  sending = signal<boolean>(false);
  mailboxStatus = signal<{ loading: boolean; connected: boolean; email?: string }>({ loading: true, connected: false });

  ngOnInit(): void {
    if (this.data.initialPrompt) {
      this.aiPrompt = this.data.initialPrompt;
    }
    if (this.data.thread) {
      this.isReply = true;
      const sub = this.data.thread.subject || '';
      this.subject = sub.toLowerCase().startsWith('re:') ? sub : `Re: ${sub}`;
    }

    this.checkMailboxStatus();
  }

  accounts = signal<any[]>([]);
  selectedAccountId = signal<string | undefined>(undefined);

  checkMailboxStatus(): void {
    this.apiService.get<any>('/emails/account/').subscribe({
      next: (res) => {
        if (res && res.connected) {
          const list = res.accounts || [];
          this.accounts.set(list);
          const sec = res.secondary_account || list.find((a: any) => a.account_role === 'secondary_outbound');
          const prim = res.primary_account || list.find((a: any) => a.account_role === 'primary');

          if (sec) {
            this.selectedAccountId.set(sec.id);
          } else if (prim) {
            this.selectedAccountId.set(prim.id);
          } else if (list.length > 0) {
            this.selectedAccountId.set(list[0].id);
          }

          if (prim && !this.replyTo) {
            this.replyTo = prim.email;
          }

          const activeEmail = sec?.email || prim?.email || res.email;
          this.mailboxStatus.set({ loading: false, connected: true, email: activeEmail });
        } else {
          this.mailboxStatus.set({ loading: false, connected: false });
        }
      },
      error: () => {
        this.mailboxStatus.set({ loading: false, connected: false });
      }
    });
  }

  generateAIDraft(): void {
    if (!this.aiPrompt.trim()) return;
    this.generatingAI.set(true);

    const payload = {
      contact_id: this.data.contact.id,
      prompt: this.aiPrompt,
      thread_id: this.data.thread?.id
    };

    this.apiService.post<any>('/emails/generate-draft/', payload).subscribe({
      next: (res) => {
        this.generatingAI.set(false);
        if (res) {
          this.subject = res.subject || this.subject;
          this.bodyText = res.body_text || '';
          this.bodyHtml = res.body_html || '';
          this.replyTo = res.reply_to || this.replyTo;
          this.contextSummary.set(res.context_summary || '');
        }
      },
      error: (err) => {
        this.generatingAI.set(false);
        this.notification.error(err.error?.message || 'Failed to generate AI draft');
      }
    });
  }

  onBodyTextChange(newText: string): void {
    this.bodyText = newText;
    this.bodyHtml = newText.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  sendEmail(): void {
    if (!this.mailboxStatus().connected) {
      this.notification.error('No connected Gmail or Mailbox account. Please connect your mailbox in Settings.');
      return;
    }

    this.sending.set(true);
    const payload = {
      contact_id: this.data.contact.id,
      account_id: this.selectedAccountId(),
      subject: this.subject,
      body_text: this.bodyText,
      body_html: this.bodyHtml || this.bodyText.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''),
      reply_to: this.replyTo,
      thread_id: this.data.thread?.id
    };

    this.apiService.post<any>('/emails/send-contact-email/', payload).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.notification.success('Email sent successfully!');
        this.dialogRef.close(res);
      },
      error: (err) => {
        this.sending.set(false);
        const errMsg = err.error?.error?.message || err.error?.message || 'Failed to send email';
        this.notification.error(errMsg);
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
