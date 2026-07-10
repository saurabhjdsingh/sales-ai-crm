import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { BrandingService } from '../../core/services/branding.service';

@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="login-container">
      <div class="glow-bg"></div>
      <div class="login-card">
        <div class="brand">
          @if (brandingService.logoUrl()) {
            <img [src]="brandingService.logoUrl()" class="brand-logo-img" alt="Logo" />
          } @else {
            <mat-icon class="brand-icon">radar</mat-icon>
          }
          <span class="brand-name">{{ brandingService.organizationName() }}</span>
        </div>
        
        <h2>Set your password</h2>
        <p class="subtitle">Complete your profile setup to join the platform</p>
        
        @if (success()) {
          <div class="success-state">
            <mat-icon class="success-icon">check_circle</mat-icon>
            <p class="success-p">Password set successfully! You can now log in.</p>
            <button mat-flat-button color="primary" class="submit-btn" routerLink="/login">
              Go to Login
            </button>
          </div>
        } @else {
          <form [formGroup]="inviteForm" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>New Password</mat-label>
              <input matInput [type]="hidePassword() ? 'password' : 'text'" formControlName="password" autocomplete="new-password">
              <button mat-icon-button matSuffix type="button" (click)="hidePassword.set(!hidePassword())" [attr.aria-label]="'Hide password'">
                <mat-icon>{{hidePassword() ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
              @if (inviteForm.get('password')?.hasError('required') && inviteForm.get('password')?.touched) {
                <mat-error>Password is required</mat-error>
              }
              @if (inviteForm.get('password')?.hasError('minlength') && inviteForm.get('password')?.touched) {
                <mat-error>Password must be at least 8 characters long</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Confirm Password</mat-label>
              <input matInput [type]="hideConfirmPassword() ? 'password' : 'text'" formControlName="confirmPassword" autocomplete="new-password">
              <button mat-icon-button matSuffix type="button" (click)="hideConfirmPassword.set(!hideConfirmPassword())" [attr.aria-label]="'Hide password'">
                <mat-icon>{{hideConfirmPassword() ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
              @if (inviteForm.get('confirmPassword')?.touched && inviteForm.hasError('mismatch')) {
                <mat-error>Passwords do not match</mat-error>
              }
            </mat-form-field>
            
            <button mat-flat-button color="primary" class="submit-btn" type="submit" [disabled]="inviteForm.invalid || loading()">
              @if (loading()) {
                <mat-spinner diameter="20" class="spinner"></mat-spinner>
              } @else {
                Set Password
              }
            </button>
          </form>
        }
      </div>
      
      <div class="login-footer">
        © 2026 Radar 36. For internal use only.
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: radial-gradient(circle at top, #1e293b, #0f172a, #020617);
      color: #f8fafc;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
    }
    
    .glow-bg {
      position: absolute;
      top: -20%;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 400px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }
    
    .login-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 420px;
      padding: 2.5rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }
    
    .brand-logo-img {
      width: 32px;
      height: 32px;
      object-fit: contain;
      border-radius: 6px;
      flex-shrink: 0;
    }
    
    .brand-icon {
      color: #3b82f6;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }
    
    .brand-name {
      font-weight: 700;
      font-size: 1.25rem;
      letter-spacing: -0.025em;
    }
    
    h2 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.025em;
    }
    
    .subtitle {
      color: #94a3b8;
      font-size: 0.95rem;
      margin-bottom: 2rem;
    }
    
    .full-width {
      width: 100%;
      margin-bottom: 1.25rem;
    }
    
    ::ng-deep .mat-mdc-text-field-wrapper {
      background-color: rgba(30, 41, 59, 0.4) !important;
      border-color: rgba(255, 255, 255, 0.05) !important;
    }
    
    ::ng-deep .mat-mdc-form-field-focus-overlay {
      background-color: transparent !important;
    }
    
    .submit-btn {
      width: 100%;
      height: 48px;
      margin-top: 1rem;
      background-color: #3b82f6 !important;
      color: white !important;
      font-weight: 600;
      font-size: 1rem;
      border-radius: 8px;
      transition: all 0.2s;
    }
    
    .submit-btn:hover:not([disabled]) {
      background-color: #2563eb !important;
      box-shadow: 0 0 16px rgba(59, 130, 246, 0.4);
    }
    
    .spinner {
      margin: 0 auto;
    }

    .success-state {
      text-align: center;
      padding: 1rem 0;
    }

    .success-icon {
      color: #10b981;
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 1rem;
    }

    .success-p {
      color: #e2e8f0;
      font-size: 1.1rem;
      line-height: 1.5;
      margin-bottom: 2rem;
    }
    
    .login-footer {
      margin-top: 2rem;
      color: #64748b;
      font-size: 0.8rem;
      z-index: 1;
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `]
})
export class AcceptInviteComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);
  readonly brandingService = inject(BrandingService);

  readonly inviteForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  readonly loading = signal(false);
  readonly success = signal(false);
  readonly hidePassword = signal(true);
  readonly hideConfirmPassword = signal(true);

  private uid: string | null = null;
  private token: string | null = null;

  ngOnInit(): void {
    this.uid = this.route.snapshot.queryParamMap.get('uid');
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.uid || !this.token) {
      this.notification.error('Invalid or missing invitation link parameters.');
      this.router.navigate(['/login']);
    }
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  onSubmit(): void {
    if (this.inviteForm.invalid || !this.uid || !this.token) return;

    this.loading.set(true);
    const payload = {
      uid: this.uid,
      token: this.token,
      password: this.inviteForm.value.password
    };

    this.apiService.post('/auth/team/accept-invite/', payload).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        this.notification.success('Password set successfully!');
      },
      error: (err) => {
        this.loading.set(false);
        const errMsg = err.error?.error || 'Failed to accept invitation. The link may have expired.';
        this.notification.error(errMsg);
      }
    });
  }
}
