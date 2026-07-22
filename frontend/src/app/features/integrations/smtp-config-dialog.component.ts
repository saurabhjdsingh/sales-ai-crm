import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-smtp-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="smtp-dialog-container">
      <div class="dialog-header">
        <div class="title-group">
          <mat-icon style="color: #60a5fa; font-size: 24px; width: 24px; height: 24px;">dns</mat-icon>
          <h2 mat-dialog-title style="margin: 0; font-size: 1.15rem; font-weight: 700;">Connect Secondary SMTP Sender</h2>
        </div>
        <button mat-icon-button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <p class="dialog-subtitle">
        Configure a custom SMTP outbound server (SendGrid, Mailgun, SES, Custom Domain) for cold sales sequences & outreach while preserving your primary inbox reputation.
      </p>

      <mat-dialog-content class="dialog-body">
        <form [formGroup]="smtpForm" (ngSubmit)="submit()" class="smtp-form">
          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Outbound Sender Email</mat-label>
              <input matInput formControlName="email" placeholder="e.g. outreach@companymail.io" type="email" />
              <mat-error *ngIf="smtpForm.get('email')?.hasError('required')">Sender email is required</mat-error>
              <mat-error *ngIf="smtpForm.get('email')?.hasError('email')">Invalid email address</mat-error>
            </mat-form-field>
          </div>

          <div class="form-row split-2">
            <mat-form-field appearance="outline">
              <mat-label>SMTP Host</mat-label>
              <input matInput formControlName="smtp_host" placeholder="e.g. smtp.sendgrid.net" />
              <mat-error *ngIf="smtpForm.get('smtp_host')?.hasError('required')">Host is required</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>SMTP Port</mat-label>
              <input matInput formControlName="smtp_port" type="number" placeholder="587" />
              <mat-error *ngIf="smtpForm.get('smtp_port')?.hasError('required')">Port is required</mat-error>
            </mat-form-field>
          </div>

          <div class="form-row split-2">
            <mat-form-field appearance="outline">
              <mat-label>SMTP Username / API Key</mat-label>
              <input matInput formControlName="smtp_username" placeholder="e.g. apikey or user@domain.com" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>SMTP Password / Secret</mat-label>
              <input matInput formControlName="smtp_password" type="password" placeholder="••••••••••••" />
              <mat-error *ngIf="smtpForm.get('smtp_password')?.hasError('required')">Password is required</mat-error>
            </mat-form-field>
          </div>

          <div class="security-toggles" style="display: flex; gap: 1.5rem; margin-top: 0.5rem;">
            <mat-slide-toggle formControlName="smtp_use_tls" color="primary">Use STARTTLS (Port 587)</mat-slide-toggle>
            <mat-slide-toggle formControlName="smtp_use_ssl" color="primary">Use SSL/TLS (Port 465)</mat-slide-toggle>
          </div>

          <div *ngIf="errorMessage()" class="error-banner">
            <mat-icon style="font-size: 18px; width: 18px; height: 18px;">error_outline</mat-icon>
            <span>{{ errorMessage() }}</span>
          </div>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button (click)="close()" type="button" [disabled]="testing()">Cancel</button>
        <button
          type="button"
          mat-raised-button
          color="primary"
          (click)="submit()"
          [disabled]="smtpForm.invalid || testing()"
          class="test-save-btn"
        >
          <mat-spinner diameter="18" *ngIf="testing()"></mat-spinner>
          <mat-icon *ngIf="!testing()">verified_user</mat-icon>
          <span>{{ testing() ? 'Testing Connection...' : 'Test & Save SMTP' }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .smtp-dialog-container {
      display: flex;
      flex-direction: column;
      padding: 0.5rem;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }
    .title-group {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .close-btn { color: #94a3b8; }
    .dialog-subtitle {
      font-size: 0.8rem;
      color: #94a3b8;
      margin: 0.75rem 0 1rem 0;
      line-height: 1.4;
    }
    .dialog-body {
      padding: 0.5rem 0 !important;
      margin: 0;
    }
    .smtp-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .full-width { width: 100%; }
    .split-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .error-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      padding: 0.6rem 0.85rem;
      border-radius: 6px;
      font-size: 0.8rem;
      margin-top: 0.5rem;
    }
    .dialog-actions {
      padding-top: 1rem !important;
      border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      display: flex;
      gap: 0.5rem;
    }
    .test-save-btn {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background-color: #3b82f6 !important;
      color: #ffffff !important;
    }
  `]
})
export class SmtpConfigDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly dialogRef = inject(MatDialogRef<SmtpConfigDialogComponent>);

  readonly testing = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly smtpForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    smtp_host: ['', [Validators.required]],
    smtp_port: [587, [Validators.required]],
    smtp_username: [''],
    smtp_password: ['', [Validators.required]],
    smtp_use_tls: [true],
    smtp_use_ssl: [false],
  });

  submit(): void {
    if (this.smtpForm.invalid) return;

    this.testing.set(true);
    this.errorMessage.set(null);

    const val = this.smtpForm.value;
    this.apiService.post<any>('/emails/smtp/connect/', val).subscribe({
      next: (res) => {
        this.testing.set(false);
        this.notification.success('Secondary SMTP outbound sender connected successfully!');
        this.dialogRef.close(res);
      },
      error: (err) => {
        this.testing.set(false);
        const msg = err.error?.error || 'Failed to authenticate SMTP connection. Please check server and credentials.';
        this.errorMessage.set(msg);
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
