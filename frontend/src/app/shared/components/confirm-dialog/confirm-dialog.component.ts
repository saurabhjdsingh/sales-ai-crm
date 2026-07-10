import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <div class="confirm-dialog">
      <h2 mat-dialog-title>{{ data.title || 'Confirm Action' }}</h2>
      <div mat-dialog-content>
        <p class="message">{{ data.message }}</p>
      </div>
      <div mat-dialog-actions align="end">
        <button mat-button class="cancel-btn" (click)="onCancel()">{{ data.cancelText || 'Cancel' }}</button>
        <button mat-flat-button class="confirm-btn" (click)="onConfirm()">{{ data.confirmText || 'Delete' }}</button>
      </div>
    </div>
  `,
  styles: [`
    .confirm-dialog {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 1.5rem;
      color: #f8fafc;
    }
    h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc !important;
      margin: 0 0 1rem 0;
      padding: 0 !important;
      border: none !important;
    }
    .message {
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0 0 1.5rem 0;
    }
    div[mat-dialog-actions] {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 0 !important;
      margin: 0;
      border: none;
    }
    .cancel-btn {
      color: #94a3b8 !important;
    }
    .confirm-btn {
      background-color: #ef4444 !important;
      color: #ffffff !important;
      border-radius: 6px;
    }
    .confirm-btn:hover {
      background-color: #dc2626 !important;
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      title?: string;
      message: string;
      cancelText?: string;
      confirmText?: string;
    }
  ) {}

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
