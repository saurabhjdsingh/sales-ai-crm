import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SequenceService } from '../services/sequence.service';
import { SequenceDashboardMetrics } from '../../../core/models/crm.model';

@Component({
  selector: 'app-sequence-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  template: `
    <div class="dashboard-container">
      <div class="header-section">
        <div>
          <a routerLink="/sequences" class="back-link">
            <mat-icon class="tiny-icon">arrow_back</mat-icon> Back to Sequences
          </a>
          <h1 class="page-title">Sequence Performance & Analytics</h1>
          <p class="page-subtitle">Real-time telemetry, reply rates, open stats, and completion metrics.</p>
        </div>
      </div>

      <div class="metrics-grid" *ngIf="metrics">
        <div class="metric-card">
          <div class="metric-icon-wrap active-bg"><mat-icon>auto_awesome</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Active Sequences</div>
            <div class="metric-value">{{ metrics.active_sequences }}</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap enroll-bg"><mat-icon>groups</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Total Enrolled</div>
            <div class="metric-value">{{ metrics.total_enrolled }}</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap approval-bg"><mat-icon>rate_review</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Pending Approval</div>
            <div class="metric-value accent">{{ metrics.waiting_approval }}</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap reply-bg"><mat-icon>reply</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Reply Rate</div>
            <div class="metric-value success">{{ metrics.reply_rate }}%</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap open-bg"><mat-icon>visibility</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Open Rate</div>
            <div class="metric-value info">{{ metrics.open_rate }}%</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap click-bg"><mat-icon>touch_app</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Click Rate</div>
            <div class="metric-value info">{{ metrics.click_rate }}%</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap sent-bg"><mat-icon>mark_email_read</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Emails Sent</div>
            <div class="metric-value">{{ metrics.emails_sent }}</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap task-bg"><mat-icon>task_alt</mat-icon></div>
          <div class="metric-info">
            <div class="metric-label">Tasks Completed</div>
            <div class="metric-value">{{ metrics.tasks_completed }}</div>
          </div>
        </div>
      </div>

      <!-- Breakdown & Privacy Disclaimer Note -->
      <div class="card note-card">
        <div class="note-header">
          <mat-icon class="note-icon">info</mat-icon>
          <strong>Internal Analytics & Email Privacy Note</strong>
        </div>
        <p class="note-body">
          Open rates reflect image load detection via lightweight 1x1 tracking pixels. Link click telemetry uses stealth URL routing endpoints (/r/&lt;token&gt;).
          Note that certain email client security mechanisms (such as Apple Mail Privacy Protection) may pre-fetch images and impact raw open percentages.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
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

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
    }

    .metric-card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .metric-icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      flex-shrink: 0;
    }

    .active-bg { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .enroll-bg { background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
    .approval-bg { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .reply-bg { background: rgba(16, 185, 129, 0.2); color: #10b981; }
    .open-bg { background: rgba(14, 165, 233, 0.2); color: #0ea5e9; }
    .click-bg { background: rgba(236, 72, 153, 0.2); color: #ec4899; }
    .sent-bg { background: rgba(99, 102, 241, 0.2); color: #6366f1; }
    .task-bg { background: rgba(34, 197, 94, 0.2); color: #22c55e; }

    .metric-label {
      font-size: 0.8rem;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }

    .metric-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: #f8fafc;
      margin-top: 0.2rem;
    }

    .metric-value.accent { color: #fbbf24; }
    .metric-value.success { color: #10b981; }
    .metric-value.info { color: #3b82f6; }

    .card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
    }

    .note-card {
      background: rgba(59, 130, 246, 0.05);
      border: 1px solid rgba(59, 130, 246, 0.15);
    }

    .note-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #60a5fa;
      margin-bottom: 0.5rem;
    }

    .note-body {
      color: #94a3b8;
      font-size: 0.85rem;
      line-height: 1.5;
      margin: 0;
    }

    .btn-icon, .tiny-icon, .note-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .page-title { color: #0f172a; }
    :host-context(body.light-theme) .page-subtitle { color: #334155; }
    :host-context(body.light-theme) .back-link { color: #475569; }
    :host-context(body.light-theme) .metric-card { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .metric-label { color: #475569; font-weight: 700; }
    :host-context(body.light-theme) .metric-value { color: #0f172a; }
    :host-context(body.light-theme) .note-card { background: #eff6ff; border-color: #bfdbfe; }
    :host-context(body.light-theme) .note-header { color: #1d4ed8; }
    :host-context(body.light-theme) .note-body { color: #1e293b; }
  `]
})
export class SequenceDashboardComponent implements OnInit {
  private readonly service = inject(SequenceService);

  metrics: SequenceDashboardMetrics | null = null;

  ngOnInit(): void {
    this.service.getDashboardMetrics().subscribe((m) => (this.metrics = m));
  }
}
