import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SequenceService } from '../services/sequence.service';
import { Sequence, SequenceEnrollment } from '../../../core/models/crm.model';

@Component({
  selector: 'app-sequence-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  template: `
    <div class="detail-container" *ngIf="sequence">
      <!-- Top Header / Navigation -->
      <div class="header-section">
        <div>
          <a routerLink="/sequences" class="back-link">
            <mat-icon>arrow_back</mat-icon> Back to Sequences
          </a>
          <div class="title-row">
            <h1 class="page-title">{{ sequence.name }}</h1>
            <span class="status-badge" [ngClass]="sequence.is_active ? 'active' : 'inactive'">
              {{ sequence.is_active ? 'ACTIVE' : 'INACTIVE' }}
            </span>
          </div>
          <p class="page-subtitle" *ngIf="sequence.description">{{ sequence.description }}</p>
        </div>

        <div class="header-actions">
          <a [routerLink]="['/sequences', sequence.id, 'edit']" class="secondary-btn">
            <mat-icon>edit</mat-icon> Edit Sequence
          </a>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="kpi-strip">
        <div class="kpi-card">
          <div class="kpi-label">Active Enrollments</div>
          <div class="kpi-value">{{ sequence.active_enrollments_count || 0 }}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Total Enrolled</div>
          <div class="kpi-value">{{ sequence.total_enrolled_count || 0 }}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Total Steps</div>
          <div class="kpi-value">{{ sequence.steps?.length || 0 }}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Tracking</div>
          <div class="kpi-value small">
            <span *ngIf="sequence.track_opens">Opens 👁️</span>
            <span *ngIf="sequence.track_clicks"> · Clicks 🔗</span>
          </div>
        </div>
      </div>

      <!-- Sequence Steps Card -->
      <div class="card">
        <h3 class="card-title">Sequence Steps Flow</h3>

        <div class="steps-flow">
          <div *ngFor="let step of sequence.steps" class="step-chip">
            <span class="step-num">Step {{ step.step_number }}</span>
            <span class="step-type" [ngClass]="step.action_type">
              {{ step.action_type === 'ai_email' ? 'AI Email' : (step.action_type === 'manual_task' ? 'Manual Task' : (step.action_type === 'update_stage' ? 'Update Stage' : 'Wait')) }}
            </span>
            <span class="step-delay" *ngIf="step.delay > 0">
              ({{ step.delay }} {{ step.delay_unit }})
            </span>
          </div>
        </div>
      </div>

      <!-- Enrolled Contacts Progress Table -->
      <div class="card">
        <h3 class="card-title">Enrolled Contacts Progress</h3>

        <div *ngIf="enrollments.length === 0" class="empty-state">
          <mat-icon class="empty-icon">person_add</mat-icon>
          <p>No contacts enrolled in this sequence yet.</p>
        </div>

        <div *ngIf="enrollments.length > 0" class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Status</th>
                <th>Current Step</th>
                <th>Opens</th>
                <th>Clicks</th>
                <th>Replies</th>
                <th>Next Exec</th>
                <th>Stop Reason</th>
                <th>Enrolled Date</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let e of enrollments">
                <td class="contact-cell">
                  <a [routerLink]="['/contacts', e.contact]" class="contact-link">
                    {{ e.contact_name }}
                  </a>
                  <div class="email-sub">{{ e.contact_email }}</div>
                </td>
                <td>
                  <span class="enrollment-status" [ngClass]="e.status">
                    {{ e.status | uppercase }}
                  </span>
                </td>
                <td>Step {{ e.current_step_number }}</td>
                <td>
                  <span class="stat-pill open">
                    <mat-icon class="tiny-icon">visibility</mat-icon> {{ e.open_count || 0 }}
                  </span>
                </td>
                <td>
                  <span class="stat-pill click">
                    <mat-icon class="tiny-icon">ads_click</mat-icon> {{ e.click_count || 0 }}
                  </span>
                </td>
                <td>
                  <span class="reply-tag" *ngIf="e.has_replied || (e.stop_reason && (e.stop_reason.toLowerCase().includes('replied') || e.stop_reason.toLowerCase().includes('answered')))">
                    Replied / Answered
                  </span>
                  <span class="muted" *ngIf="!e.has_replied && (!e.stop_reason || (!e.stop_reason.toLowerCase().includes('replied') && !e.stop_reason.toLowerCase().includes('answered')))">
                    —
                  </span>
                </td>
                <td class="nowrap-cell">
                  <span *ngIf="e.next_execution_at">{{ e.next_execution_at | date:'short' }}</span>
                  <span *ngIf="!e.next_execution_at" class="muted">—</span>
                </td>
                <td class="reason-cell">
                  <span *ngIf="e.stop_reason" class="reason-tag" [matTooltip]="e.stop_reason">{{ e.stop_reason }}</span>
                  <span *ngIf="!e.stop_reason" class="muted">—</span>
                </td>
                <td class="nowrap-cell date-cell">{{ e.created_at | date:'shortDate' }}</td>
                <td class="text-right action-cell">
                  <button
                    *ngIf="e.status === 'running' || e.status === 'waiting'"
                    mat-icon-button
                    (click)="pauseEnrollment(e)"
                    matTooltip="Pause Progress"
                  >
                    <mat-icon>pause_circle</mat-icon>
                  </button>

                  <button
                    *ngIf="e.status === 'paused'"
                    mat-icon-button
                    (click)="resumeEnrollment(e)"
                    matTooltip="Resume Progress"
                  >
                    <mat-icon>play_circle</mat-icon>
                  </button>

                  <button
                    *ngIf="e.status !== 'completed' && e.status !== 'stopped'"
                    mat-icon-button
                    color="warn"
                    (click)="stopEnrollment(e)"
                    matTooltip="Stop Sequence for Contact"
                  >
                    <mat-icon>stop_circle</mat-icon>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .detail-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
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

    .title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
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
      margin: 0.25rem 0 0 0;
    }

    .status-badge {
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status-badge.active { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .status-badge.inactive { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }

    .secondary-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      font-size: 0.9rem;
    }

    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
    }

    .kpi-card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 1rem;
    }

    .kpi-label {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }

    .kpi-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #f8fafc;
      margin-top: 0.25rem;
    }

    .kpi-value.small {
      font-size: 0.95rem;
      font-weight: 600;
      color: #38bdf8;
    }

    .card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
      overflow: hidden;
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 1rem 0;
    }

    .steps-flow {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .step-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.5rem 0.85rem;
      border-radius: 8px;
    }

    .step-num { font-size: 0.75rem; color: #64748b; font-weight: 600; }
    .step-type { font-size: 0.85rem; font-weight: 600; }
    .step-type.ai_email { color: #60a5fa; }
    .step-type.manual_task { color: #34d399; }
    .step-type.wait { color: #fbbf24; }

    .table-container {
      width: 100%;
      overflow-x: auto;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    }

    .data-table {
      width: 100%;
      min-width: 850px;
      border-collapse: collapse;
      text-align: left;
    }

    .data-table th {
      background: rgba(255, 255, 255, 0.02);
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      white-space: nowrap;
    }

    .data-table td {
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      color: #e2e8f0;
      font-size: 0.85rem;
    }

    .nowrap-cell {
      white-space: nowrap;
    }

    .contact-link {
      color: #3b82f6;
      font-weight: 600;
      text-decoration: none;
    }

    .email-sub { font-size: 0.75rem; color: #64748b; }

    .enrollment-status {
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
    }

    .enrollment-status.running { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .enrollment-status.waiting { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .enrollment-status.waiting_approval { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .enrollment-status.completed { background: rgba(139, 92, 246, 0.15); color: #c084fc; }
    .enrollment-status.stopped { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .enrollment-status.paused { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }

    .reason-cell {
      max-width: 180px;
    }

    .reason-tag {
      display: inline-block;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: rgba(239, 68, 68, 0.1);
      color: #f87171;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .stat-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .stat-pill.open { background: rgba(14, 165, 233, 0.15); color: #38bdf8; }
    .stat-pill.click { background: rgba(236, 72, 153, 0.15); color: #f472b6; }

    .reply-tag {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .muted { color: #64748b; }
    .text-right { text-align: right; }
    .date-cell { color: #64748b; }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: #64748b;
    }

    .empty-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #3b82f6;
      margin-bottom: 0.5rem;
    }

    .btn-icon, .tiny-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .page-title { color: #0f172a; }
    :host-context(body.light-theme) .page-subtitle { color: #334155; }
    :host-context(body.light-theme) .back-link { color: #475569; }
    :host-context(body.light-theme) .kpi-card { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .kpi-label { color: #475569; font-weight: 700; }
    :host-context(body.light-theme) .kpi-value { color: #0f172a; }
    :host-context(body.light-theme) .card { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .card-title { color: #0f172a; }
    :host-context(body.light-theme) .step-chip { background: #f8fafc; border-color: #cbd5e1; }
    :host-context(body.light-theme) .step-num { color: #475569; }
    :host-context(body.light-theme) .data-table th { background: #f1f5f9; color: #1e293b; font-weight: 700; border-bottom-color: #cbd5e1; }
    :host-context(body.light-theme) .data-table td { color: #0f172a; border-bottom-color: #f1f5f9; }
    :host-context(body.light-theme) .contact-link { color: #2563eb; }
    :host-context(body.light-theme) .email-sub { color: #475569; }
    :host-context(body.light-theme) .secondary-btn { background: #f1f5f9; border-color: #cbd5e1; color: #1e293b; }
  `]
})
export class SequenceDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SequenceService);

  sequence: Sequence | null = null;
  enrollments: SequenceEnrollment[] = [];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadSequence(id);
      this.loadEnrollments(id);
    }
  }

  loadSequence(id: string): void {
    this.service.getSequence(id).subscribe((seq) => (this.sequence = seq));
  }

  loadEnrollments(sequenceId: string): void {
    this.service.getEnrollments({ sequence: sequenceId }).subscribe((res) => {
      this.enrollments = res.results || [];
    });
  }

  pauseEnrollment(e: SequenceEnrollment): void {
    this.service.pauseEnrollment(e.id).subscribe(() => this.loadEnrollments(e.sequence));
  }

  resumeEnrollment(e: SequenceEnrollment): void {
    this.service.resumeEnrollment(e.id).subscribe(() => this.loadEnrollments(e.sequence));
  }

  stopEnrollment(e: SequenceEnrollment): void {
    if (confirm(`Stop sequence for contact ${e.contact_name}?`)) {
      this.service.stopEnrollment(e.id, 'Manually stopped by rep').subscribe(() => this.loadEnrollments(e.sequence));
    }
  }
}
