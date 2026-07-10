import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api.service';
import { Activity } from '../../../core/models/crm.model';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="timeline-container">
      <!-- Log Activity Accordion/Form -->
      <div class="log-activity-card">
        <div class="card-header" (click)="toggleForm()">
          <mat-icon class="header-icon">rate_review</mat-icon>
          <span>Log an Activity</span>
          <mat-icon class="expand-icon">{{ showForm() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </div>

        @if (showForm()) {
          <form [formGroup]="activityForm" (ngSubmit)="onSubmit()" class="activity-form">
            <div class="form-grid">
              <mat-form-field appearance="outline" class="select-field">
                <mat-label>Activity Type</mat-label>
                <mat-select formControlName="activity_type">
                  <mat-option value="call">Call</mat-option>
                  <mat-option value="email">Email</mat-option>
                  <mat-option value="meeting">Meeting</mat-option>
                  <mat-option value="linkedin_request">LinkedIn Request</mat-option>
                  <mat-option value="proposal_sent">Proposal Sent</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="title-field">
                <mat-label>Summary/Title</mat-label>
                <input matInput formControlName="title" placeholder="e.g. Discovery call with security lead" required>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Notes/Details</mat-label>
              <textarea matInput formControlName="description" rows="3" placeholder="Add description or conversation notes..."></textarea>
            </mat-form-field>

            <div class="form-actions">
              <button mat-button type="button" (click)="toggleForm()">Cancel</button>
              <button mat-flat-button color="primary" type="submit" [disabled]="activityForm.invalid || saving()">
                @if (saving()) {
                  <mat-spinner diameter="18"></mat-spinner>
                } @else {
                  Log Activity
                }
              </button>
            </div>
          </form>
        }
      </div>

      <!-- Timeline Items -->
      <div class="timeline-wrapper">
        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        } @else if (activities().length === 0) {
          <div class="empty-state">
            <mat-icon class="empty-icon">history</mat-icon>
            <p>No activity logged yet.</p>
          </div>
        } @else {
          <div class="timeline-line"></div>
          
          <div class="timeline-list">
            @for (act of activities(); track act.id) {
              <div class="timeline-item">
                <div class="item-icon-wrapper" [ngClass]="act.activity_type">
                  <mat-icon class="item-icon">{{ getActivityIcon(act.activity_type) }}</mat-icon>
                </div>
                
                <div class="item-card">
                  <div class="item-header">
                    <span class="item-title">{{ act.title }}</span>
                    <span class="item-time">{{ act.created_at | date:'mediumDate' }} · {{ act.created_at | date:'shortTime' }}</span>
                  </div>
                  
                  @if (act.description) {
                    <p class="item-desc">{{ act.description }}</p>
                  }
                  
                  <div class="item-footer" *ngIf="act.performed_by_name">
                    Logged by {{ act.performed_by_name }}
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .timeline-container {
      font-family: 'Inter', sans-serif;
      color: #e2e8f0;
    }

    .log-activity-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      margin-bottom: 2rem;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: center;
      padding: 1rem;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s;
    }

    .card-header:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .header-icon {
      color: #3b82f6;
      margin-right: 0.75rem;
    }

    .expand-icon {
      margin-left: auto;
      color: #64748b;
    }

    .activity-form {
      padding: 1.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }

    .form-grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .full-width {
      width: 100%;
      margin-bottom: 1rem;
    }

    ::ng-deep .activity-form .mat-mdc-text-field-wrapper {
      background-color: rgba(255, 255, 255, 0.02) !important;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .timeline-wrapper {
      position: relative;
      padding-left: 2.5rem;
    }

    .timeline-line {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 1.15rem;
      width: 2px;
      background: rgba(255, 255, 255, 0.05);
    }

    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .timeline-item {
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .item-icon-wrapper {
      position: absolute;
      left: -2.5rem;
      top: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      z-index: 2;
      border: 2px solid #090f1f;
    }

    .item-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Colors by type */
    .item-icon-wrapper.call { background-color: rgba(16, 185, 129, 0.15); color: #34d399; }
    .item-icon-wrapper.email { background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .item-icon-wrapper.meeting { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .item-icon-wrapper.task_completed { background-color: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .item-icon-wrapper.stage_changed { background-color: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .item-icon-wrapper.ai_research { background-color: rgba(14, 165, 233, 0.15); color: #38bdf8; }
    .item-icon-wrapper.note { background-color: rgba(156, 163, 175, 0.15); color: #d1d5db; }
    .item-icon-wrapper.import { background-color: rgba(99, 102, 241, 0.15); color: #818cf8; }

    .item-card {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 1rem;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .item-title {
      font-weight: 600;
      font-size: 0.9rem;
      color: #f8fafc;
    }

    .item-time {
      font-size: 0.75rem;
      color: #64748b;
    }

    .item-desc {
      font-size: 0.85rem;
      color: #cbd5e1;
      margin: 0 0 0.5rem 0;
      line-height: 1.5;
    }

    .item-footer {
      font-size: 0.75rem;
      color: #475569;
    }

    .loading-state {
      display: flex;
      justify-content: center;
      padding: 2rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem;
      color: #64748b;
    }

    .empty-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 0.5rem;
    }
  `]
})
export class TimelineComponent implements OnChanges {
  private readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);

  @Input() companyId?: string;
  @Input() contactId?: string;
  @Input() dealId?: string;

  readonly showForm = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly activities = signal<Activity[]>([]);

  readonly activityForm: FormGroup = this.fb.group({
    activity_type: ['call', [Validators.required]],
    title: ['', [Validators.required]],
    description: ['']
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] || changes['contactId'] || changes['dealId']) {
      this.loadActivities();
    }
  }

  loadActivities(): void {
    this.loading.set(true);
    const filterParams: Record<string, string> = {};
    if (this.companyId) filterParams['company'] = this.companyId;
    if (this.contactId) filterParams['contact'] = this.contactId;
    if (this.dealId) filterParams['deal'] = this.dealId;

    this.apiService.get<any>('/activities/', filterParams).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.activities.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notification.error('Failed to load activity timeline');
      }
    });
  }

  toggleForm(): void {
    this.showForm.set(!this.showForm());
  }

  onSubmit(): void {
    if (this.activityForm.invalid) return;

    this.saving.set(true);
    const val = this.activityForm.value;

    const payload: Record<string, any> = {
      activity_type: val.activity_type,
      title: val.title,
      description: val.description,
      company: this.companyId || null,
      contact: this.contactId || null,
      deal: this.dealId || null
    };

    this.apiService.post<Activity>('/activities/', payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.activityForm.reset({ activity_type: 'call', title: '', description: '' });
        this.showForm.set(false);
        this.notification.success('Activity logged successfully');
        this.loadActivities();
      },
      error: () => {
        this.saving.set(false);
        this.notification.error('Failed to log activity');
      }
    });
  }

  getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      call: 'call',
      email: 'email',
      meeting: 'groups',
      task_completed: 'task_alt',
      stage_changed: 'published_with_changes',
      ai_research: 'auto_awesome',
      note: 'note',
      import: 'upload',
      linkedin_request: 'connect_without_contact',
      proposal_sent: 'description'
    };
    return icons[type] || 'history';
  }
}
