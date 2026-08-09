import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { SequenceService } from '../services/sequence.service';
import { SequenceStore } from '../store/sequence.store';
import { SequenceEmailDraft } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    RichTextEditorComponent,
  ],
  template: `
    <div class="approvals-container">
      <div class="header-section">
        <div>
          <a routerLink="/sequences" class="back-link">
            <mat-icon class="tiny-icon">arrow_back</mat-icon> Back to Sequences
          </a>
          <h1 class="page-title">AI Draft Approval Queue</h1>
          <p class="page-subtitle">Review, edit, or regenerate AI-generated follow-up emails before explicit sending.</p>
        </div>
      </div>

      <div *ngIf="store.loading()" class="loading-state">
        <mat-icon class="spin-icon">sync</mat-icon> Loading pending drafts...
      </div>

      <div *ngIf="!store.loading() && drafts.length === 0" class="empty-card">
        <mat-icon class="empty-icon">verified</mat-icon>
        <h3>All Caught Up!</h3>
        <p>No AI email drafts are currently awaiting review. New drafts will appear here as sequence steps become due.</p>
        <a routerLink="/sequences" class="secondary-btn margin-top">View Active Sequences</a>
      </div>

      <div class="drafts-grid" *ngIf="drafts.length > 0">
        <!-- Draft Selector Column -->
        <div class="draft-list-panel">
          <div
            *ngFor="let draft of drafts"
            class="draft-item"
            [class.selected]="selectedDraft?.id === draft.id"
            (click)="selectDraft(draft)"
          >
            <div class="draft-item-header">
              <span class="contact-name">{{ draft.contact_name }}</span>
              <span class="time-ago">{{ draft.created_at | date:'shortTime' }}</span>
            </div>
            <div class="draft-seq-name">{{ draft.sequence_name }}</div>
            <div class="draft-subject-snippet">{{ draft.subject }}</div>
          </div>
        </div>

        <!-- Draft Review & Edit Panel -->
        <div class="draft-detail-panel" *ngIf="selectedDraft">
          <div class="panel-header">
            <div class="contact-info">
              <h2>{{ selectedDraft.contact_name }}</h2>
              <span class="contact-email">{{ selectedDraft.contact_email }}</span>
              <span class="seq-tag">{{ selectedDraft.sequence_name }}</span>
            </div>

            <div class="action-buttons">
              <button
                type="button"
                (click)="rejectDraft(selectedDraft)"
                [disabled]="processing"
                class="queue-btn reject-btn"
                matTooltip="Reject draft & close sequence enrollment for contact"
              >
                <mat-icon class="btn-icon">block</mat-icon>
                <span>Reject & Close</span>
              </button>

              <button
                type="button"
                (click)="regenerate(selectedDraft)"
                [disabled]="processing"
                class="queue-btn regen-btn"
                matTooltip="Regenerate draft using feedback prompt"
              >
                <mat-icon class="btn-icon">auto_fix_high</mat-icon>
                <span>Regenerate</span>
              </button>

              <button
                type="button"
                (click)="sendNow(selectedDraft)"
                [disabled]="processing"
                class="queue-btn send-now-btn"
                matTooltip="Bypass schedule and send immediately"
              >
                <mat-icon class="btn-icon">bolt</mat-icon>
                <span>Send Now</span>
              </button>

              <button
                type="button"
                (click)="approveAndSchedule(selectedDraft)"
                [disabled]="processing"
                class="queue-btn approve-btn"
              >
                <mat-icon class="btn-icon">schedule_send</mat-icon>
                <span>{{ processing ? 'Processing...' : 'Approve & Smart Schedule' }}</span>
              </button>
            </div>
          </div>

          <!-- Scheduled Status Banner if already scheduled -->
          <div class="scheduled-banner" *ngIf="selectedDraft.status === 'scheduled' || selectedDraft.scheduled_local_time" style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 0.5rem; color: #60a5fa;">
              <mat-icon>schedule</mat-icon>
              <span><strong>Scheduled Delivery:</strong> {{ selectedDraft.scheduled_local_time || selectedDraft.scheduled_at_utc }}</span>
            </div>
            <span class="badge" style="background: #1e3a8a; color: #93c5fd; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase;">{{ selectedDraft.sending_mode || 'Smart Send' }}</span>
          </div>

          <!-- AI Context Rationale Box -->
          <div class="rationale-card" *ngIf="selectedDraft.context_summary">
            <div class="rationale-header">
              <mat-icon class="ai-icon">psychology</mat-icon>
              <strong>AI Context Personalization Rationale</strong>
            </div>
            <div class="rationale-text">{{ selectedDraft.context_summary }}</div>
          </div>

          <!-- Edit Subject, Reply-To & Body -->
          <div class="editor-section">
            <div class="form-row">
              <div class="form-group flex-2">
                <label class="form-label">Subject Line</label>
                <input type="text" [(ngModel)]="selectedDraft.subject" class="form-input subject-input" />
              </div>

              <div class="form-group flex-1">
                <label class="form-label">Reply-To Email Address</label>
                <input type="email" [(ngModel)]="selectedDraft.reply_to" placeholder="user@company.com" class="form-input reply-input" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Email Message (Rich Text Formatting Enabled)</label>
              <app-rich-text-editor
                [htmlValue]="selectedDraft.body_html || selectedDraft.body_text"
                (htmlValueChange)="onBodyHtmlChange($event)"
                (textValueChange)="onBodyChange($event)"
                placeholder="Review or edit sequence email draft (supports bold, bullet lists, italics, links)..."
              ></app-rich-text-editor>
            </div>

            <!-- Optional Feedback Prompt for Regeneration -->
            <div class="regen-prompt-box">
              <label class="form-label">AI Regeneration Feedback Prompt (Optional)</label>
              <input
                type="text"
                [(ngModel)]="feedbackPrompt"
                placeholder="e.g. Make it shorter, emphasize our 20% discount..."
                class="form-input"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .approvals-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      color: #94a3b8;
      font-size: 0.85rem;
      text-decoration: none;
      margin-bottom: 0.25rem;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
    }

    .page-subtitle {
      font-size: 0.9rem;
      color: #94a3b8;
      margin: 0;
    }

    .drafts-grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 1.5rem;
      min-height: 500px;
    }

    .draft-list-panel {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      overflow-y: auto;
      max-height: 700px;
    }

    .draft-item {
      padding: 0.85rem 1rem;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      cursor: pointer;
      transition: all 0.2s;
    }

    .draft-item:hover { background: rgba(255, 255, 255, 0.05); }

    .draft-item.selected {
      background: rgba(59, 130, 246, 0.15);
      border-color: #3b82f6;
    }

    .draft-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.2rem;
    }

    .contact-name {
      font-weight: 700;
      color: #f8fafc;
      font-size: 0.9rem;
    }

    .time-ago {
      font-size: 0.75rem;
      color: #64748b;
    }

    .draft-seq-name {
      font-size: 0.75rem;
      color: #60a5fa;
      margin-bottom: 0.3rem;
    }

    .draft-subject-snippet {
      font-size: 0.8rem;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .draft-detail-panel {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 1rem;
    }

    .contact-info h2 {
      margin: 0;
      color: #f8fafc;
      font-size: 1.25rem;
    }

    .contact-email {
      font-size: 0.85rem;
      color: #94a3b8;
      margin-right: 0.75rem;
    }

    .seq-tag {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .action-buttons {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: nowrap;
    }

    .queue-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.45rem !important;
      height: 40px !important;
      padding: 0 1rem !important;
      border-radius: 8px !important;
      font-size: 8px !important;
      font-weight: 600 !important;
      white-space: nowrap !important;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s ease-in-out;
      outline: none;
      line-height: 1;
    }

    .queue-btn span {
      white-space: nowrap;
      display: inline-block;
      line-height: 1;
    }

    .queue-btn .btn-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 !important;
      padding: 0 !important;
      line-height: 1 !important;
    }

    .reject-btn {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.35);
      color: #f87171;
    }
    .reject-btn:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.25);
      border-color: #ef4444;
      color: #ffffff;
    }

    .regen-btn {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.35);
      color: #fbbf24;
    }
    .regen-btn:hover:not(:disabled) {
      background: rgba(245, 158, 11, 0.25);
      border-color: #f59e0b;
      color: #ffffff;
    }

    .send-now-btn {
      background: rgba(59, 130, 246, 0.15);
      border-color: rgba(59, 130, 246, 0.35);
      color: #60a5fa;
    }
    .send-now-btn:hover:not(:disabled) {
      background: rgba(59, 130, 246, 0.25);
      border-color: #3b82f6;
      color: #ffffff;
    }

    .approve-btn {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-color: #10b981;
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
    }
    .approve-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
    }

    .queue-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Light Theme Overrides for Action Buttons */
    :host-context(body.light-theme) .reject-btn {
      background: #fef2f2 !important;
      border-color: #fca5a5 !important;
      color: #dc2626 !important;
    }
    :host-context(body.light-theme) .reject-btn:hover:not(:disabled) {
      background: #fee2e2 !important;
      border-color: #ef4444 !important;
      color: #b91c1c !important;
    }

    :host-context(body.light-theme) .regen-btn {
      background: #fffbe6 !important;
      border-color: #fde68a !important;
      color: #b45309 !important;
    }
    :host-context(body.light-theme) .regen-btn:hover:not(:disabled) {
      background: #fef3c7 !important;
      border-color: #f59e0b !important;
      color: #92400e !important;
    }

    :host-context(body.light-theme) .send-now-btn {
      background: #eff6ff !important;
      border-color: #bfdbfe !important;
      color: #2563eb !important;
    }
    :host-context(body.light-theme) .send-now-btn:hover:not(:disabled) {
      background: #dbeafe !important;
      border-color: #3b82f6 !important;
      color: #1d4ed8 !important;
    }

    :host-context(body.light-theme) .approve-btn {
      background: linear-gradient(135deg, #10b981 0%, #047857 100%) !important;
      border-color: #059669 !important;
      color: #ffffff !important;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.2) !important;
    }
    :host-context(body.light-theme) .approve-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #059669 0%, #065f46 100%) !important;
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3) !important;
    }

    .rationale-card {
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 8px;
      padding: 0.85rem 1rem;
    }

    .rationale-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: #c084fc;
      font-size: 0.85rem;
      margin-bottom: 0.3rem;
    }

    .tiny-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .page-title { color: #0f172a; }
    :host-context(body.light-theme) .page-subtitle { color: #334155; }
    :host-context(body.light-theme) .back-link { color: #475569; }
    :host-context(body.light-theme) .draft-list-panel { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .draft-item { background: #f8fafc; border-color: #cbd5e1; }
    :host-context(body.light-theme) .draft-item:hover { background: #f1f5f9; }
    :host-context(body.light-theme) .draft-item.selected { background: #eff6ff; border-color: #3b82f6; }
    :host-context(body.light-theme) .contact-name { color: #0f172a; }
    :host-context(body.light-theme) .time-ago { color: #475569; }
    :host-context(body.light-theme) .draft-subject-snippet { color: #334155; }
    :host-context(body.light-theme) .draft-detail-panel { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .panel-header { border-bottom-color: #e2e8f0; }
    :host-context(body.light-theme) .contact-info h2 { color: #0f172a; }
    :host-context(body.light-theme) .contact-email { color: #475569; }
    :host-context(body.light-theme) .form-label { color: #000000 !important; font-weight: 700; }
    :host-context(body.light-theme) .form-input,
    :host-context(body.light-theme) .form-textarea { background: #f8fafc; border-color: #cbd5e1; color: #0f172a; }
    :host-context(body.light-theme) .rationale-card { background: #f3e8ff; border-color: #d8b4fe; }
    :host-context(body.light-theme) .rationale-header { color: #7e22ce; }
    :host-context(body.light-theme) .rationale-text { color: #3b0764; }
    :host-context(body.light-theme) .regen-prompt-box { background: #f8fafc; border-color: #cbd5e1; }
    :host-context(body.light-theme) .empty-card { background: #ffffff; border-color: #cbd5e1; color: #475569; }
    :host-context(body.light-theme) .secondary-btn { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }

    .ai-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .rationale-text {
      color: #e9d5ff;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .editor-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-row {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .flex-1 { flex: 1; min-width: 200px; }
    .flex-2 { flex: 2; min-width: 280px; }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #94a3b8;
    }

    .form-input, .form-textarea {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      color: #f8fafc;
      font-size: 0.9rem;
      outline: none;
    }

    .form-input:focus, .form-textarea:focus { border-color: #3b82f6; }

    .subject-input { font-weight: 600; }
    .body-input { line-height: 1.5; font-family: inherit; }

    .regen-prompt-box {
      margin-top: 0.5rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px dashed rgba(255, 255, 255, 0.1);
      padding: 0.85rem;
      border-radius: 8px;
    }

    .empty-card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 4rem 2rem;
      text-align: center;
      color: #64748b;
    }

    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #10b981;
      margin-bottom: 1rem;
    }

    .secondary-btn {
      display: inline-block;
      background: rgba(255, 255, 255, 0.05);
      color: #e2e8f0;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
    }

    .btn-icon, .tiny-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .margin-top { margin-top: 1rem; }
  `]
})
export class ApprovalQueueComponent implements OnInit {
  readonly store = inject(SequenceStore);
  private readonly service = inject(SequenceService);
  private readonly dialog = inject(MatDialog);

