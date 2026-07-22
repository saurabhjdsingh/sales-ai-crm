import { Component, inject, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TaskService } from '../../tasks/services/task.service';

import { Task } from '../../../core/models/crm.model';

export interface TaskOutcomeDialogData {
  taskId?: string;
  taskTitle?: string;
  contactName?: string;
  requiresOutcome?: boolean;
  task?: Task;
}

@Component({
  selector: 'app-task-outcome-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon class="title-icon">task_alt</mat-icon> Complete Task & Record Outcome
    </h2>

    <div mat-dialog-content class="dialog-content">
      <p class="task-info">
        Task: <strong>{{ displayTitle }}</strong>
        <span *ngIf="displayContactName"> (Contact: {{ displayContactName }})</span>
      </p>

      <div class="form-group">
        <label class="form-label">Task Outcome *</label>
        <div class="outcome-grid">
          <div
            *ngFor="let opt of outcomeOptions"
            class="outcome-option"
            [class.selected]="selectedOutcome === opt.value"
            (click)="selectedOutcome = opt.value"
          >
            <mat-icon class="opt-icon">{{ opt.icon }}</mat-icon>
            <span class="opt-label">{{ opt.label }}</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Outcome Notes / Call Summary (Passed to future AI steps)</label>
        <textarea
          [(ngModel)]="outcomeNotes"
          rows="3"
          placeholder="e.g. Discussed pricing. Requested follow up next Monday after internal team meeting..."
          class="form-textarea"
        ></textarea>
      </div>

      <!-- Option to Stop Sequence -->
      <div class="stop-sequence-box">
        <div class="toggle-row">
          <div>
            <div class="toggle-title">Stop Sequence for this Contact</div>
            <div class="toggle-sub">If checked, no further automated emails or sequence tasks will be generated.</div>
          </div>
          <mat-slide-toggle [(ngModel)]="stopSequence" color="warn"></mat-slide-toggle>
        </div>
      </div>
    </div>

    <div mat-dialog-actions align="end" class="dialog-actions">
      <button mat-button (click)="onCancel()" class="cancel-btn">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="onSubmit()"
        [disabled]="data.requiresOutcome && !selectedOutcome || saving"
        class="submit-btn"
      >
        {{ saving ? 'Completing...' : 'Complete Task' }}
      </button>
    </div>
  `,
  styles: [`
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f8fafc;
      font-size: 1.2rem;
      margin: 0;
    }

    .title-icon { color: #10b981; }

    .dialog-content {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding-top: 0.75rem !important;
    }

    .task-info {
      color: #cbd5e1;
      font-size: 0.9rem;
      margin: 0;
    }

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

    .outcome-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.6rem;
    }

    .outcome-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0.75rem 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .outcome-option:hover { background: rgba(255, 255, 255, 0.06); }

    .outcome-option.selected {
      background: rgba(59, 130, 246, 0.2);
      border-color: #3b82f6;
      color: #60a5fa;
    }

    .opt-icon { font-size: 20px; width: 20px; height: 20px; }
    .opt-label { font-size: 0.75rem; font-weight: 600; text-align: center; }

    .form-textarea {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      color: #f8fafc;
      font-size: 0.875rem;
      outline: none;
    }

    .stop-sequence-box {
      background: rgba(239, 68, 68, 0.06);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      padding: 0.85rem;
    }

    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .toggle-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: #f87171;
    }

    .toggle-sub {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .dialog-actions { padding: 1rem; }
    .cancel-btn { color: #94a3b8 !important; }
    .submit-btn { background: #3b82f6 !important; }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .dialog-title { color: #0f172a; }
    :host-context(body.light-theme) .task-info { color: #334155; }
    :host-context(body.light-theme) .form-label { color: #000000 !important; font-weight: 700; }
    :host-context(body.light-theme) .outcome-option { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
    :host-context(body.light-theme) .outcome-option:hover { background: #f1f5f9; }
    :host-context(body.light-theme) .outcome-option.selected { background: #eff6ff; border-color: #3b82f6; color: #2563eb; }
    :host-context(body.light-theme) .form-textarea { background: #f8fafc; border-color: #cbd5e1; color: #0f172a; }
    :host-context(body.light-theme) .toggle-title { color: #dc2626; }
    :host-context(body.light-theme) .toggle-sub { color: #475569; }
    :host-context(body.light-theme) .cancel-btn { color: #475569 !important; }
  `]
})
export class TaskOutcomeDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<TaskOutcomeDialogComponent>);
  private readonly taskService = inject(TaskService);

  selectedOutcome = '';
  outcomeNotes = '';
  stopSequence = false;
  saving = false;

  readonly outcomeOptions = [
    { value: 'answered', label: 'Answered Call', icon: 'phone_in_talk' },
    { value: 'voicemail', label: 'Left Voicemail', icon: 'voicemail' },
    { value: 'requested_callback', label: 'Requested Callback', icon: 'ring_volume' },
    { value: 'not_picked_up', label: 'Not Picked Up', icon: 'phone_missed' },
    { value: 'wrong_number', label: 'Wrong Number', icon: 'phone_disabled' },
    { value: 'not_interested', label: 'Not Interested', icon: 'block' },
    { value: 'meeting_booked', label: 'Meeting Booked', icon: 'event' },
    { value: 'proposal_sent', label: 'Proposal Sent', icon: 'send' },
    { value: 'completed_other', label: 'Other', icon: 'check_circle' },
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public data: TaskOutcomeDialogData) {}

  get targetTaskId(): string {
    return this.data.taskId || this.data.task?.id || '';
  }

  get displayTitle(): string {
    return this.data.taskTitle || this.data.task?.title || 'Task';
  }

  get displayContactName(): string {
    return this.data.contactName || this.data.task?.contact_name || (this.data.task?.company_name ? `Account: ${this.data.task.company_name}` : '');
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onSubmit(): void {
    if (!this.targetTaskId) return;
    this.saving = true;
    const payload = {
      outcome: this.selectedOutcome,
      outcome_notes: this.outcomeNotes,
      stop_sequence: this.stopSequence,
      stop_reason: this.stopSequence ? `Task Outcome: ${this.selectedOutcome} (Sequence Stopped)` : undefined
    };

    this.taskService.completeTask(this.targetTaskId, payload).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: () => (this.saving = false)
    });
  }
}
