import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { BrandingService } from '../../core/services/branding.service';

@Component({
  selector: 'app-reset-password',
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
        
        <h2>Reset your password</h2>
        <p class="subtitle">Enter your new password to restore access to your account</p>
        
        @if (success()) {
          <div class="success-state">
            <mat-icon class="success-icon">check_circle</mat-icon>
            <p class="success-p">Password reset successfully! You can now log in.</p>
            <button mat-flat-button color="primary" class="submit-btn" routerLink="/login">
              Go to Login
            </button>
          </div>
        } @else {
          <form [formGroup]="resetForm" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>New Password</mat-label>
              <input matInput [type]="hidePassword() ? 'password' : 'text'" formControlName="password" autocomplete="new-password">
              <button mat-icon-button matSuffix type="button" (click)="hidePassword.set(!hidePassword())" [attr.aria-label]="'Hide password'">
                <mat-icon>{{hidePassword() ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
              @if (resetForm.get('password')?.hasError('required') && resetForm.get('password')?.touched) {
                <mat-error>Password is required</mat-error>
              }
              @if (resetForm.get('password')?.hasError('minlength') && resetForm.get('password')?.touched) {
                <mat-error>Password must be at least 8 characters long</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Confirm Password</mat-label>
              <input matInput [type]="hideConfirmPassword() ? 'password' : 'text'" formControlName="confirmPassword" autocomplete="new-password">
              <button mat-icon-button matSuffix type="button" (click)="hideConfirmPassword.set(!hideConfirmPassword())" [attr.aria-label]="'Hide password'">
                <mat-icon>{{hideConfirmPassword() ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
              @if (resetForm.get('confirmPassword')?.touched && resetForm.hasError('mismatch')) {
                <mat-error>Passwords do not match</mat-error>
              }
            </mat-form-field>
            
            <button mat-flat-button color="primary" class="submit-btn" type="submit" [disabled]="resetForm.invalid || loading()">
              @if (loading()) {
                <mat-spinner diameter="20" class="spinner"></mat-spinner>
              } @else {
                Reset Password
              }
            </button>
          </form>
        }
      </div>
      
      <div class="login-footer">
        © 2026 {{ brandingService.organizationName() }}. For internal use only.
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
      max-width: 440px;
      padding: 2.5rem;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: cardEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }
    
    .brand-logo-img {
      height: 32px;
      object-fit: contain;
    }

    .brand-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #3b82f6;
    }
    
    .brand-name {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      background: linear-gradient(to right, #3b82f6, #60a5fa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    h2 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
      color: #f8fafc;
    }
    
    .subtitle {
      color: #94a3b8;
      margin: 0 0 2rem 0;
      font-size: 0.95rem;
    }
    
    .full-width {
      width: 100%;
      margin-bottom: 1rem;
    }
    
    .submit-btn {
      width: 100%;
      padding: 1.5rem !important;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
      margin-top: 1rem;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
      color: #ffffff !important;
      box-shadow: 0 4px 14px 0 rgba(59, 130, 246, 0.3);
      transition: all 0.2s ease;
    }
    
    .submit-btn:hover:not([disabled]) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px 0 rgba(59, 130, 246, 0.4);
    }
    
    .spinner {
      margin: 0 auto;
    }
    
    .login-footer {
      position: absolute;
      bottom: 2rem;
      font-size: 0.8rem;
      color: #475569;
    }
    
    .success-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem 0;
    }
    
    .success-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #10b981;
      margin-bottom: 1.5rem;
    }
    
    .success-p {
      text-align: center;
      color: #e2e8f0;
      font-size: 1.1rem;
      margin-bottom: 2rem;
    }
    
    @keyframes cardEntrance {
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
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly notification = inject(NotificationService);
  readonly brandingService = inject(BrandingService);

  readonly resetForm = this.fb.group({
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
      this.notification.error('Invalid or missing password reset link parameters.');
      this.router.navigate(['/login']);
    }
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  onSubmit(): void {
    if (this.resetForm.invalid || !this.uid || !this.token) return;

    this.loading.set(true);
    const payload = {
      uid: this.uid,
      token: this.token,
      password: this.resetForm.value.password
    };

    this.authService.confirmPasswordReset(payload).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        this.notification.success('Password reset successfully!');
      },
      error: (err) => {
        this.loading.set(false);
        const errMsg = err.error?.error || 'Failed to reset password. The link may have expired.';
        this.notification.error(errMsg);
      }
    });
  }
}