  drafts: SequenceEmailDraft[] = [];
  selectedDraft: SequenceEmailDraft | null = null;
  feedbackPrompt = '';
  processing = false;

  ngOnInit(): void {
    this.loadQueue();
  }

  loadQueue(): void {
    this.service.getApprovalQueue().subscribe((res) => {
      this.drafts = res.results || [];
      if (this.drafts.length > 0) {
        this.selectedDraft = { ...this.drafts[0] };
      } else {
        this.selectedDraft = null;
      }
    });
  }

  selectDraft(draft: SequenceEmailDraft): void {
    this.selectedDraft = { ...draft };
    this.feedbackPrompt = '';
  }

  onBodyHtmlChange(newHtml: string): void {
    if (this.selectedDraft) {
      this.selectedDraft.body_html = newHtml;
    }
  }

  onBodyChange(newText: string): void {
    if (this.selectedDraft) {
      this.selectedDraft.body_text = newText;
      if (!this.selectedDraft.body_html) {
        const htmlParagraphs = newText
          .split('\n\n')
          .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
          .join('');
        this.selectedDraft.body_html = htmlParagraphs;
      }
    }
  }

  approveAndSchedule(draft: SequenceEmailDraft): void {
    if (!draft) return;
    this.processing = true;

    const payload = {
      subject: draft.subject,
      reply_to: draft.reply_to,
      body_text: draft.body_text,
      body_html: draft.body_html || draft.body_text,
      send_mode: 'smart_send',
    };

    this.service.approveDraft(draft.id, payload).subscribe({
      next: () => {
        this.processing = false;
        this.loadQueue();
        this.store.loadApprovalQueue();
      },
      error: () => (this.processing = false)
    });
  }

