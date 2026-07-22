import { Component, OnInit, inject, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SequenceService } from '../services/sequence.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Sequence } from '../../../core/models/crm.model';

export interface SequenceEnrollDialogData {
  contactId: string;
  contactName: string;
}

@Component({
  selector: 'app-sequence-enroll-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon class="title-icon">auto_awesome</mat-icon> Enroll Contact in Sequence
    </h2>

    <div mat-dialog-content class="dialog-content">
      <p class="subtitle">
        Select an active outreach sequence for <strong>{{ data.contactName }}</strong>:
      </p>

      <div *ngIf="loading" class="loading-box">
        <mat-spinner diameter="36"></mat-spinner>
        <span>Loading active sequences...</span>
      </div>

      <div *ngIf="!loading && sequences.length === 0" class="no-seq-card">
        <mat-icon class="warning-icon">warning</mat-icon>
        <div class="no-seq-content">
          <h4>No Active Sequences Found</h4>
          <p>You have no active sequences with configured steps. Create and activate a sequence to start automated outreach.</p>
          <button mat-flat-button color="primary" (click)="goToCreateSequence()" class="create-seq-btn">
            <mat-icon>add</mat-icon> Create New Sequence
          </button>
        </div>
      </div>

      <div *ngIf="!loading && sequences.length > 0" class="seq-list">
        <div
          *ngFor="let seq of sequences"
          class="seq-item-card"
          [class.selected]="selectedSequenceId === seq.id"
          (click)="selectedSequenceId = seq.id"
        >
          <div class="seq-radio">
            <div class="radio-outer" [class.checked]="selectedSequenceId === seq.id">
              <div class="radio-inner" *ngIf="selectedSequenceId === seq.id"></div>
            </div>
          </div>
          <div class="seq-info">
            <div class="seq-header">
              <span class="seq-name">{{ seq.name }}</span>
              <span class="seq-badge">{{ seq.steps_count || seq.steps?.length || 0 }} Steps</span>
            </div>
            <p class="seq-desc">{{ seq.description || 'No description provided.' }}</p>
          </div>
        </div>
      </div>
    </div>

    <div mat-dialog-actions align="end" class="dialog-actions">
      <button mat-button (click)="onCancel()" class="cancel-btn">Cancel</button>
      <button
        *ngIf="sequences.length > 0"
        mat-raised-button
        color="primary"
        (click)="onEnroll()"
        [disabled]="!selectedSequenceId || enrolling"
        class="submit-btn"
      >
        {{ enrolling ? 'Enrolling...' : 'Enroll Contact' }}
      </button>
    </div>
  `,
  styles: [`
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f8fafc;
      font-size: 1.25rem;
      margin: 0;
    }

    .title-icon { color: #60a5fa; }

    .dialog-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 420px;
      max-width: 540px;
      padding-top: 0.75rem !important;
    }

    .subtitle {
      color: #94a3b8;
      font-size: 0.9rem;
      margin: 0;
    }

    .loading-box {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: #94a3b8;
    }

    .no-seq-card {
      display: flex;
      gap: 1rem;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 10px;
      padding: 1.25rem;
    }

    .warning-icon {
      color: #f59e0b;
      font-size: 28px;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
    }

    .no-seq-content h4 {
      color: #fbbf24;
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
    }

    .no-seq-content p {
      color: #cbd5e1;
      font-size: 0.85rem;
      margin: 0 0 1rem 0;
      line-height: 1.4;
    }

    .create-seq-btn {
      background: #3b82f6 !important;
    }

    .seq-list {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      max-height: 320px;
      overflow-y: auto;
    }

    .seq-item-card {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .seq-item-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .seq-item-card.selected {
      background: rgba(59, 130, 246, 0.12);
      border-color: #3b82f6;
    }

    .radio-outer {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    }

    .radio-outer.checked {
      border-color: #3b82f6;
    }

    .radio-inner {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #3b82f6;
    }

    .seq-info { flex: 1; }

    .seq-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .seq-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: #f8fafc;
    }

    .seq-badge {
      font-size: 0.725rem;
      font-weight: 600;
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
    }

    .seq-desc {
      font-size: 0.8rem;
      color: #94a3b8;
      margin: 0.25rem 0 0 0;
    }

    .dialog-actions { padding: 1rem; }
    .cancel-btn { color: #94a3b8 !important; }
    .submit-btn { background: #3b82f6 !important; }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .dialog-title { color: #0f172a; }
    :host-context(body.light-theme) .subtitle { color: #475569; }
    :host-context(body.light-theme) .seq-item-card {
      background: #ffffff;
      border-color: #cbd5e1;
    }
    :host-context(body.light-theme) .seq-item-card:hover {
      background: #f8fafc;
      border-color: #94a3b8;
    }
    :host-context(body.light-theme) .seq-item-card.selected {
      background: #eff6ff;
      border-color: #3b82f6;
    }
    :host-context(body.light-theme) .seq-name { color: #0f172a; }
    :host-context(body.light-theme) .seq-desc { color: #475569; }
    :host-context(body.light-theme) .cancel-btn { color: #475569 !important; }
  `]
})
export class SequenceEnrollDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<SequenceEnrollDialogComponent>);
  private readonly sequenceService = inject(SequenceService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);

  sequences: Sequence[] = [];
  selectedSequenceId: string | null = null;
  loading = true;
  enrolling = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: SequenceEnrollDialogData) {}

  ngOnInit(): void {
    this.sequenceService.getSequences({ is_active: true }).subscribe({
      next: (res) => {
        this.sequences = res.results || [];
        if (this.sequences.length > 0) {
          this.selectedSequenceId = this.sequences[0].id;
        }
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.notification.error(err.message || 'Failed to load sequences.');
      }
    });
  }

  goToCreateSequence(): void {
    this.dialogRef.close(false);
    this.router.navigate(['/sequences/new']);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onEnroll(): void {
    if (!this.selectedSequenceId) return;
    this.enrolling = true;

    const targetSeq = this.sequences.find((s) => s.id === this.selectedSequenceId);

    this.sequenceService.enrollContacts(this.selectedSequenceId, { contact_ids: [this.data.contactId] }).subscribe({
      next: () => {
        this.enrolling = false;
        this.notification.success(`Enrolled ${this.data.contactName} in '${targetSeq?.name || 'Sequence'}'.`);
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.enrolling = false;
        const msg = err.error?.detail || err.message || 'Enrollment failed.';
        this.notification.error(msg);
      }
    });
  }
}
