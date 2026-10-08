import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MeetingService } from '../../core/services/meeting.service';
import { NotificationService } from '../../core/services/notification.service';
import { Meeting, MeetingActionItem, MeetingAnalysis } from '../../core/models/crm.model';

export interface MeetingIntelligenceDialogData {
  meeting: Meeting;
}

@Component({
  selector: 'app-meeting-intelligence-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
  ],
  template: `
    <div class="intelligence-dialog-container">
      <div class="dialog-header">
        <div class="header-left">
          <div class="icon-avatar">
            <mat-icon>psychology</mat-icon>
          </div>
          <div>
            <div class="title-row">
              <h2>Post-Meeting Intelligence</h2>
              <span class="status-badge" [ngClass]="meeting().status">{{ meeting().status | uppercase }}</span>
              @if (meeting().is_finished) {
                <span class="finished-pill">CONCLUDED</span>
              }
            </div>
            <p class="subtitle">{{ meeting().title }} · {{ meeting().start_time | date:'mediumDate' }}</p>
          </div>
        </div>
        <button mat-icon-button (click)="dialogRef.close()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- CRM Link Context Banner -->
      <div class="crm-context-banner">
        <div class="context-item">
          <span class="ctx-label">Company:</span>
          @if (meeting().company_name) {
            <span class="ctx-badge company">
              <mat-icon>business</mat-icon> {{ meeting().company_name }}
            </span>
          } @else {
            <span class="ctx-empty">Unlinked</span>
          }
        </div>
        <div class="context-item">
          <span class="ctx-label">Contact:</span>
          @if (meeting().contact_name) {
            <span class="ctx-badge contact">
              <mat-icon>person</mat-icon> {{ meeting().contact_name }}
            </span>
          } @else {
            <span class="ctx-empty">Unlinked</span>
          }
        </div>
        <div class="context-tip">
          <mat-icon>sync</mat-icon>
          <span>All notes and AI takeaways sync directly to the CRM timeline</span>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        <mat-tab-group animationDuration="200ms" class="intelligence-tabs">
          <!-- ─── TAB 1: NOTES ─── -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">edit_note</mat-icon>
              <span>Meeting Notes</span>
            </ng-template>
            <div class="tab-pane">
              <div class="pane-header">
                <p class="pane-desc">Record conversation notes, decision minutes, and manual observations.</p>
              </div>
              <mat-form-field appearance="outline" class="notes-field">
                <mat-label>Meeting Notes & Minutes</mat-label>
                <textarea
                  matInput
                  [(ngModel)]="notesContent"
                  rows="7"
                  placeholder="e.g. Discussed proposal timeline, security review requested by prospect, agreed on follow-up next Tuesday..."
                ></textarea>
              </mat-form-field>
            </div>
          </mat-tab>

          <!-- ─── TAB 2: TRANSCRIPT ─── -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">record_voice_over</mat-icon>
              <span>Transcript Ingestion</span>
            </ng-template>
            <div class="tab-pane">
              <div class="pane-header">
                <p class="pane-desc">Paste conversation transcripts from Google Meet, Zoom, Otter, Fireflies, or Grain.</p>
                <div class="char-counter">
                  <span>{{ transcriptContent.length | number }} characters</span>
                </div>
              </div>
              <mat-form-field appearance="outline" class="notes-field">
                <mat-label>Raw Meeting Transcript</mat-label>
                <textarea
                  matInput
                  [(ngModel)]="transcriptContent"
                  rows="7"
                  placeholder="Paste conversation transcript here with speaker names and timestamps..."
                ></textarea>
              </mat-form-field>
            </div>
          </mat-tab>

          <!-- ─── TAB 3: AI ANALYSIS ─── -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon ai-star">auto_awesome</mat-icon>
              <span>AI Executive Analysis</span>
            </ng-template>
            <div class="tab-pane">
              <div class="ai-trigger-banner">
                <div class="trigger-info">
                  <h4>Sales AI Executive Distillation</h4>
                  <p>Analyzes your notes and transcript to extract decisions, sentiment, objections, and action items.</p>
                </div>
                <button
                  mat-flat-button
                  color="primary"
                  class="analyze-btn"
                  (click)="generateAIAnalysis()"
                  [disabled]="analyzing() || (!notesContent.trim() && !transcriptContent.trim())"
                >
                  @if (analyzing()) {
                    <mat-spinner diameter="18"></mat-spinner>
                    <span>Extracting Insights...</span>
                  } @else {
                    <mat-icon>auto_awesome</mat-icon>
                    <span>{{ analysis()?.summary ? 'Re-Analyze with AI' : 'Generate AI Analysis' }}</span>
                  }
                </button>
              </div>

              @if (analysis(); as ai) {
                <div class="analysis-results">
                  <!-- Executive Summary -->
                  <div class="analysis-card summary-card">
                    <div class="card-title">
                      <mat-icon>summarize</mat-icon>
                      <h4>Executive Summary</h4>
                      @if (ai.sentiment) {
                        <span class="sentiment-pill" [ngClass]="getSentimentClass(ai.sentiment)">
                          {{ ai.sentiment }}
                        </span>
                      }
                    </div>
                    <p class="summary-text">{{ ai.summary }}</p>
                  </div>

                  <!-- Key Takeaways -->
                  @if (ai.key_takeaways?.length) {
                    <div class="analysis-card">
                      <div class="card-title">
                        <mat-icon>check_circle</mat-icon>
                        <h4>Key Decisions & Highlights</h4>
                      </div>
                      <ul class="takeaways-list">
                        @for (item of ai.key_takeaways; track $index) {
                          <li>{{ item }}</li>
                        }
                      </ul>
                    </div>
                  }

                  <!-- Objections & Roadblocks -->
                  @if (ai.objections_raised?.length) {
                    <div class="analysis-card warning-card">
                      <div class="card-title">
                        <mat-icon>report_problem</mat-icon>
                        <h4>Objections & Roadblocks Raised</h4>
                      </div>
                      <ul class="takeaways-list">
                        @for (obj of ai.objections_raised; track $index) {
                          <li>{{ obj }}</li>
                        }
                      </ul>
                    </div>
                  }

                  <!-- Action Items -->
                  @if (ai.action_items?.length) {
                    <div class="analysis-card action-card">
                      <div class="card-title-row">
                        <div class="card-title">
                          <mat-icon>task_alt</mat-icon>
                          <h4>Extracted Action Items</h4>
                        </div>
                        <button
                          mat-stroked-button
                          class="convert-tasks-btn"
                          (click)="convertActionItemsToTasks()"
                          [disabled]="convertingTasks()"
                        >
                          @if (convertingTasks()) {
                            <mat-spinner diameter="16"></mat-spinner>
                          } @else {
                            <mat-icon>add_task</mat-icon>
                            <span>Convert All to CRM Tasks</span>
                          }
                        </button>
                      </div>
                      <div class="action-items-list">
                        @for (act of ai.action_items; track $index) {
                          <div class="action-item-row">
                            <mat-icon class="check-bullet">radio_button_unchecked</mat-icon>
                            <span class="action-task">{{ act.task }}</span>
                            @if (act.owner) {
                              <span class="owner-tag">{{ act.owner }}</span>
                            }
                            @if (act.due_in_days) {
                              <span class="due-tag">Due in {{ act.due_in_days }}d</span>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  }

                  <!-- Recommended Next Step -->
                  @if (ai.next_recommended_step) {
                    <div class="analysis-card next-step-card">
                      <div class="card-title">
                        <mat-icon>trending_up</mat-icon>
                        <h4>Recommended Next Step</h4>
                      </div>
                      <p class="next-step-text">{{ ai.next_recommended_step }}</p>
                    </div>
                  }
                </div>
              } @else if (!analyzing()) {
                <div class="empty-ai-state">
                  <mat-icon>psychology</mat-icon>
                  <p>Click "Generate AI Analysis" above to instantly extract structured decisions, action items, and executive summaries.</p>
                </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button (click)="dialogRef.close()" class="cancel-btn">Close</button>
        <button
          mat-flat-button
          color="primary"
          class="save-sync-btn"
          (click)="saveAndSync()"
          [disabled]="saving()"
        >
          @if (saving()) {
            <mat-spinner diameter="18"></mat-spinner>
          } @else {
            <mat-icon>save</mat-icon>
            Save & Sync to CRM Timeline
          }
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 85vh;
      overflow: hidden;
    }

    .intelligence-dialog-container {
      font-family: 'Inter', sans-serif;
      background-color: #0b1329;
      color: #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 85vh;
      box-sizing: border-box;
    }

    .dialog-header {
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.1rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .icon-avatar {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2));
      border: 1px solid rgba(59, 130, 246, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #60a5fa;
    }

    .icon-avatar mat-icon {
      font-size: 26px;
      width: 26px;
      height: 26px;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }

    .title-row h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .subtitle {
      margin: 0.2rem 0 0 0;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .status-badge {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.1rem 0.45rem;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }

    .finished-pill {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.1rem 0.45rem;
      border-radius: 4px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .close-btn {
      color: #94a3b8 !important;
    }

    .crm-context-banner {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 1.25rem;
      padding: 0.65rem 1.5rem;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.8rem;
    }

    .context-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .ctx-label {
      color: #64748b;
      font-weight: 600;
    }

    .ctx-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.15rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .ctx-badge.company {
      background: rgba(59, 130, 246, 0.12);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.2);
    }

    .ctx-badge.contact {
      background: rgba(16, 185, 129, 0.12);
      color: #6ee7b7;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .ctx-badge mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .ctx-empty {
      color: #f59e0b;
      font-style: italic;
    }

    .context-tip {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: #64748b;
      font-size: 0.75rem;
    }

    .context-tip mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .dialog-content {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none !important;
      overflow-y: auto !important;
      padding: 1rem 1.5rem !important;
      margin: 0 !important;
    }

    .intelligence-tabs {
      min-height: 100%;
    }

    .tab-icon {
      margin-right: 6px;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .tab-icon.ai-star {
      color: #a855f7;
    }

    .tab-pane {
      padding-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .pane-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .pane-desc {
      margin: 0;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .char-counter {
      font-size: 0.75rem;
      color: #64748b;
    }

    .notes-field {
      width: 100%;
    }

    .notes-field textarea {
      font-family: inherit;
      line-height: 1.5;
      min-height: 130px;
      max-height: 250px;
      resize: vertical;
    }

    .ai-trigger-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.25rem;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(147, 51, 234, 0.08));
      border: 1px solid rgba(147, 51, 234, 0.2);
      border-radius: 10px;
    }

    .trigger-info h4 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .trigger-info p {
      margin: 0.2rem 0 0 0;
      font-size: 0.78rem;
      color: #94a3b8;
    }

    .analyze-btn {
      background: linear-gradient(135deg, #2563eb, #7c3aed) !important;
      color: #ffffff !important;
      font-weight: 600;
      border-radius: 8px;
      gap: 0.4rem;
    }

    .analysis-results {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .analysis-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 1rem 1.25rem;
    }

    .card-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.65rem;
    }

    .card-title mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #3b82f6;
    }

    .card-title h4 {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .summary-text {
      margin: 0;
      font-size: 0.85rem;
      line-height: 1.6;
      color: #cbd5e1;
    }

    .sentiment-pill {
      margin-left: auto;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      text-transform: uppercase;
    }

    .sentiment-pill.positive {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .sentiment-pill.neutral {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
    }

    .sentiment-pill.negative {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }

    .takeaways-list {
      margin: 0;
      padding-left: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.85rem;
      color: #cbd5e1;
    }

    .warning-card {
      border-color: rgba(245, 158, 11, 0.2);
      background: rgba(245, 158, 11, 0.02);
    }

    .warning-card .card-title mat-icon {
      color: #f59e0b;
    }

    .convert-tasks-btn {
      font-size: 0.75rem !important;
      height: 28px !important;
      line-height: 28px !important;
      color: #3b82f6 !important;
      border-color: rgba(59, 130, 246, 0.3) !important;
      border-radius: 6px;
    }

    .action-items-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .action-item-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 6px;
      font-size: 0.82rem;
    }

    .check-bullet {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #64748b;
    }

    .action-task {
      flex: 1;
      color: #e2e8f0;
    }

    .owner-tag {
      font-size: 0.7rem;
      background: rgba(59, 130, 246, 0.1);
      color: #93c5fd;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }

    .due-tag {
      font-size: 0.7rem;
      color: #94a3b8;
    }

    .next-step-card {
      border-color: rgba(59, 130, 246, 0.2);
    }

    .next-step-text {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 500;
      color: #93c5fd;
    }

    .empty-ai-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2.5rem 1rem;
      text-align: center;
      color: #64748b;
      border: 1px dashed rgba(255, 255, 255, 0.08);
      border-radius: 10px;
    }

    .empty-ai-state mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      margin-bottom: 0.5rem;
    }

    .dialog-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 0.85rem 1.5rem !important;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background-color: #0b1329;
      z-index: 10;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.25);
    }

    .cancel-btn {
      color: #94a3b8 !important;
    }

    .save-sync-btn {
      font-weight: 600;
      border-radius: 8px;
    }

    /* ─── LIGHT THEME OVERRIDES ─── */
    :host-context(body.light-theme) .intelligence-dialog-container {
      background-color: #ffffff;
      color: #334155;
    }

    :host-context(body.light-theme) .dialog-header {
      background-color: #ffffff;
      border-bottom-color: #e2e8f0;
    }

    :host-context(body.light-theme) .title-row h2 {
      color: #0f172a;
    }

    :host-context(body.light-theme) .subtitle {
      color: #64748b;
    }

    :host-context(body.light-theme) .crm-context-banner {
      background: #f8fafc;
      border-bottom-color: #e2e8f0;
    }

    :host-context(body.light-theme) .ctx-badge.company {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }

    :host-context(body.light-theme) .ctx-badge.contact {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }

    :host-context(body.light-theme) .ai-trigger-banner {
      background: #faf5ff;
      border-color: #e9d5ff;
    }

    :host-context(body.light-theme) .trigger-info h4 {
      color: #581c87;
    }

    :host-context(body.light-theme) .analysis-card {
      background: #ffffff;
      border-color: #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    :host-context(body.light-theme) .card-title h4 {
      color: #0f172a;
    }

    :host-context(body.light-theme) .summary-text {
      color: #334155;
    }

    :host-context(body.light-theme) .action-item-row {
      background: #f8fafc;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .action-task {
      color: #1e293b;
    }

    :host-context(body.light-theme) .dialog-actions {
      background-color: #ffffff;
      border-top-color: #e2e8f0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
    }

    :host-context(body.light-theme) .cancel-btn {
      color: #64748b !important;
    }

    @media (max-width: 640px) {
      .dialog-header {
        padding: 0.75rem 1rem;
      }
      .crm-context-banner {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.35rem;
        padding: 0.5rem 1rem;
      }
      .dialog-content {
        padding: 0.75rem 1rem !important;
      }
      .dialog-actions {
        padding: 0.75rem 1rem !important;
      }
    }
  `]
})
export class MeetingIntelligenceDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<MeetingIntelligenceDialogComponent>);
  private readonly meetingService = inject(MeetingService);
  private readonly notification = inject(NotificationService);

  readonly data: MeetingIntelligenceDialogData = inject(MAT_DIALOG_DATA);

  readonly meeting = signal<Meeting>(this.data.meeting);
  readonly saving = signal(false);
  readonly analyzing = signal(false);
  readonly convertingTasks = signal(false);

  notesContent = '';
  transcriptContent = '';
  readonly analysis = signal<MeetingAnalysis | null>(null);

  ngOnInit(): void {
    const m = this.data.meeting;
    this.notesContent = m.meeting_notes || '';
    this.transcriptContent = m.transcript || '';
    if (m.analysis && Object.keys(m.analysis).length) {
      this.analysis.set(m.analysis);
    }
  }

  generateAIAnalysis(): void {
    this.analyzing.set(true);

    this.meetingService
      .analyzeMeeting(this.meeting().id, {
        notes: this.notesContent,
        transcript: this.transcriptContent,
      })
      .subscribe({
        next: (res: any) => {
          this.analyzing.set(false);
          this.analysis.set(res.analysis);
          this.meeting.set(res.meeting);
          this.notification.success('AI Meeting Intelligence extracted successfully!');
        },
        error: (err: any) => {
          this.analyzing.set(false);
          this.notification.error(err?.error?.error || 'Failed to generate AI analysis.');
        },
      });
  }

  convertActionItemsToTasks(): void {
    const ai = this.analysis();
    if (!ai?.action_items?.length) return;

    this.convertingTasks.set(true);
    this.meetingService.createTasksFromActionItems(this.meeting().id, ai.action_items).subscribe({
      next: (res: any) => {
        this.convertingTasks.set(false);
        this.notification.success(res.message || 'Tasks created successfully!');
      },
      error: (err: any) => {
        this.convertingTasks.set(false);
        this.notification.error(err?.error?.error || 'Failed to convert action items to tasks.');
      },
    });
  }

  saveAndSync(): void {
    this.saving.set(true);

    const payload: Partial<Meeting> = {
      meeting_notes: this.notesContent,
      transcript: this.transcriptContent,
    };

    this.meetingService.updateMeeting(this.meeting().id, payload).subscribe({
      next: (updated: any) => {
        this.saving.set(false);
        this.meeting.set(updated);
        this.notification.success('Meeting notes & intelligence synced to CRM timeline!');
        this.dialogRef.close(updated);
      },
      error: (err: any) => {
        this.saving.set(false);
        this.notification.error(err?.error?.error || 'Failed to save meeting notes.');
      },
    });
  }

  getSentimentClass(sentiment?: string): string {
    if (!sentiment) return 'neutral';
    const s = sentiment.toLowerCase();
    if (s.includes('positive') || s.includes('engaged')) return 'positive';
    if (s.includes('risk') || s.includes('skeptical') || s.includes('negative')) return 'negative';
    return 'neutral';
  }
}
