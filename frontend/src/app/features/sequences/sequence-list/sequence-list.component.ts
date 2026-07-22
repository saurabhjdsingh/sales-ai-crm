import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SequenceStore } from '../store/sequence.store';
import { SequenceService } from '../services/sequence.service';

@Component({
  selector: 'app-sequence-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  template: `
    <div class="sequences-container">
      <div class="header-section">
        <div>
          <h1 class="page-title">Sales Sequences</h1>
          <p class="page-subtitle">Build reusable, multi-step sales outreach combining AI emails, tasks, and waits.</p>
        </div>
        <div class="action-buttons">
          <a routerLink="/sequences/approvals" class="approval-badge-btn">
            <mat-icon class="btn-icon">rate_review</mat-icon>
            Approval Queue
            <span class="count-badge" *ngIf="store.pendingCount() > 0">{{ store.pendingCount() }}</span>
          </a>
          <a routerLink="/sequences/dashboard" class="secondary-btn">
            <mat-icon class="btn-icon">bar_chart</mat-icon>
            Analytics Dashboard
          </a>
          <a routerLink="/sequences/new" class="primary-btn">
            <mat-icon class="btn-icon">add</mat-icon>
            New Sequence
          </a>
        </div>
      </div>

      <!-- KPI Summary Header -->
      <div class="kpi-strip" *ngIf="store.metrics() as m">
        <div class="kpi-card">
          <div class="kpi-label">Active Sequences</div>
          <div class="kpi-value">{{ m.active_sequences }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Enrolled</div>
          <div class="kpi-value">{{ m.total_enrolled }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pending Approval</div>
          <div class="kpi-value accent">{{ m.waiting_approval }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Reply Rate</div>
          <div class="kpi-value success">{{ m.reply_rate }}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Open Rate</div>
          <div class="kpi-value info">{{ m.open_rate }}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Click Rate</div>
          <div class="kpi-value info">{{ m.click_rate }}%</div>
        </div>
      </div>

      <!-- Table Section -->
      <div class="table-card">
        <div class="table-header">
          <div class="search-box">
            <mat-icon class="search-icon">search</mat-icon>
            <input
              type="text"
              placeholder="Search sequences..."
              [(ngModel)]="searchQuery"
              (ngModelChange)="onSearchChange()"
              class="search-input"
            />
          </div>
        </div>

        <div *ngIf="store.loading()" class="loading-state">
          <mat-icon class="spin-icon">sync</mat-icon> Loading sequences...
        </div>

        <div *ngIf="!store.loading() && store.sequences().length === 0" class="empty-state">
          <mat-icon class="empty-icon">auto_awesome</mat-icon>
          <h3>No Sales Sequences Found</h3>
          <p>Create your first sales sequence to automate follow-up emails and tasks with full CRM context.</p>
          <a routerLink="/sequences/new" class="primary-btn margin-top">Create Sequence</a>
        </div>

        <table *ngIf="!store.loading() && store.sequences().length > 0" class="data-table">
          <thead>
            <tr>
              <th>Sequence Name</th>
              <th>Status</th>
              <th>Steps</th>
              <th>Active Enrollments</th>
              <th>Tracking</th>
              <th>Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let seq of store.sequences()">
              <td>
                <a [routerLink]="['/sequences', seq.id]" class="seq-name-link">
                  {{ seq.name }}
                </a>
                <div class="seq-desc" *ngIf="seq.description">{{ seq.description }}</div>
              </td>
              <td>
                <span class="status-badge" [class.active]="seq.is_active" [class.inactive]="!seq.is_active">
                  {{ seq.is_active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>
                <span class="step-badge">
                  <mat-icon class="tiny-icon">format_list_numbered</mat-icon>
                  {{ seq.steps_count || 0 }} steps
                </span>
              </td>
              <td>
                <span class="count-pill">
                  {{ seq.active_enrollments_count || 0 }} contacts
                </span>
              </td>
              <td>
                <div class="tracking-tags">
                  <span class="track-tag" *ngIf="seq.track_opens" matTooltip="Open Tracking Enabled">
                    <mat-icon class="tiny-icon">visibility</mat-icon> Opens
                  </span>
                  <span class="track-tag" *ngIf="seq.track_clicks" matTooltip="Stealth Click Tracking Enabled">
                    <mat-icon class="tiny-icon">link</mat-icon> Clicks
                  </span>
                </div>
              </td>
              <td class="date-cell">{{ seq.created_at | date:'shortDate' }}</td>
              <td class="text-right action-cell">
                <button mat-icon-button (click)="toggleActive(seq)" [matTooltip]="seq.is_active ? 'Deactivate' : 'Activate'">
                  <mat-icon [class.text-success]="seq.is_active">{{ seq.is_active ? 'pause_circle' : 'play_circle' }}</mat-icon>
                </button>
                <button mat-icon-button (click)="duplicateSequence(seq)" matTooltip="Duplicate Sequence">
                  <mat-icon>content_copy</mat-icon>
                </button>
                <button mat-icon-button [routerLink]="['/sequences', seq.id, 'edit']" matTooltip="Edit Builder">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button color="warn" (click)="deleteSequence(seq)" matTooltip="Delete">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .sequences-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 0.25rem 0;
    }

    .page-subtitle {
      font-size: 0.9rem;
      color: #94a3b8;
      margin: 0;
    }

    .action-buttons {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .primary-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: #ffffff;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .primary-btn:hover {
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

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

    .approval-badge-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      font-size: 0.9rem;
      position: relative;
    }

    .count-badge {
      background: #ef4444;
      color: #ffffff;
      font-size: 0.75rem;
      padding: 0.1rem 0.45rem;
      border-radius: 12px;
      font-weight: 700;
    }

    .btn-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
      letter-spacing: 0.05em;
    }

    .kpi-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #f8fafc;
      margin-top: 0.25rem;
    }

    .kpi-value.accent { color: #fbbf24; }
    .kpi-value.success { color: #10b981; }
    .kpi-value.info { color: #3b82f6; }

    .table-card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
    }

    .table-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .search-box {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 0.4rem 0.75rem;
      width: 280px;
    }

    .search-icon {
      color: #64748b;
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 0.5rem;
    }

    .search-input {
      background: transparent;
      border: none;
      outline: none;
      color: #f8fafc;
      font-size: 0.85rem;
      width: 100%;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    .data-table th {
      background: rgba(255, 255, 255, 0.02);
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .data-table td {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      color: #e2e8f0;
      font-size: 0.875rem;
    }

    .seq-name-link {
      color: #3b82f6;
      font-weight: 600;
      text-decoration: none;
    }

    .seq-name-link:hover { text-decoration: underline; }

    .seq-desc {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.2rem;
    }

    .status-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status-badge.active {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }

    .status-badge.inactive {
      background: rgba(100, 116, 139, 0.2);
      color: #94a3b8;
    }

    .step-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      color: #cbd5e1;
      font-size: 0.8rem;
    }

    .tiny-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .count-pill {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.8rem;
    }

    .tracking-tags {
      display: flex;
      gap: 0.4rem;
    }

    .track-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      font-size: 0.7rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.04);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }

    .date-cell { color: #64748b; font-size: 0.8rem; }
    .text-right { text-align: right; }
    .text-success { color: #10b981 !important; }

    .loading-state, .empty-state {
      padding: 3rem;
      text-align: center;
      color: #64748b;
    }

    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #3b82f6;
      margin-bottom: 1rem;
    }

    .margin-top { margin-top: 1rem; }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .page-title { color: #0f172a; }
    :host-context(body.light-theme) .page-subtitle { color: #334155; }
    :host-context(body.light-theme) .kpi-card { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .kpi-label { color: #475569; font-weight: 700; }
    :host-context(body.light-theme) .kpi-value { color: #0f172a; }
    :host-context(body.light-theme) .table-card { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .table-header { border-bottom-color: #e2e8f0; }
    :host-context(body.light-theme) .search-box { background: #f8fafc; border-color: #cbd5e1; }
    :host-context(body.light-theme) .search-input { color: #0f172a; }
    :host-context(body.light-theme) .search-icon { color: #475569; }
    :host-context(body.light-theme) .data-table th { background: #f1f5f9; color: #1e293b; font-weight: 700; border-bottom-color: #cbd5e1; }
    :host-context(body.light-theme) .data-table td { color: #0f172a; border-bottom-color: #f1f5f9; }
    :host-context(body.light-theme) .seq-name-link { color: #2563eb; }
    :host-context(body.light-theme) .seq-desc { color: #475569; }
    :host-context(body.light-theme) .step-badge { color: #1e293b; }
    :host-context(body.light-theme) .date-cell { color: #475569; }
    :host-context(body.light-theme) .secondary-btn { background: #f1f5f9; border-color: #cbd5e1; color: #1e293b; }
  `]
})
export class SequenceListComponent implements OnInit {
  readonly store = inject(SequenceStore);
  private readonly service = inject(SequenceService);

  searchQuery = '';

  ngOnInit(): void {
    this.store.loadSequences();
    this.store.loadApprovalQueue();
    this.store.loadDashboardMetrics();
  }

  onSearchChange(): void {
    this.store.loadSequences(this.searchQuery ? { search: this.searchQuery } : undefined);
  }

  toggleActive(seq: any): void {
    this.service.updateSequence(seq.id, { is_active: !seq.is_active }).subscribe(() => {
      this.store.loadSequences();
    });
  }

  duplicateSequence(seq: any): void {
    this.service.duplicateSequence(seq.id).subscribe(() => {
      this.store.loadSequences();
    });
  }

  deleteSequence(seq: any): void {
    if (confirm(`Are you sure you want to delete sequence '${seq.name}'?`)) {
      this.service.deleteSequence(seq.id).subscribe(() => {
        this.store.loadSequences();
      });
    }
  }
}
