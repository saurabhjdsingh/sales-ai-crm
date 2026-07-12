import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TelephonyService, TelephonySettings } from './telephony.service';
import { CallStateService } from './call-state.service';
import { TwilioVoiceService } from './twilio-voice.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-calls',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="calls-dashboard">
      <div class="list-header">
        <div>
          <h1>Call History</h1>
          <p class="subtitle">View and review all inbound and outbound client calls</p>
        </div>
        <button mat-flat-button color="primary" (click)="openDialer()" class="dial-btn">
          <mat-icon>dialpad</mat-icon>
          Open Dialer
        </button>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="card stats-card">
          <div class="stats-icon call"><mat-icon>call</mat-icon></div>
          <div class="stats-content">
            <span class="label">Total Calls</span>
            <span class="value">{{ totalCalls() }}</span>
          </div>
        </div>

        <div class="card stats-card">
          <div class="stats-icon duration"><mat-icon>schedule</mat-icon></div>
          <div class="stats-content">
            <span class="label">Avg Duration</span>
            <span class="value">{{ formatDuration(avgDuration()) }}</span>
          </div>
        </div>

        <div class="card stats-card">
          <div class="stats-icon ai"><mat-icon>psychology</mat-icon></div>
          <div class="stats-content">
            <span class="label">AI Assist Utilized</span>
            <span class="value">{{ aiPercentage() }}%</span>
          </div>
        </div>

        <div class="card stats-card">
          <div class="stats-icon success"><mat-icon>check_circle</mat-icon></div>
          <div class="stats-content">
            <span class="label">Connection Rate</span>
            <span class="value">{{ connectRate() }}%</span>
          </div>
        </div>
      </div>

      <div class="calls-layout">
        <!-- Call List Panel -->
        <div class="card calls-card list-panel">
          <div class="card-header">
            <mat-icon>history</mat-icon>
            <h3>Recent Call Records</h3>
          </div>
          <div class="card-body p-0">
            @if (loading()) {
              <div class="spinner-container">
                <mat-spinner diameter="40"></mat-spinner>
              </div>
            } @else if (calls().length === 0) {
              <div class="empty-state">
                <mat-icon class="empty-icon">phone_missed</mat-icon>
                <h3>No calls recorded yet</h3>
                <p>Configure your Twilio settings and place your first softphone call!</p>
              </div>
            } @else {
              <div class="table-responsive">
                <table class="calls-table">
                  <thead>
                    <tr>
                      <th>Direction</th>
                      <th>Contact</th>
                      <th>Linked Deal</th>
                      <th>Date</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>AI Assist</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (call of calls(); track call.id) {
                      <tr [class.selected]="selectedCall()?.id === call.id" (click)="selectCall(call)">
                        <td>
                          <div class="direction-cell">
                            <mat-icon [class]="call.direction">
                              {{ call.direction === 'inbound' ? 'call_received' : 'call_made' }}
                            </mat-icon>
                            <span>{{ call.direction | titlecase }}</span>
                          </div>
                        </td>
                        <td>
                          <div class="contact-details">
                            <span class="name">{{ call.contact_name || 'External Caller' }}</span>
                            <span class="phone">{{ call.participants[1]?.phone_number || 'N/A' }}</span>
                          </div>
                        </td>
                        <td>
                          <span class="deal-tag" *ngIf="call.deal_name">{{ call.deal_name }}</span>
                          <span class="deal-none" *ngIf="!call.deal_name">—</span>
                        </td>
                        <td>{{ call.created_at | date:'MMM d, y, h:mm a' }}</td>
                        <td>{{ formatDuration(call.duration) }}</td>
                        <td>
                          <span class="badge" [class]="call.status">
                            {{ call.status | titlecase }}
                          </span>
                        </td>
                        <td>
                          <mat-icon [class.active]="call.ai_assist_enabled" class="ai-badge">
                            {{ call.ai_assist_enabled ? 'psychology' : 'block' }}
                          </mat-icon>
                        </td>
                        <td class="text-right" (click)="$event.stopPropagation()">
                          <button mat-icon-button color="primary" (click)="redial(call)" title="Call back">
                            <mat-icon>phone</mat-icon>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>

        <!-- Call Detail Panel -->
        <div class="card calls-card detail-panel" *ngIf="selectedCall() as call">
          <div class="card-header justify-between">
            <div class="flex items-center gap-2">
              <mat-icon>call</mat-icon>
              <h3>Call Details</h3>
            </div>
            <button mat-icon-button (click)="selectedCall.set(null)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="card-body">
            <div class="detail-section">
              <h4>Contact Context</h4>
              <div class="info-grid">
                <div>
                  <span class="info-label">Name</span>
                  <span class="info-val">{{ call.contact_name || 'External Number' }}</span>
                </div>
                <div>
                  <span class="info-label">Company</span>
                  <span class="info-val">{{ call.company_name || '—' }}</span>
                </div>
                <div>
                  <span class="info-label">Deal</span>
                  <span class="info-val">{{ call.deal_name || '—' }}</span>
                </div>
                <div>
                  <span class="info-label">Duration</span>
                  <span class="info-val">{{ formatDuration(call.duration) }}</span>
                </div>
              </div>
            </div>

            <!-- Notes Section -->
            <div class="detail-section" *ngIf="call.notes">
              <h4>Agent Call Notes</h4>
              <div class="notes-box">{{ call.notes }}</div>
            </div>

            <!-- Transcript Section -->
            <div class="detail-section" *ngIf="call.transcript?.full_text">
              <h4>Dialogue Transcript</h4>
              <div class="transcript-box">
                @for (seg of call.transcript.transcript_data; track seg.timestamp) {
                  <div class="transcript-seg" [class.agent]="seg.speaker === 'agent' || seg.speaker === 'sales_rep'">
                    <span class="speaker-tag">{{ (seg.speaker === 'agent' || seg.speaker === 'sales_rep') ? 'Agent' : 'Customer' }}:</span>
                    <p class="seg-text">{{ seg.text }}</p>
                  </div>
                }
              </div>
            </div>

            <!-- AI Summary Section -->
            <div class="detail-section" *ngIf="call.ai_assist_enabled || call.transcript?.full_text">
              <div class="flex justify-between items-center mb-3">
                <h4 class="m-0">AI Assisted Insights</h4>
                <button mat-stroked-button color="accent" [disabled]="regenerating()" (click)="regenerateAI(call.id)" class="regen-btn">
                  @if (regenerating()) {
                    <mat-spinner diameter="16"></mat-spinner>
                    <span class="ml-2">Regenerating...</span>
                  } @else {
                    <mat-icon>psychology</mat-icon>
                    <span>Regenerate Insights</span>
                  }
                </button>
              </div>

              <div class="ai-summary-box" *ngIf="call.summary">
                <h5>Conversation Summary</h5>
                <p>{{ call.summary.summary || 'Summary unavailable' }}</p>

                <div class="insights-grid">
                  <div>
                    <h6>Pain Points</h6>
                    <ul>
                      @for (p of call.summary.pain_points; track p) {
                        <li>{{ p }}</li>
                      } @empty {
                        <li class="empty-list">No pain points detected</li>
                      }
                    </ul>
                  </div>

                  <div>
                    <h6>Buying Signals</h6>
                    <ul>
                      @for (s of call.summary.buying_signals; track s) {
                        <li>{{ s }}</li>
                      } @empty {
                        <li class="empty-list">No buying signals</li>
                      }
                    </ul>
                  </div>
                </div>

                <div class="templates-section">
                  <h6>Suggested Email Follow-up</h6>
                  <pre class="code-box">{{ call.summary.suggested_email || 'No draft generated' }}</pre>
                </div>
              </div>

              <div class="ai-empty-box" *ngIf="!call.summary">
                <p class="empty-text">No summary generated yet. Click "Regenerate Insights" to generate call summary and follow-up templates.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .calls-dashboard {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      color: #f8fafc;
    }

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;

      h1 {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
      }
      .subtitle {
        color: #64748b;
        margin: 0.25rem 0 0 0;
        font-size: 0.9rem;
      }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .stats-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;

      .stats-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 8px;

        mat-icon { font-size: 22px; width: 22px; height: 22px; }

        &.call { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        &.duration { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
        &.ai { background: rgba(236, 72, 153, 0.1); color: #ec4899; }
        &.success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
      }

      .stats-content {
        display: flex;
        flex-direction: column;
        .label { font-size: 0.75rem; color: #64748b; font-weight: 500; }
        .value { font-size: 1.25rem; color: #f8fafc; font-weight: 700; }
      }
    }

    .calls-layout {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }

    .calls-card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;

      &.list-panel { flex: 1.5; }
      &.detail-panel { flex: 1; position: sticky; top: 1.5rem; max-height: 80vh; overflow-y: auto; }
    }

    .card-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.01);

      h3 { margin: 0; font-size: 1rem; font-weight: 600; }
      mat-icon { color: #3b82f6; }
    }

    .card-body {
      padding: 1.25rem;

      &.p-0 { padding: 0; }
    }

    .spinner-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4rem 2rem;
      text-align: center;

      .empty-icon { font-size: 48px; width: 48px; height: 48px; color: #334155; margin-bottom: 1rem; }
      h3 { margin: 0; font-size: 1.1rem; }
      p { color: #64748b; font-size: 0.85rem; margin: 0.25rem 0 0 0; }
    }

    .calls-table {
      width: 100%;
      border-collapse: collapse;

      th {
        padding: 0.75rem 1.25rem;
        background: rgba(0, 0, 0, 0.15);
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.05em;
        text-align: left;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      td {
        padding: 0.85rem 1.25rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        font-size: 0.85rem;
        color: #cbd5e1;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      tr:hover td { background: rgba(255, 255, 255, 0.02); }
      tr.selected td { background: rgba(59, 130, 246, 0.08); border-bottom-color: rgba(59, 130, 246, 0.2); }
    }

    .direction-cell {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      mat-icon {
        font-size: 18px; width: 18px; height: 18px;
        &.inbound { color: #10b981; }
        &.outbound { color: #3b82f6; }
      }
    }

    .contact-details {
      display: flex;
      flex-direction: column;
      .name { font-weight: 600; color: #f8fafc; }
      .phone { font-size: 0.75rem; color: #64748b; }
    }

    .deal-tag {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.2);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    .deal-none { color: #334155; }

    .ai-badge {
      color: #334155;
      &.active { color: #ec4899; }
    }

    .badge {
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;

      &.completed { background: rgba(16, 185, 129, 0.1); color: #10b981; }
      &.ringing, &.queued, &.in-progress { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
      &.failed, &.busy, &.no-answer, &.canceled { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    }

    .detail-section {
      margin-bottom: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      padding-bottom: 1.25rem;

      h4 { margin: 0 0 0.75rem 0; font-size: 0.85rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;

      .info-label { font-size: 0.75rem; color: #64748b; display: block; }
      .info-val { font-weight: 500; font-size: 0.85rem; }
    }

    .notes-box, .code-box {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 6px;
      padding: 0.75rem;
      font-size: 0.85rem;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .transcript-box {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      padding: 0.75rem;
      max-height: 250px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .transcript-seg {
        font-size: 0.8rem;
        line-height: 1.4;
        align-self: flex-start;
        background: rgba(255, 255, 255, 0.03);
        padding: 0.4rem 0.6rem;
        border-radius: 8px 8px 8px 0;
        max-width: 80%;

        &.agent {
          align-self: flex-end;
          background: rgba(59, 130, 246, 0.15);
          border-radius: 8px 8px 0 8px;
          border: 1px solid rgba(59, 130, 246, 0.1);
        }

        .speaker-tag { font-size: 0.7rem; font-weight: 700; color: #64748b; margin-bottom: 0.1rem; display: block; }
        .seg-text { margin: 0; }
      }
    }

    .ai-summary-box {
      background: rgba(236, 72, 153, 0.03);
      border: 1px solid rgba(236, 72, 153, 0.1);
      border-radius: 8px;
      padding: 1rem;

      h5 { margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #ec4899; }
      p { margin: 0 0 1rem 0; font-size: 0.85rem; line-height: 1.5; color: #cbd5e1; }

      .insights-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;

        h6 { margin: 0 0 0.4rem 0; font-size: 0.8rem; color: #e2e8f0; }
        ul { margin: 0; padding-left: 1.25rem; font-size: 0.75rem; color: #94a3b8; }
        li { margin-bottom: 0.25rem; }
        .empty-list { list-style: none; padding: 0; color: #334155; font-style: italic; }
      }

      h6 { font-size: 0.8rem; color: #e2e8f0; margin: 0 0 0.5rem 0; }
      .code-box { font-family: monospace; font-size: 0.75rem; max-height: 150px; overflow-y: auto; background: #050b14; border-color: rgba(236, 72, 153, 0.05); }
    }

    .text-right { text-align: right; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 0.5rem; }
    .p-0 { padding: 0; }
    .mb-3 { margin-bottom: 0.75rem; }
    .m-0 { margin: 0; }
    .ml-2 { margin-left: 0.5rem; }

    .regen-btn {
      font-size: 0.75rem !important;
      height: 28px !important;
      line-height: 28px !important;
      padding: 0 0.5rem !important;
      display: flex !important;
      align-items: center !important;
      gap: 0.25rem !important;
      
      ::ng-deep .mat-mdc-progress-spinner {
        width: 16px !important;
        height: 16px !important;
      }
      mat-icon { font-size: 16px; width: 16px; height: 16px; margin: 0; }
    }

    .ai-empty-box {
      padding: 1rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px dashed rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      text-align: center;
      .empty-text { font-size: 0.8rem; color: #64748b; font-style: italic; margin: 0; }
    }

    /* Light Theme Styling */
    :host-context(body.light-theme) {
      .calls-dashboard, h1 { color: #0f172a; }
      .subtitle { color: #64748b; }
      
      .stats-card, .calls-card {
        background: #ffffff;
        border-color: rgba(0, 0, 0, 0.08);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .card-header {
        border-bottom-color: rgba(0, 0, 0, 0.06);
        background: rgba(0, 0, 0, 0.01);
        h3 { color: #0f172a; }
      }

      .stats-card .stats-content .value { color: #0f172a; }
      .calls-table {
        th { background: rgba(0, 0, 0, 0.02); border-bottom-color: rgba(0, 0, 0, 0.06); }
        td { border-bottom-color: rgba(0, 0, 0, 0.04); color: #334155; }
        .contact-details .name { color: #0f172a; }
        tr:hover td { background: rgba(0, 0, 0, 0.01); }
        tr.selected td { background: rgba(59, 130, 246, 0.05); }
      }

      .badge {
        &.completed { background: rgba(16, 185, 129, 0.1); color: #047857; }
        &.ringing, &.queued, &.in-progress { background: rgba(217, 119, 6, 0.1); color: #b45309; }
        &.failed, &.busy, &.no-answer, &.canceled { background: rgba(220, 38, 38, 0.1); color: #b91c1c; }
      }

      .notes-box, .code-box, .transcript-box {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.05);
        color: #334155;
      }

      .transcript-box .transcript-seg {
        background: #f1f5f9;
        color: #334155;
        &.agent {
          background: rgba(59, 130, 246, 0.08);
          color: #1e3a8a;
          border-color: rgba(59, 130, 246, 0.1);
        }
      }

      .ai-summary-box {
        background: rgba(236, 72, 153, 0.01);
        border-color: rgba(236, 72, 153, 0.08);
        p { color: #334155; }
        .insights-grid {
          h6 { color: #0f172a; }
          ul { color: #475569; }
        }
        h6 { color: #0f172a; }
        .code-box { background: #f8fafc; border-color: rgba(0, 0, 0, 0.06); }
      }

      .detail-section {
        border-bottom-color: rgba(0, 0, 0, 0.05);
        .info-val { color: #0f172a; }
      }

      .ai-empty-box {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.06);
        .empty-text { color: #64748b; }
      }
    }
  `]
})
export class CallsComponent implements OnInit {
  private readonly telephonyService = inject(TelephonyService);
  private readonly callState = inject(CallStateService);
  private readonly twilioService = inject(TwilioVoiceService);
  private readonly notification = inject(NotificationService);

  readonly loading = signal<boolean>(true);
  readonly calls = signal<any[]>([]);
  readonly selectedCall = signal<any | null>(null);
  readonly regenerating = signal<boolean>(false);

  // Statistics signals
  readonly totalCalls = signal<number>(0);
  readonly avgDuration = signal<number>(0);
  readonly aiPercentage = signal<number>(0);
  readonly connectRate = signal<number>(0);

  ngOnInit(): void {
    this.loadCalls();
  }

  loadCalls(): void {
    this.loading.set(true);
    this.telephonyService.getRecentCalls().subscribe({
      next: (res) => {
        const list = res.results || [];
        this.calls.set(list);
        this.calculateStats(list);
        this.loading.set(false);
      },
      error: () => {
        this.notification.error('Failed to load call history.');
        this.loading.set(false);
      }
    });
  }

  regenerateAI(callId: string): void {
    this.regenerating.set(true);
    this.telephonyService.regenerateInsights(callId).subscribe({
      next: () => {
        this.pollCallDetails(callId);
      },
      error: () => {
        this.notification.error('Failed to start AI insights regeneration.');
        this.regenerating.set(false);
      }
    });
  }

  private pollCallDetails(callId: string): void {
    let attempts = 0;
    const interval = setInterval(() => {
      this.telephonyService.getCallDetail(callId).subscribe({
        next: (data) => {
          attempts++;
          if (data.summary_status === 'completed' || data.summary_status === 'failed' || attempts > 60) {
            clearInterval(interval);
            this.selectedCall.set(data);
            this.regenerating.set(false);
            if (data.summary_status === 'completed') {
              this.notification.success('AI Assisted Insights regenerated successfully!');
              this.loadCalls();
            } else {
              this.notification.error('Failed to generate insights: ' + (data.summary?.summary || 'Error occurred.'));
            }
          }
        },
        error: () => {
          clearInterval(interval);
          this.regenerating.set(false);
        }
      });
    }, 2000);
  }

  private calculateStats(list: any[]): void {
    if (list.length === 0) return;
    this.totalCalls.set(list.length);
    
    // Average duration
    const completed = list.filter(c => c.duration);
    const sum = completed.reduce((acc, c) => acc + c.duration, 0);
    this.avgDuration.set(completed.length ? Math.round(sum / completed.length) : 0);

    // AI utilization
    const aiCount = list.filter(c => c.ai_assist_enabled).length;
    this.aiPercentage.set(Math.round((aiCount / list.length) * 100));

    // Connect rate (not failed, canceled, no-answer or busy)
    const connected = list.filter(c => c.status === 'completed' || c.status === 'in-progress').length;
    this.connectRate.set(Math.round((connected / list.length) * 100));
  }

  selectCall(call: any): void {
    this.telephonyService.getCallDetail(call.id).subscribe({
      next: (data) => {
        this.selectedCall.set(data);
      },
      error: () => this.notification.error('Failed to load call details.')
    });
  }

  openDialer(): void {
    // Open floating widget empty dialpad
    this.callState.resetCallState();
    this.twilioService.initDevice();
    // Toggle widget expansion on global component
    const widget = document.querySelector('app-phone-widget') as any;
    if (widget && (widget as any).__ngContext__) {
      // Custom expansion logic triggers or state
    }
    // We update callState activeCall structure to show dialer
    this.callState.activeCall.set({ dialerOpen: true });
  }

  redial(call: any): void {
    const phone = call.participants[1]?.phone_number;
    if (!phone) {
      this.notification.error('No phone number available to redial.');
      return;
    }

    this.callState.resetCallState();
    this.twilioService.initDevice();

    this.telephonyService.initiateCall({
      phone: phone,
      contact_id: call.contact,
      deal_id: call.deal,
      ai_assist_enabled: call.ai_assist_enabled
    }).subscribe({
      next: (newCall) => {
        this.callState.activeCall.set(newCall);
        this.twilioService.makeCall(phone, newCall.id);
      },
      error: () => this.notification.error('Failed to initiate call.')
    });
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}
