import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { BrandingService } from '../../core/services/branding.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
        
        @if (!forgotPasswordMode()) {
          <h2>Welcome back</h2>
          <p class="subtitle">Sign in to your Radar 36 account to continue</p>
          
          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email address</mat-label>
              <input matInput type="email" formControlName="email" placeholder="name@radar36.com" autocomplete="email">
              <mat-icon matSuffix>email</mat-icon>
              @if (loginForm.get('email')?.hasError('required') && loginForm.get('email')?.touched) {
                <mat-error>Email is required</mat-error>
              }
              @if (loginForm.get('email')?.hasError('email') && loginForm.get('email')?.touched) {
                <mat-error>Please enter a valid email address</mat-error>
              }
            </mat-form-field>
            
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput [type]="hidePassword() ? 'password' : 'text'" formControlName="password" autocomplete="current-password">
              <button mat-icon-button matSuffix type="button" (click)="hidePassword.set(!hidePassword())" [attr.aria-label]="'Hide password'" [attr.aria-pressed]="hidePassword()">
                <mat-icon>{{hidePassword() ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
              @if (loginForm.get('password')?.hasError('required') && loginForm.get('password')?.touched) {
                <mat-error>Password is required</mat-error>
              }
            </mat-form-field>

            <div class="forgot-pwd-link-container">
              <button mat-button type="button" class="forgot-btn" (click)="forgotPasswordMode.set(true)">Forgot Password?</button>
            </div>
            
            <button mat-flat-button color="primary" class="submit-btn" type="submit" [disabled]="loginForm.invalid || loading()">
              @if (loading()) {
                <mat-spinner diameter="20" class="spinner"></mat-spinner>
              } @else {
                Sign In
              }
            </button>
          </form>
        } @else {
          <h2>Reset password</h2>
          <p class="subtitle">Enter your email and we'll send you a link to reset your password</p>
          
          <form [formGroup]="resetRequestForm" (ngSubmit)="onResetRequest()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email address</mat-label>
              <input matInput type="email" formControlName="email" placeholder="name@radar36.com" autocomplete="email">
              <mat-icon matSuffix>email</mat-icon>
              @if (resetRequestForm.get('email')?.hasError('required') && resetRequestForm.get('email')?.touched) {
                <mat-error>Email is required</mat-error>
              }
              @if (resetRequestForm.get('email')?.hasError('email') && resetRequestForm.get('email')?.touched) {
                <mat-error>Please enter a valid email address</mat-error>
              }
            </mat-form-field>
            
            <button mat-flat-button color="primary" class="submit-btn" type="submit" [disabled]="resetRequestForm.invalid || loading()">
              @if (loading()) {
                <mat-spinner diameter="20" class="spinner"></mat-spinner>
              } @else {
                Send Reset Link
              }
            </button>

            <button mat-button type="button" class="back-btn" (click)="forgotPasswordMode.set(false)" [disabled]="loading()">
              Back to Sign In
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
    
    .brand-badge {
      font-size: 0.75rem;
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-weight: 600;
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

    .forgot-pwd-link-container {
      display: flex;
      justify-content: flex-end;
      margin-top: -0.5rem;
      margin-bottom: 1.5rem;
    }
    .forgot-btn {
      color: #3b82f6 !important;
      font-size: 0.85rem;
      padding: 0 !important;
      min-width: unset !important;
    }
    .forgot-btn:hover {
      text-decoration: underline;
    }
    .back-btn {
      width: 100%;
      margin-top: 1rem !important;
      color: #94a3b8 !important;
    }
    .back-btn:hover {
      color: #f8fafc !important;
    }
  `]
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  readonly brandingService = inject(BrandingService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  readonly resetRequestForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  readonly loading = signal(false);
  readonly hidePassword = signal(true);
  readonly forgotPasswordMode = signal(false);

  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.loading.set(true);
    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.loading.set(false);
        this.notificationService.success('Logged in successfully');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        const errMsg = err.error?.error?.message || 'Login failed. Please check your credentials.';
        this.notificationService.error(errMsg);
      }
    });
  }

  onResetRequest(): void {
    if (this.resetRequestForm.invalid) return;

    this.loading.set(true);
    this.authService.requestPasswordReset(this.resetRequestForm.get('email')?.value).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.notificationService.success(res.message || 'If this email is registered, a password reset link has been sent.');
        this.forgotPasswordMode.set(false);
        this.resetRequestForm.reset();
      },
      error: (err) => {
        this.loading.set(false);
        const errMsg = err.error?.error?.message || 'Failed to request password reset.';
        this.notificationService.error(errMsg);
      }
    });
  }
}
