import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ScheduleDialogData {
  contactName: string;
  contactTimezone?: string;
  currentScheduledTime?: string;
}

export interface ScheduleDialogResult {
  send_mode: 'smart_send' | 'manual';
  manual_time_utc?: string;
}

@Component({
  selector: 'app-schedule-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <div class="schedule-dialog-container">
      <h2 mat-dialog-title class="dialog-title">
        <mat-icon style="color: #3b82f6;">edit_calendar</mat-icon>
        Schedule Email Delivery
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="dialog-sub">
          Target Contact: <strong>{{ data.contactName }}</strong>
          <span *ngIf="data.contactTimezone" class="tz-badge">
            <mat-icon style="font-size: 12px; width: 12px; height: 12px;">public</mat-icon>
            {{ data.contactTimezone }}
          </span>
        </p>

        <!-- Mode Option Selector -->
        <div class="mode-selector-grid">
          <div
            class="mode-card"
            [class.active]="sendMode === 'smart_send'"
            (click)="sendMode = 'smart_send'"
          >
            <div class="mode-card-header">
              <mat-icon style="color: #60a5fa;">auto_awesome</mat-icon>
              <span>Smart Schedule</span>
            </div>
            <p class="mode-card-desc">
              Automatically schedules for the next available morning/afternoon window in contact's local timezone.
            </p>
          </div>

          <div
            class="mode-card"
            [class.active]="sendMode === 'manual'"
            (click)="sendMode = 'manual'"
          >
            <div class="mode-card-header">
              <mat-icon style="color: #a78bfa;">calendar_month</mat-icon>
              <span>Custom Date & Time</span>
            </div>
            <p class="mode-card-desc">
              Pick a specific date and local time for delivery.
            </p>
          </div>
        </div>

        <!-- Manual Datetime Picker Section -->
        <div *ngIf="sendMode === 'manual'" class="manual-picker-section">
          <div class="picker-row">
            <mat-form-field appearance="outline" class="picker-field">
              <mat-label>Select Date</mat-label>
              <input matInput type="date" [(ngModel)]="selectedDate" [min]="todayDateStr" required>
            </mat-form-field>

            <mat-form-field appearance="outline" class="picker-field">
              <mat-label>Select Time</mat-label>
              <input matInput type="time" [(ngModel)]="selectedTime" required>
            </mat-form-field>
          </div>
          <p class="picker-hint">
            Time will be scheduled according to local browser time and converted to UTC automatically.
          </p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button (click)="onCancel()">Cancel</button>
        <button mat-flat-button color="primary" (click)="onConfirm()" [disabled]="!isValid()">
          Confirm & Schedule
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .schedule-dialog-container {
      padding: 0.5rem;
      color: #e2e8f0;
    }
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .dialog-sub {
      font-size: 0.85rem;
      color: #94a3b8;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .tz-badge {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      font-size: 0.72rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }
    .mode-selector-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
      margin-bottom: 1.25rem;
    }
    .mode-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 0.85rem;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
    }
    .mode-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(59, 130, 246, 0.3);
    }
    .mode-card.active {
      background: rgba(59, 130, 246, 0.12);
      border-color: #3b82f6;
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.2);
    }
    .mode-card-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 700;
      font-size: 0.9rem;
      color: #f1f5f9;
      margin-bottom: 0.35rem;
    }
    .mode-card-desc {
      font-size: 0.75rem;
      color: #94a3b8;
      margin: 0;
      line-height: 1.35;
    }
    .manual-picker-section {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .picker-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
    }
    .picker-hint {
      font-size: 0.72rem;
      color: #64748b;
      margin: 0.25rem 0 0 0;
    }
    .dialog-actions {
      margin-top: 1rem;
    }

    :host-context(body.light-theme) .schedule-dialog-container { color: #0f172a; }
    :host-context(body.light-theme) .dialog-title { color: #0f172a; }
    :host-context(body.light-theme) .dialog-sub { color: #475569; }
    :host-context(body.light-theme) .mode-card { background: #f8fafc; border-color: #e2e8f0; }
    :host-context(body.light-theme) .mode-card:hover { background: #f1f5f9; border-color: #93c5fd; }
    :host-context(body.light-theme) .mode-card.active { background: #eff6ff; border-color: #3b82f6; }
    :host-context(body.light-theme) .mode-card-header { color: #0f172a; }
    :host-context(body.light-theme) .mode-card-desc { color: #475569; }
    :host-context(body.light-theme) .manual-picker-section { background: #f8fafc; border-color: #e2e8f0; }
  `]
})
export class ScheduleDialogComponent implements OnInit {
  sendMode: 'smart_send' | 'manual' = 'smart_send';
  selectedDate: string = '';
  selectedTime: string = '09:00';
  todayDateStr: string = '';

  constructor(
    public dialogRef: MatDialogRef<ScheduleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ScheduleDialogData
  ) {}

  ngOnInit(): void {
    const today = new Date();
    this.todayDateStr = today.toISOString().split('T')[0];
    today.setDate(today.getDate() + 1);
    this.selectedDate = today.toISOString().split('T')[0];
  }

  isValid(): boolean {
    if (this.sendMode === 'smart_send') return true;
    return !!(this.selectedDate && this.selectedTime);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (!this.isValid()) return;

    if (this.sendMode === 'smart_send') {
      this.dialogRef.close({ send_mode: 'smart_send' });
    } else {
      const dateTimeStr = `${this.selectedDate}T${this.selectedTime}:00`;
      const localDt = new Date(dateTimeStr);
      const isoUtc = localDt.toISOString();
      this.dialogRef.close({
        send_mode: 'manual',
        manual_time_utc: isoUtc
      });
    }
  }
}