  sendNow(draft: SequenceEmailDraft): void {
    if (!draft) return;
    this.processing = true;

    this.service.sendNowDraft(draft.id).subscribe({
      next: () => {
        this.processing = false;
        this.loadQueue();
        this.store.loadApprovalQueue();
      },
      error: () => (this.processing = false)
    });
  }

  rejectDraft(draft: SequenceEmailDraft): void {
    if (!draft) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: {
        title: 'Reject Draft & Close Sequence',
        message: `Are you sure you want to reject this draft and stop the sequence for ${draft.contact_name}? No further automated emails or tasks will be generated.`,
        confirmText: 'Reject & Close Sequence'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.processing = true;
        this.service.rejectDraft(draft.id, 'Task completed / rejected via Approval Queue', true).subscribe({
          next: () => {
            this.processing = false;
            this.loadQueue();
            this.store.loadApprovalQueue();
          },
          error: () => (this.processing = false)
        });
      }
    });
  }

  regenerate(draft: SequenceEmailDraft): void {
    if (!draft) return;
    this.processing = true;

    this.service.regenerateDraft(draft.id, this.feedbackPrompt).subscribe({
      next: (updated) => {
        this.processing = false;
        this.selectedDraft = updated;
      },
      error: () => (this.processing = false)
    });
  }
}
