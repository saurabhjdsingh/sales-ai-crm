import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrandingService } from '../../core/services/branding.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ApiService } from '../../core/services/api.service';

interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  job_title: string;
  status: 'active' | 'pending' | 'inactive';
  is_active: boolean;
}

interface AIConfig {
  id?: string;
  provider: string;
  config_type: string;
  model_name: string;
  base_url: string;
  api_key_masked: string;
  is_active: boolean;
  configured?: boolean;
}

interface LinkedInConfig {
  id?: string;
  linkedin_url: string;
  has_cookies: boolean;
  is_active: boolean;
}

interface AIPrompt {
  key: string;
  label: string;
  description: string;
  category: string;
  template_variables: string[];
  default_content: string;
  content: string;
  is_customized: boolean;
  updated_at: string | null;
}

interface LLMStats {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost: number;
  usage_by_model: Array<{
    model_name: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
  }>;
  usage_by_purpose: Array<{
    purpose: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
  }>;
}

interface AIProviderOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultModels: string[];
  placeholder: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule
  ],
  template: `
    <div class="settings-container">
      <div class="list-header">
        <div>
          <h1>Settings</h1>
          <p class="subtitle">Manage your CRM account and view team members</p>
        </div>
      </div>

      <div class="settings-layout">
        <!-- Edit Profile & Password Cards -->
        <div class="settings-forms">
          <!-- Profile Card -->
          <div class="card settings-card">
            <div class="card-header">
              <mat-icon>person</mat-icon>
              <h3>My Profile</h3>
            </div>
            <div class="card-body">
              <form [formGroup]="profileForm" (ngSubmit)="onProfileSubmit()">
                <div class="form-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>First Name</mat-label>
                    <input matInput formControlName="first_name" required>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Last Name</mat-label>
                    <input matInput formControlName="last_name" required>
                  </mat-form-field>
                </div>

                <div class="form-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>Email Address</mat-label>
                    <input matInput type="email" formControlName="email" required>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Phone Number</mat-label>
                    <input matInput formControlName="phone">
                  </mat-form-field>
                </div>

                <div class="form-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>Timezone</mat-label>
                    <input matInput formControlName="timezone" required>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Job Title</mat-label>
                    <input matInput formControlName="job_title">
                  </mat-form-field>
                </div>

                <button mat-flat-button color="primary" class="save-btn" type="submit" [disabled]="profileForm.invalid || savingProfile()">
                  @if (savingProfile()) {
                    <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                    Save Profile
                  }
                </button>
              </form>
            </div>
          </div>

          <!-- Password Card -->
          <div class="card settings-card">
            <div class="card-header">
              <mat-icon>lock</mat-icon>
              <h3>Change Password</h3>
            </div>
            <div class="card-body">
              <form [formGroup]="passwordForm" (ngSubmit)="onPasswordSubmit()">
                <div class="form-row">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Old Password</mat-label>
                    <input matInput type="password" formControlName="old_password" required autocomplete="current-password">
                  </mat-form-field>
                </div>

                <div class="form-row">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>New Password</mat-label>
                    <input matInput type="password" formControlName="new_password" required autocomplete="new-password">
                  </mat-form-field>
                </div>

                <div class="form-row">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Confirm New Password</mat-label>
                    <input matInput type="password" formControlName="confirm_password" required autocomplete="new-password">
                    @if (passwordForm.hasError('mismatch') && passwordForm.get('confirm_password')?.touched) {
                      <mat-error>New passwords do not match</mat-error>
                    }
                  </mat-form-field>
                </div>

                <button mat-flat-button color="primary" class="save-btn" type="submit" [disabled]="passwordForm.invalid || savingPassword()">
                  @if (savingPassword()) {
                    <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                    Update Password
                  }
                </button>
              </form>
            </div>
          </div>

          <!-- Organization Branding Settings (Admin Only) -->
          <div class="card settings-card" *ngIf="isAdmin()">
            <div class="card-header">
              <mat-icon>business</mat-icon>
              <h3>Organization Branding</h3>
            </div>
            <div class="card-body">
              @if (showCropper()) {
                <div class="cropper-wrapper">
                  <p class="cropper-hint">Drag the image to position and use the slider to zoom.</p>
                  <div class="crop-viewport"
                       (mousedown)="startLogoDrag($event)"
                       (mousemove)="onLogoDrag($event)"
                       (mouseup)="endLogoDrag()"
                       (mouseleave)="endLogoDrag()">
                    <img [src]="cropImageSrc()"
                         [style.transform]="'translate(' + logoTranslateX() + 'px, ' + logoTranslateY() + 'px) scale(' + logoZoom() + ')'"
                         class="crop-image"
                         #cropImg
                         (load)="onLogoImageLoaded(cropImg)"
                         draggable="false" />
                    <div class="crop-ring"></div>
                  </div>
                  <div class="crop-slider-container">
                    <mat-icon>zoom_out</mat-icon>
                    <input type="range" min="1" max="4" step="0.05" [value]="logoZoom()" (input)="onLogoZoomChange($event)">
                    <mat-icon>zoom_in</mat-icon>
                  </div>
                  <div class="crop-actions">
                    <button mat-button type="button" (click)="cancelCropping()">Cancel</button>
                    <button mat-stroked-button type="button" (click)="applyDirectly()" [disabled]="savingBranding()">
                      Auto-Fit Directly
                    </button>
                    <button mat-flat-button color="primary" type="button" (click)="performCropAndSave()">
                      @if (savingBranding()) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        Crop & Save
                      }
                    </button>
                  </div>
                </div>
              } @else {
                <form [formGroup]="brandingForm" (ngSubmit)="onBrandingSubmit()">
                  <div class="branding-logo-section">
                    <div class="logo-preview-wrapper" (click)="logoInput.click()">
                      @if (brandingService.logoUrl()) {
                        <img [src]="brandingService.logoUrl()" class="logo-preview" alt="Org Logo" />
                        <div class="logo-preview-overlay">
                          <mat-icon>photo_camera</mat-icon>
                          <span>Change Logo</span>
                        </div>
                      } @else {
                        <div class="logo-placeholder">
                          <mat-icon>radar</mat-icon>
                          <span>Upload Logo</span>
                        </div>
                      }
                    </div>
                    <input type="file" #logoInput style="display: none" (change)="onLogoSelected($event)" accept="image/*">
                    
                    @if (brandingService.hasLogo()) {
                      <button mat-stroked-button color="warn" type="button" class="remove-logo-btn" (click)="removeLogo()" [disabled]="savingBranding()">
                        Remove Logo
                      </button>
                    }
                  </div>

                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Organization Name</mat-label>
                      <input matInput formControlName="organization_name" required>
                    </mat-form-field>
                  </div>

                  <button mat-flat-button color="primary" class="save-btn" type="submit" [disabled]="brandingForm.invalid || savingBranding()">
                    @if (savingBranding()) {
                      <mat-spinner diameter="18"></mat-spinner>
                    } @else {
                      Save Branding
                    }
                  </button>
                </form>
              }
            </div>
          </div>

          <!-- SMTP Integration Settings (Admin Only) -->
          <div class="card settings-card" *ngIf="isAdmin()">
            <div class="card-header">
              <mat-icon>mail_lock</mat-icon>
              <h3>SMTP Integration</h3>
            </div>
            <div class="card-body">
              <p class="form-instructions" style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 1.25rem; line-height: 1.4;">
                Configure custom SMTP credentials (e.g. AWS SES, SendGrid, Mailgun) to send system emails and invitations on your organization's behalf.
              </p>
              
              @if (smtpConfig() && !smtpEditMode()) {
                <div class="ai-saved-config" style="animation: fadeSlideIn 0.3s ease">
                  <div class="ai-saved-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
                    <div class="ai-provider-badge smtp" style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.25); color: #10b981; display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.85rem; border-radius: 20px; font-weight: 700; font-size: 0.8rem;">
                      <span class="provider-icon">📧</span>
                      <span class="provider-label">SMTP Active</span>
                    </div>
                    <span class="config-type-tag" style="background: rgba(16, 163, 127, 0.1); border: 1px solid rgba(16, 163, 127, 0.2); color: #10a37f; display: inline-flex; align-items: center; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                      Configured
                    </span>
                  </div>

                  <div class="ai-saved-details" style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <div class="detail-row" style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0;">
                      <span class="detail-label" style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">SMTP Host</span>
                      <span class="detail-value model-value" style="font-size: 0.85rem; color: #e2e8f0; font-weight: 500; font-family: 'SF Mono', 'Fira Code', monospace; color: #a78bfa;">{{ smtpConfig().smtp_host }}</span>
                    </div>
                    <div class="detail-row" style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid rgba(255, 255, 255, 0.03);">
                      <span class="detail-label" style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Port</span>
                      <span class="detail-value" style="font-size: 0.85rem; color: #e2e8f0; font-weight: 500;">{{ smtpConfig().smtp_port }}</span>
                    </div>
                    @if (smtpConfig().smtp_username) {
                      <div class="detail-row" style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid rgba(255, 255, 255, 0.03);">
                        <span class="detail-label" style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Username</span>
                        <span class="detail-value" style="font-size: 0.85rem; color: #e2e8f0; font-weight: 500;">{{ smtpConfig().smtp_username }}</span>
                      </div>
                    }
                    <div class="detail-row" style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid rgba(255, 255, 255, 0.03);">
                      <span class="detail-label" style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Password</span>
                      <span class="detail-value key-value" style="font-size: 0.85rem; color: #e2e8f0; font-weight: 500; display: flex; align-items: center; gap: 0.35rem; font-family: 'SF Mono', 'Fira Code', monospace; color: #94a3b8; font-size: 0.8rem;">
                        <mat-icon class="key-icon" style="font-size: 16px !important; width: 16px !important; height: 16px !important; color: #10b981; display: inline-flex; align-items: center; justify-content: center;">check_circle</mat-icon>
                        {{ smtpConfig().smtp_has_password ? 'Saved / Encrypted' : 'Not Saved' }}
                      </span>
                    </div>
                    <div class="detail-row" style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid rgba(255, 255, 255, 0.03);">
                      <span class="detail-label" style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Sender Email</span>
                      <span class="detail-value" style="font-size: 0.85rem; color: #e2e8f0; font-weight: 500;">{{ smtpConfig().smtp_from_email || 'Not configured' }}</span>
                    </div>
                    <div class="detail-row" style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid rgba(255, 255, 255, 0.03);">
                      <span class="detail-label" style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Encryption</span>
                      <span class="detail-value" style="font-size: 0.85rem; color: #e2e8f0; font-weight: 500;">
                        {{ smtpConfig().smtp_use_ssl ? 'SSL' : (smtpConfig().smtp_use_tls ? 'TLS' : 'None') }}
                      </span>
                    </div>
                  </div>

                  <div class="ai-saved-actions" style="display: flex; gap: 0.5rem;">
                    <button mat-flat-button class="reconfigure-btn" (click)="startSmtpEdit()">
                      <mat-icon>edit</mat-icon>
                      Reconfigure
                    </button>
                    <button mat-button class="remove-btn" (click)="deleteSmtpConfig()" [disabled]="savingSmtp()">
                      @if (savingSmtp()) {
                        <mat-spinner diameter="16"></mat-spinner>
                      } @else {
                        <ng-container>
                          <mat-icon>delete_outline</mat-icon>
                          Remove
                        </ng-container>
                      }
                    </button>
                  </div>
                </div>
              } @else {
                <form [formGroup]="smtpForm" (ngSubmit)="onSMTPSubmit()">
                  <div class="form-row" style="display: grid; grid-template-columns: 3fr 1fr; gap: 1rem;">
                    <mat-form-field appearance="outline">
                      <mat-label>SMTP Host</mat-label>
                      <input matInput formControlName="smtp_host" placeholder="smtp.mailprovider.com" required>
                    </mat-form-field>
                    
                    <mat-form-field appearance="outline">
                      <mat-label>Port</mat-label>
                      <input matInput type="number" formControlName="smtp_port" placeholder="587" required>
                    </mat-form-field>
                  </div>

                  <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem;">
                    <mat-form-field appearance="outline">
                      <mat-label>Username</mat-label>
                      <input matInput formControlName="smtp_username" placeholder="smtp_user@domain.com">
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Password</mat-label>
                      <input matInput [type]="hideSmtpPassword() ? 'password' : 'text'" formControlName="smtp_password" [placeholder]="smtpHasPassword() ? '••••••••' : 'Enter SMTP password'">
                      <button mat-icon-button matSuffix type="button" (click)="hideSmtpPassword.set(!hideSmtpPassword())" [attr.aria-label]="'Hide password'">
                        <mat-icon>{{hideSmtpPassword() ? 'visibility_off' : 'visibility'}}</mat-icon>
                      </button>
                    </mat-form-field>
                  </div>

                  <div class="form-row" style="margin-top: 0.5rem;">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Sender Email (From Email)</mat-label>
                      <input matInput type="email" formControlName="smtp_from_email" placeholder="no-reply@yourcompany.com" required>
                    </mat-form-field>
                  </div>

                  <div class="form-row" style="display: flex; gap: 2rem; align-items: center; margin: 0.5rem 0 1rem 0;">
                    <mat-checkbox formControlName="smtp_use_tls" color="primary">Use TLS (Secure)</mat-checkbox>
                    <mat-checkbox formControlName="smtp_use_ssl" color="primary">Use SSL (Secure)</mat-checkbox>
                  </div>

                  <div class="ai-form-actions" style="display: flex; gap: 0.5rem;">
                    @if (smtpEditMode()) {
                      <button mat-button type="button" (click)="cancelSmtpEdit()">Cancel</button>
                    }
                    <button mat-flat-button color="primary" class="save-btn" type="submit" [disabled]="smtpForm.invalid || savingSmtp()">
                      @if (savingSmtp()) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        <ng-container>
                          <mat-icon>save</mat-icon>
                          Save SMTP Configuration
                        </ng-container>
                      }
                    </button>
                  </div>
                </form>
              }
            </div>
          </div>

          <!-- AI Configuration Card -->
          <div class="card settings-card ai-config-card">
            <div class="card-header">
              <mat-icon>smart_toy</mat-icon>
              <h3>AI Configuration</h3>
            </div>
            <div class="card-body">
              <!-- Loading State -->
              @if (loadingAIConfig()) {
                <div class="ai-loading">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span>Loading AI configuration...</span>
                </div>
              }

              <!-- Saved Config Summary -->
              @else if (aiConfig() && !aiEditMode()) {
                <div class="ai-saved-config">
                  <div class="ai-saved-header">
                    <div class="ai-provider-badge" [ngClass]="aiConfig()!.provider">
                      <span class="provider-icon">{{ getProviderIcon(aiConfig()!.provider) }}</span>
                      <span class="provider-label">{{ getProviderName(aiConfig()!.provider) }}</span>
                    </div>
                    <span class="config-type-tag" [ngClass]="aiConfig()!.config_type">
                      {{ aiConfig()!.config_type === 'cloud_api' ? 'Cloud API' : 'Custom Endpoint' }}
                    </span>
                  </div>

                  <div class="ai-saved-details">
                    <div class="detail-row">
                      <span class="detail-label">Model</span>
                      <span class="detail-value model-value">{{ aiConfig()!.model_name }}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">API Key</span>
                      <span class="detail-value key-value">
                        <mat-icon class="key-icon">vpn_key</mat-icon>
                        {{ aiConfig()!.api_key_masked }}
                      </span>
                    </div>
                    @if (aiConfig()!.base_url) {
                      <div class="detail-row">
                        <span class="detail-label">Endpoint</span>
                        <span class="detail-value endpoint-value">{{ aiConfig()!.base_url }}</span>
                      </div>
                    }
                  </div>

                  <div class="ai-saved-actions">
                    <button mat-flat-button class="reconfigure-btn" (click)="startAIEdit()">
                      <mat-icon>edit</mat-icon>
                      Reconfigure
                    </button>
                    <button mat-button class="remove-btn" (click)="deleteAIConfig()" [disabled]="deletingAIConfig()">
                      @if (deletingAIConfig()) {
                        <mat-spinner diameter="16"></mat-spinner>
                      } @else {
                        <ng-container>
                          <mat-icon>delete_outline</mat-icon>
                          Remove
                        </ng-container>
                      }
                    </button>
                  </div>
                </div>
              }

              <!-- Setup / Edit Flow -->
              @else if (!loadingAIConfig()) {
                <!-- Step 1: Provider Selection -->
                <div class="ai-step">
                  <div class="step-label">
                    <span class="step-number">1</span>
                    Choose your AI Provider
                  </div>
                  <div class="provider-cards">
                    @for (p of providers; track p.id) {
                      <div
                        class="provider-card"
                        [class.selected]="selectedProvider() === p.id"
                        (click)="selectProvider(p.id)"
                      >
                        <span class="provider-card-icon">{{ p.icon }}</span>
                        <span class="provider-card-name">{{ p.name }}</span>
                        @if (selectedProvider() === p.id) {
                          <mat-icon class="check-icon">check_circle</mat-icon>
                        }
                      </div>
                    }
                  </div>
                </div>

                <!-- Step 2: Config Type (only after provider selected) -->
                @if (selectedProvider()) {
                  <div class="ai-step" style="animation: fadeSlideIn 0.3s ease">
                    <div class="step-label">
                      <span class="step-number">2</span>
                      Configuration Type
                    </div>
                    <div class="config-type-cards">
                      <div
                        class="config-type-card"
                        [class.selected]="selectedConfigType() === 'cloud_api'"
                        (click)="selectConfigType('cloud_api')"
                      >
                        <mat-icon>cloud</mat-icon>
                        <div>
                          <strong>Cloud API</strong>
                          <p>Use the provider's official API directly</p>
                        </div>
                      </div>
                      <div
                        class="config-type-card"
                        [class.selected]="selectedConfigType() === 'custom_endpoint'"
                        (click)="selectConfigType('custom_endpoint')"
                      >
                        <mat-icon>dns</mat-icon>
                        <div>
                          <strong>Custom Endpoint</strong>
                          <p>Bring your own endpoint (Azure, proxy, etc.)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                }

                <!-- Step 3: Credentials Form -->
                @if (selectedProvider() && selectedConfigType()) {
                  <div class="ai-step" style="animation: fadeSlideIn 0.3s ease">
                    <div class="step-label">
                      <span class="step-number">3</span>
                      Enter Credentials
                    </div>
                    <form [formGroup]="aiConfigForm" (ngSubmit)="saveAIConfig()" class="ai-form">
                      <div class="form-row">
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>API Key</mat-label>
                          <input
                            matInput
                            [type]="showAPIKey() ? 'text' : 'password'"
                            formControlName="api_key"
                            [placeholder]="getSelectedProvider()?.placeholder || 'Enter your API key'"
                            required
                          >
                          <button
                            matSuffix
                            mat-icon-button
                            type="button"
                            (click)="showAPIKey.set(!showAPIKey())"
                            tabindex="-1"
                          >
                            <mat-icon>{{ showAPIKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
                          </button>
                        </mat-form-field>
                      </div>

                      <div class="form-row">
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>Model Name</mat-label>
                          <input
                            matInput
                            formControlName="model_name"
                            [placeholder]="getModelPlaceholder()"
                            required
                          >
                          @if (getSelectedProvider()?.defaultModels?.length) {
                            <mat-hint>
                              Popular: {{ getSelectedProvider()!.defaultModels.join(', ') }}
                            </mat-hint>
                          }
                        </mat-form-field>
                      </div>

                      @if (selectedConfigType() === 'custom_endpoint') {
                        <div class="form-row" style="animation: fadeSlideIn 0.2s ease">
                          <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Base URL</mat-label>
                            <input
                              matInput
                              formControlName="base_url"
                              placeholder="https://your-endpoint.example.com"
                              required
                            >
                            <mat-hint>Your custom API endpoint URL</mat-hint>
                          </mat-form-field>
                        </div>
                      }

                      <div class="ai-form-actions">
                        @if (aiEditMode()) {
                          <button mat-button type="button" (click)="cancelAIEdit()">Cancel</button>
                        }
                        <button
                          mat-flat-button
                          color="primary"
                          class="save-btn"
                          type="submit"
                          [disabled]="aiConfigForm.invalid || savingAIConfig()"
                        >
                          @if (savingAIConfig()) {
                            <mat-spinner diameter="18"></mat-spinner>
                          } @else {
                            <ng-container>
                              <mat-icon>save</mat-icon>
                              Save Configuration
                            </ng-container>
                          }
                        </button>
                      </div>
                    </form>
                  </div>
                }
              }
            </div>
          </div>

          <!-- AI Prompts Card -->
          <div class="card settings-card ai-prompts-card">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <mat-icon>edit_note</mat-icon>
                <h3>AI Prompts</h3>
              </div>
              @if (aiPrompts().length > 0) {
                <button
                  mat-button
                  class="reset-all-btn"
                  (click)="resetAllPrompts()"
                  [disabled]="resettingAllPrompts()"
                >
                  @if (resettingAllPrompts()) {
                    <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                    Reset All to Defaults
                  }
                </button>
              }
            </div>
            <div class="card-body">
              <p class="prompts-intro">
                Customize the instructions sent to the AI for copilot chat, research, and ICP scoring.
                Defaults are pre-loaded — edit any prompt and save to use your version globally.
              </p>

              @if (loadingPrompts()) {
                <div class="ai-loading">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span>Loading AI prompts...</span>
                </div>
              } @else {
                <div class="prompt-list">
                  @for (prompt of aiPrompts(); track prompt.key) {
                    <div class="prompt-item" [class.expanded]="expandedPromptKey() === prompt.key">
                      <button
                        type="button"
                        class="prompt-item-header"
                        (click)="togglePrompt(prompt.key)"
                      >
                        <div class="prompt-item-title">
                          <mat-icon class="expand-icon">
                            {{ expandedPromptKey() === prompt.key ? 'expand_less' : 'expand_more' }}
                          </mat-icon>
                          <span class="prompt-label">{{ prompt.label }}</span>
                          @if (prompt.is_customized) {
                            <span class="custom-badge">Custom</span>
                          }
                        </div>
                        <span class="prompt-category">{{ prompt.category }}</span>
                      </button>

                      @if (expandedPromptKey() === prompt.key) {
                        <div class="prompt-item-body">
                          <p class="prompt-description">{{ prompt.description }}</p>

                          @if (prompt.template_variables.length > 0) {
                            <div class="template-vars">
                              <span class="vars-label">Required placeholders:</span>
                              @for (v of prompt.template_variables; track v) {
                                <code>{{ v }}</code>
                              }
                            </div>
                          }

                          <mat-form-field appearance="outline" class="full-width prompt-editor">
                            <mat-label>Prompt content</mat-label>
                            <textarea
                              matInput
                              rows="14"
                              [value]="getPromptDraft(prompt.key)"
                              (input)="updatePromptDraft(prompt.key, $any($event.target).value)"
                            ></textarea>
                          </mat-form-field>

                          <div class="prompt-actions">
                            <button
                              mat-button
                              type="button"
                              (click)="resetPrompt(prompt.key)"
                              [disabled]="resettingPromptKey() === prompt.key || !prompt.is_customized"
                            >
                              @if (resettingPromptKey() === prompt.key) {
                                <mat-spinner diameter="16"></mat-spinner>
                              } @else {
                                Reset to Default
                              }
                            </button>
                            <button
                              mat-flat-button
                              color="primary"
                              type="button"
                              class="save-btn"
                              (click)="savePrompt(prompt.key)"
                              [disabled]="savingPromptKey() === prompt.key || !isPromptDirty(prompt.key)"
                            >
                              @if (savingPromptKey() === prompt.key) {
                                <mat-spinner diameter="18"></mat-spinner>
                              } @else {
                                Save Prompt
                              }
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- LLM Usage & Cost Card -->
          <div class="card settings-card llm-stats-card">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 0.75rem; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <mat-icon style="color: #60a5fa;">bar_chart</mat-icon>
                <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: #f1f5f9;">AI Usage & Costs</h3>
              </div>
              <button mat-icon-button (click)="loadLLMStats()" [disabled]="loadingStats()" style="width: 32px; height: 32px; line-height: 32px;">
                <mat-icon style="font-size: 18px; width: 18px; height: 18px; color: #94a3b8;">refresh</mat-icon>
              </button>
            </div>
            <div class="card-body" style="padding: 0;">
              @if (loadingStats()) {
                <div class="ai-loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 0; gap: 0.5rem;">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span style="font-size: 0.8rem; color: #94a3b8;">Loading cost metrics...</span>
                </div>
              }
              @else if (llmStats()) {
                <div class="stats-overview" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1.25rem;">
                  <div class="stat-box" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 0.75rem; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Total Investment</div>
                    <div style="font-size: 1.3rem; font-weight: 700; color: #10a37f; margin-top: 0.25rem;">\${{ llmStats()!.total_cost | number:'1.2-6' }}</div>
                    <div style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.15rem;">{{ llmStats()!.total_calls }} API calls</div>
                  </div>
                  <div class="stat-box" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 0.75rem; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Total Tokens</div>
                    <div style="font-size: 1.3rem; font-weight: 700; color: #60a5fa; margin-top: 0.25rem;">{{ llmStats()!.total_tokens | number }}</div>
                    <div style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.15rem;">In: {{ llmStats()!.total_input_tokens | number }} | Out: {{ llmStats()!.total_output_tokens | number }}</div>
                  </div>
                </div>

                @if (llmStats()!.usage_by_model.length > 0) {
                  <div class="stats-section" style="margin-bottom: 1.25rem;">
                    <h4 style="font-size: 0.7rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.06em;">Usage By Model</h4>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                      @for (item of llmStats()!.usage_by_model; track item.model_name) {
                        <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px; padding: 0.5rem 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                          <div>
                            <span style="font-size: 0.8rem; font-weight: 600; color: #f1f5f9;">{{ item.model_name }}</span>
                            <div style="font-size: 0.65rem; color: #64748b;">{{ item.calls }} calls • {{ item.total_tokens | number }} tokens</div>
                          </div>
                          <div style="text-align: right;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: #10a37f;">\${{ item.cost | number:'1.2-6' }}</span>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }

                @if (llmStats()!.usage_by_purpose.length > 0) {
                  <div class="stats-section">
                    <h4 style="font-size: 0.7rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.06em;">Usage By Purpose</h4>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                      @for (item of llmStats()!.usage_by_purpose; track item.purpose) {
                        <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px; padding: 0.5rem 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                          <div>
                            <span style="font-size: 0.8rem; font-weight: 600; color: #f1f5f9; text-transform: capitalize;">{{ item.purpose.replace('_', ' ') }}</span>
                            <div style="font-size: 0.65rem; color: #64748b;">{{ item.calls }} calls • {{ item.total_tokens | number }} tokens</div>
                          </div>
                          <div style="text-align: right;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: #10a37f;">\${{ item.cost | number:'1.2-6' }}</span>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
              } @else {
                <div style="text-align: center; color: #64748b; padding: 1.5rem 0; font-size: 0.8rem;">
                  No token usage logs found yet.
                </div>
              }
            </div>
          </div>

          <!-- LinkedIn Configuration Card -->
          <div class="card settings-card linkedin-config-card">
            <div class="card-header">
              <mat-icon>share</mat-icon>
              <h3>LinkedIn Integration</h3>
            </div>
            <div class="card-body">
              @if (loadingLinkedInConfig()) {
                <div class="ai-loading">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span>Loading LinkedIn configuration...</span>
                </div>
              }

              @else if (linkedinConfig() && !linkedinEditMode()) {
                <div class="ai-saved-config">
                  <div class="ai-saved-header">
                    <div class="ai-provider-badge linkedin" style="background: rgba(10, 102, 194, 0.1); border: 1px solid rgba(10, 102, 194, 0.2); color: #0a66c2; display: flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">
                      <span class="provider-icon">🔗</span>
                      <span class="provider-label">LinkedIn Automation</span>
                    </div>
                    <span class="config-type-tag" style="background: rgba(16, 163, 127, 0.1); border: 1px solid rgba(16, 163, 127, 0.2); color: #10a37f; display: inline-flex; align-items: center; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">
                      Cookies Configured
                    </span>
                  </div>

                  <div class="ai-saved-details" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.06); border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding: 0.75rem 0; margin-bottom: 1rem;">
                    <div class="detail-row" style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                      <span class="detail-label" style="color: #64748b;">Profile URL</span>
                      <span class="detail-value model-value" style="color: #60a5fa; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ linkedinConfig()!.linkedin_url || 'Not configured' }}</span>
                    </div>
                    <div class="detail-row" style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                      <span class="detail-label" style="color: #64748b;">Session Cookies</span>
                      <span class="detail-value key-value" style="color: #e2e8f0; display: flex; align-items: center; gap: 0.25rem;">
                        <mat-icon class="key-icon" style="color: #10a37f; font-size: 16px; width: 16px; height: 16px;">check_circle</mat-icon>
                        Active / Encrypted
                      </span>
                    </div>
                  </div>

                  <div class="ai-saved-actions" style="display: flex; gap: 0.5rem;">
                    <button mat-flat-button class="reconfigure-btn" (click)="startLinkedInEdit()">
                      <mat-icon>edit</mat-icon>
                      Reconfigure
                    </button>
                    <button mat-button class="remove-btn" (click)="deleteLinkedInConfig()" [disabled]="deletingLinkedInConfig()">
                      @if (deletingLinkedInConfig()) {
                        <mat-spinner diameter="16"></mat-spinner>
                      } @else {
                        <ng-container>
                          <mat-icon>delete_outline</mat-icon>
                          Remove
                        </ng-container>
                      }
                    </button>
                  </div>
                </div>
              }

              @else if (!loadingLinkedInConfig()) {
                <form [formGroup]="linkedinConfigForm" (ngSubmit)="saveLinkedInConfig()" class="ai-form">
                  <p class="form-instructions" style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 1rem; line-height: 1.4;">
                    Provide your LinkedIn profile URL and session cookies to allow the Sales Copilot to research prospects and draft outreach messages.
                  </p>
                  
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>LinkedIn Profile URL</mat-label>
                      <input
                        matInput
                        formControlName="linkedin_url"
                        placeholder="https://www.linkedin.com/in/yourprofile"
                      >
                      <mat-hint>Your personal LinkedIn profile link</mat-hint>
                    </mat-form-field>
                  </div>

                  <div class="form-row" style="margin-top: 1rem;">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Session Cookies (JSON Array)</mat-label>
                      <textarea
                        matInput
                        formControlName="cookies_json"
                        placeholder='[{"name": "li_at", "value": "..."}, {"name": "JSESSIONID", "value": "..."}]'
                        rows="5"
                        required
                      ></textarea>
                      <mat-hint>
                        Export cookies in JSON format (e.g. using 'EditThisCookie' browser extension).
                      </mat-hint>
                    </mat-form-field>
                  </div>

                  <div class="ai-form-actions" style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
                    @if (linkedinEditMode()) {
                      <button mat-button type="button" (click)="cancelLinkedInEdit()">Cancel</button>
                    }
                    <button
                      mat-flat-button
                      color="primary"
                      class="save-btn"
                      type="submit"
                      [disabled]="linkedinConfigForm.invalid || savingLinkedInConfig()"
                    >
                      @if (savingLinkedInConfig()) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        <ng-container>
                          <mat-icon>save</mat-icon>
                          Save Cookies
                        </ng-container>
                      }
                    </button>
                  </div>
                </form>
              }
            </div>
          </div>
        </div>

        <!-- Sidebar / Team Members -->
        <div class="settings-sidebar">
          <!-- Temp Password Alert Box -->
          <div class="temp-password-card" *ngIf="invitedPassword()">
            <div class="alert-top">
              <mat-icon class="alert-icon">info</mat-icon>
              <span>Temporary Password Generated</span>
            </div>
            <p class="alert-p">Provide this temporary password to let the user log in/reset:</p>
            <div class="pwd-box">
              <code>{{ invitedPassword() }}</code>
            </div>
            <button mat-flat-button color="primary" class="dismiss-btn" (click)="invitedPassword.set(null)">
              Dismiss
            </button>
          </div>

          <div class="card settings-card">
            <div class="card-header header-with-action">
              <div class="header-title-box">
                <mat-icon>groups</mat-icon>
                <h3>Radar 36 Team ({{ team().length }})</h3>
              </div>
              <button mat-flat-button color="primary" class="header-action-btn" *ngIf="isAdmin()" (click)="showInviteForm.set(!showInviteForm()); editingMemberUser.set(null)">
                Invite
              </button>
            </div>
            <div class="card-body scrollable-team">
              <!-- Collapsible Invite Form -->
              <div class="invite-form-panel" *ngIf="showInviteForm()">
                <h4>Invite New Member</h4>
                <form [formGroup]="inviteForm" (ngSubmit)="onInviteSubmit()">
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Email Address</mat-label>
                      <input matInput type="email" formControlName="email" required>
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>First Name</mat-label>
                      <input matInput formControlName="first_name">
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Last Name</mat-label>
                      <input matInput formControlName="last_name">
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Role</mat-label>
                      <mat-select formControlName="role" required>
                        <mat-option value="sales_rep">Sales Rep</mat-option>
                        <mat-option value="manager">Manager</mat-option>
                        <mat-option value="admin">Admin</mat-option>
                      </mat-select>
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Job Title</mat-label>
                      <input matInput formControlName="job_title">
                    </mat-form-field>
                  </div>
                  <div class="invite-actions">
                    <button mat-button type="button" (click)="showInviteForm.set(false)">Cancel</button>
                    <button mat-flat-button color="primary" type="submit" [disabled]="inviteForm.invalid || sendingInvite()">
                      @if (sendingInvite()) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        Send
                      }
                    </button>
                  </div>
                </form>
              </div>

              <!-- Collapsible Edit Form Panel -->
              <div class="invite-form-panel" *ngIf="editingMemberUser()">
                <h4>Edit Team Member</h4>
                <form [formGroup]="editMemberForm" (ngSubmit)="onEditMemberSubmit()">
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Email Address</mat-label>
                      <input matInput type="email" formControlName="email" required>
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>First Name</mat-label>
                      <input matInput formControlName="first_name">
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Last Name</mat-label>
                      <input matInput formControlName="last_name">
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Role</mat-label>
                      <mat-select formControlName="role" required>
                        <mat-option value="sales_rep">Sales Rep</mat-option>
                        <mat-option value="manager">Manager</mat-option>
                        <mat-option value="admin">Admin</mat-option>
                      </mat-select>
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Job Title</mat-label>
                      <input matInput formControlName="job_title">
                    </mat-form-field>
                  </div>
                  <div class="invite-actions">
                    <button mat-button type="button" (click)="cancelEditingMember()">Cancel</button>
                    <button mat-flat-button color="primary" type="submit" [disabled]="editMemberForm.invalid || updatingMember()">
                      @if (updatingMember()) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        Save
                      }
                    </button>
                  </div>
                </form>
              </div>

              <div class="team-list">
                @for (member of team(); track member.id) {
                  <div class="member-row" [ngClass]="{ 'inactive-member': !member.is_active }">
                    <div class="member-avatar">
                      <mat-icon>person</mat-icon>
                    </div>
                    <div class="member-info">
                      <div class="member-name-row" style="display: flex; align-items: center;">
                        <span class="member-name">{{ member.full_name }}</span>
                        <span class="status-badge" [ngClass]="member.status || 'active'">
                          {{ member.status || 'active' }}
                        </span>
                        <button *ngIf="member.status === 'pending' && isAdmin()"
                                mat-icon-button
                                color="primary"
                                class="row-resend-btn"
                                (click)="resendInvite(member)"
                                matTooltip="Resend Invitation Email"
                                style="width: 24px; height: 24px; line-height: 24px; margin-left: 0.5rem; display: inline-flex; align-items: center; justify-content: center;">
                          <mat-icon style="font-size: 16px; width: 16px; height: 16px; color: #3b82f6;">mail_outline</mat-icon>
                        </button>
                      </div>
                      <div class="member-title">
                        {{ member.job_title || 'Sales Representative' }} · <strong>{{ member.role | titlecase }}</strong>
                      </div>
                    </div>
                    <div class="member-actions" *ngIf="isAdmin() && member.id !== currentUserId()">
                      <button mat-icon-button [matMenuTriggerFor]="menu">
                        <mat-icon>more_vert</mat-icon>
                      </button>
                      <mat-menu #menu="matMenu">
                        <button mat-menu-item (click)="editMember(member)">
                          <mat-icon>edit</mat-icon>
                          <span>Edit Profile</span>
                        </button>
                        <button mat-menu-item *ngIf="member.status === 'pending'" (click)="resendInvite(member)">
                          <mat-icon>mail</mat-icon>
                          <span>Resend Invite</span>
                        </button>
                        <button mat-menu-item (click)="setTempPassword(member)">
                          <mat-icon>vpn_key</mat-icon>
                          <span>Set Temp Password</span>
                        </button>
                        <button mat-menu-item (click)="toggleMemberActive(member)">
                          <mat-icon>{{ member.is_active ? 'block' : 'check_circle' }}</mat-icon>
                          <span>{{ member.is_active ? 'Deactivate' : 'Activate' }}</span>
                        </button>
                      </mat-menu>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-container {
      font-family: 'Inter', sans-serif;
      color: #cbd5e1;
    }

    .list-header {
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 0.25rem 0;
      color: #f8fafc;
      letter-spacing: -0.025em;
    }

    .subtitle {
      color: #64748b;
      margin: 0;
      font-size: 0.9rem;
    }

    /* Layout structure */
    .settings-layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 1.5rem;
      align-items: start;
    }

    .settings-forms {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .settings-sidebar {
      position: sticky;
      top: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .card {
      background-color: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: center;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      background-color: #0b1329;
      color: #f8fafc;
    }

    .header-with-action {
      justify-content: space-between;
    }

    .header-title-box {
      display: flex;
      align-items: center;
    }

    .card-header mat-icon {
      color: #3b82f6;
      margin-right: 0.5rem;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .card-header h3 {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }

    .header-action-btn {
      height: 28px !important;
      padding: 0 0.75rem !important;
      font-size: 0.75rem !important;
      font-weight: 600 !important;
      border-radius: 4px !important;
      background-color: #3b82f6 !important;
      color: white !important;
    }

    .card-body {
      padding: 1.5rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }

    .form-row {
      margin-bottom: 0.5rem;
    }

    .full-width {
      width: 100%;
    }

    ::ng-deep .card-body .mat-mdc-text-field-wrapper {
      background-color: rgba(255, 255, 255, 0.02) !important;
    }

    .save-btn {
      margin-top: 1rem;
      background-color: #3b82f6 !important;
      color: white !important;
      border-radius: 6px;
    }

    /* Temp Password Alert */
    .temp-password-card {
      background-color: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 8px;
      padding: 1.25rem;
    }

    .alert-top {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #34d399;
      font-weight: 700;
      font-size: 0.85rem;
    }

    .alert-icon {
      color: #34d399;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .alert-p {
      font-size: 0.8rem;
      color: #94a3b8;
      margin: 0.5rem 0;
    }

    .pwd-box {
      background-color: #0b1329;
      border: 1px dashed rgba(52, 211, 153, 0.3);
      padding: 0.5rem;
      border-radius: 4px;
      text-align: center;
      margin-bottom: 0.75rem;
    }

    .pwd-box code {
      font-size: 1rem;
      font-family: monospace;
      color: #34d399;
      font-weight: 700;
    }

    .dismiss-btn {
      width: 100%;
      height: 32px !important;
      background-color: #047857 !important;
      color: white !important;
      border-radius: 4px !important;
      font-size: 0.8rem !important;
      font-weight: 600 !important;
    }

    /* Collapsible Invite Form */
    .invite-form-panel {
      border: 1px solid rgba(255, 255, 255, 0.05);
      background-color: rgba(255, 255, 255, 0.01);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }

    .invite-form-panel h4 {
      margin: 0 0 1rem 0;
      font-size: 0.85rem;
      font-weight: 700;
      color: #f8fafc;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .invite-form-panel select {
      background-color: transparent;
      border: none;
      outline: none;
      color: #cbd5e1;
      width: 100%;
      font-family: inherit;
    }

    .invite-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .invite-actions button {
      height: 32px !important;
      border-radius: 4px;
      font-size: 0.8rem;
    }

    /* Team Members List */
    .scrollable-team {
      max-height: 480px;
      overflow-y: auto;
    }

    .team-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .member-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.75rem;
      background-color: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      transition: all 0.2s;
    }

    .member-row.inactive-member {
      opacity: 0.5;
    }

    .member-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.05);
      color: #94a3b8;
    }

    .member-info {
      flex: 1;
      overflow: hidden;
    }

    .member-name-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .member-name {
      font-weight: 600;
      color: #f8fafc;
      font-size: 0.85rem;
    }

    .status-badge {
      font-size: 0.55rem;
      font-weight: 800;
      padding: 0.05rem 0.3rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .status-badge.active { background-color: rgba(16, 185, 129, 0.15); color: #34d399; }
    .status-badge.pending { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .status-badge.inactive { background-color: rgba(239, 68, 68, 0.15); color: #f87171; }

    .member-title {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .member-actions button {
      color: #64748b;
    }

    /* High contrast invite form overrides */
    .invite-form-panel mat-form-field {
      width: 100%;
    }

    .invite-form-panel input {
      background: transparent !important;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      color: #f8fafc !important;
      padding: 0 !important;
      margin: 0 !important;
      height: auto !important;
      width: 100% !important;
    }

    ::ng-deep .invite-form-panel .mat-mdc-form-field-label {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    ::ng-deep .invite-form-panel .mdc-notched-outline__leading,
    ::ng-deep .invite-form-panel .mdc-notched-outline__notch,
    ::ng-deep .invite-form-panel .mdc-notched-outline__trailing {
      border-color: rgba(255, 255, 255, 0.25) !important;
    }

    ::ng-deep .invite-form-panel .mat-mdc-form-field.mat-focused .mdc-notched-outline__leading,
    ::ng-deep .invite-form-panel .mat-mdc-form-field.mat-focused .mdc-notched-outline__notch,
    ::ng-deep .invite-form-panel .mat-mdc-form-field.mat-focused .mdc-notched-outline__trailing {
      border-color: #3b82f6 !important;
    }

    ::ng-deep .invite-form-panel .mat-mdc-select-value {
      color: #f8fafc !important;
    }

    ::ng-deep .invite-form-panel .mat-mdc-select-arrow {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    /* Light theme local overrides */
    :host-context(body.light-theme) .invite-form-panel input {
      color: #0f172a !important;
    }
    :host-context(body.light-theme) ::ng-deep .invite-form-panel .mat-mdc-form-field-label {
      color: rgba(0, 0, 0, 0.6) !important;
    }
    :host-context(body.light-theme) ::ng-deep .invite-form-panel .mdc-notched-outline__leading,
    :host-context(body.light-theme) ::ng-deep .invite-form-panel .mdc-notched-outline__notch,
    :host-context(body.light-theme) ::ng-deep .invite-form-panel .mdc-notched-outline__trailing {
      border-color: rgba(0, 0, 0, 0.15) !important;
    }
    :host-context(body.light-theme) ::ng-deep .invite-form-panel .mat-mdc-select-value {
      color: #0f172a !important;
    }
    :host-context(body.light-theme) ::ng-deep .invite-form-panel .mat-mdc-select-arrow {
      color: rgba(0, 0, 0, 0.6) !important;
    }

    /* ============================================
       AI Configuration Card Styles
       ============================================ */

    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .ai-config-card .card-header mat-icon {
      color: #a78bfa;
    }

    .ai-loading {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: #64748b;
      font-size: 0.85rem;
      padding: 1rem 0;
    }

    /* Saved Config Summary */
    .ai-saved-config {
      animation: fadeSlideIn 0.3s ease;
    }

    .ai-saved-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }

    .ai-provider-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.85rem;
      border-radius: 20px;
      font-weight: 700;
      font-size: 0.8rem;
    }

    .ai-provider-badge.openai {
      background: rgba(16, 163, 127, 0.12);
      color: #10a37f;
      border: 1px solid rgba(16, 163, 127, 0.25);
    }

    .ai-provider-badge.claude {
      background: rgba(217, 119, 87, 0.12);
      color: #d97757;
      border: 1px solid rgba(217, 119, 87, 0.25);
    }

    .provider-icon {
      font-size: 1rem;
    }

    .config-type-tag {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .config-type-tag.cloud_api {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
    }

    .config-type-tag.custom_endpoint {
      background: rgba(168, 85, 247, 0.1);
      color: #c084fc;
    }

    .ai-saved-details {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }

    .detail-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.4rem 0;
    }

    .detail-row + .detail-row {
      border-top: 1px solid rgba(255, 255, 255, 0.03);
    }

    .detail-label {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .detail-value {
      font-size: 0.85rem;
      color: #e2e8f0;
      font-weight: 500;
    }

    .model-value {
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #a78bfa;
    }

    .key-value {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #94a3b8;
      font-size: 0.8rem;
    }

    .key-icon {
      font-size: 14px !important;
      width: 14px !important;
      height: 14px !important;
      color: #475569;
    }

    .endpoint-value {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.75rem;
      color: #94a3b8;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ai-saved-actions {
      display: flex;
      gap: 0.5rem;
    }

    .reconfigure-btn {
      flex: 1;
      background-color: rgba(167, 139, 250, 0.1) !important;
      color: #a78bfa !important;
      border: 1px solid rgba(167, 139, 250, 0.2) !important;
      border-radius: 6px !important;
      font-size: 0.8rem !important;
      font-weight: 600 !important;
      height: 36px !important;
      transition: all 0.2s !important;
    }

    .reconfigure-btn:hover {
      background-color: rgba(167, 139, 250, 0.18) !important;
    }

    .reconfigure-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 0.3rem;
    }

    .remove-btn {
      color: #ef4444 !important;
      font-size: 0.8rem !important;
      font-weight: 500 !important;
      height: 36px !important;
    }

    .remove-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 0.2rem;
    }

    /* Step Flow */
    .ai-step {
      margin-bottom: 1.25rem;
    }

    .ai-step:last-child {
      margin-bottom: 0;
    }

    .step-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .step-number {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      font-size: 0.7rem;
      font-weight: 800;
    }

    /* Provider Cards */
    .provider-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .provider-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem 1rem;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
      transition: all 0.25s ease;
      user-select: none;
    }

    .provider-card:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateY(-1px);
    }

    .provider-card.selected {
      background: rgba(59, 130, 246, 0.06);
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.08);
    }

    .provider-card-icon {
      font-size: 1.75rem;
    }

    .provider-card-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: #e2e8f0;
    }

    .check-icon {
      position: absolute;
      top: 6px;
      right: 6px;
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      color: #3b82f6 !important;
    }

    /* Config Type Cards */
    .config-type-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .config-type-card {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
      transition: all 0.25s ease;
      user-select: none;
    }

    .config-type-card:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.12);
    }

    .config-type-card.selected {
      background: rgba(59, 130, 246, 0.06);
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.08);
    }

    .config-type-card mat-icon {
      color: #64748b;
      margin-top: 2px;
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .config-type-card.selected mat-icon {
      color: #3b82f6;
    }

    .config-type-card strong {
      display: block;
      font-size: 0.82rem;
      color: #e2e8f0;
      margin-bottom: 0.15rem;
    }

    .config-type-card p {
      font-size: 0.7rem;
      color: #64748b;
      margin: 0;
      line-height: 1.3;
    }

    /* AI Form */
    .ai-form {
      margin-top: 0.25rem;
    }

    .ai-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .ai-form-actions .save-btn {
      margin-top: 0;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .ai-form-actions .save-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: white;
      margin-right: 0;
    }

    /* AI Prompts */
    .ai-prompts-card .card-header h3 {
      margin: 0;
    }

    .reset-all-btn {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .prompts-intro {
      font-size: 0.8rem;
      color: #94a3b8;
      line-height: 1.5;
      margin: 0 0 1rem;
    }

    .prompt-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .prompt-item {
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.02);
      overflow: hidden;
    }

    .prompt-item.expanded {
      border-color: rgba(96, 165, 250, 0.25);
    }

    .prompt-item-header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: transparent;
      border: none;
      color: #e2e8f0;
      cursor: pointer;
      text-align: left;
    }

    .prompt-item-header:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .prompt-item-title {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .expand-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #64748b;
    }

    .prompt-label {
      font-size: 0.85rem;
      font-weight: 600;
    }

    .custom-badge {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      background: rgba(16, 163, 127, 0.15);
      color: #10a37f;
      border: 1px solid rgba(16, 163, 127, 0.25);
    }

    .prompt-category {
      font-size: 0.7rem;
      color: #64748b;
      text-transform: capitalize;
    }

    .prompt-item-body {
      padding: 0 1rem 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }

    .prompt-description {
      font-size: 0.75rem;
      color: #94a3b8;
      margin: 0.75rem 0;
      line-height: 1.4;
    }

    .template-vars {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
      font-size: 0.7rem;
    }

    .vars-label {
      color: #64748b;
      font-weight: 600;
    }

    .template-vars code {
      background: rgba(96, 165, 250, 0.1);
      color: #60a5fa;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      font-size: 0.68rem;
    }

    .prompt-editor textarea {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.75rem;
      line-height: 1.5;
    }

    .prompt-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .prompt-actions .save-btn {
      margin-top: 0;
    }

    /* Cropper & Branding styles */
    .cropper-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem 0;
    }
    .cropper-hint {
      color: #94a3b8;
      font-size: 0.8rem;
      margin-bottom: 1rem;
      text-align: center;
    }
    .crop-viewport {
      width: 200px;
      height: 200px;
      position: relative;
      overflow: hidden;
      border-radius: 8px;
      border: 2px dashed rgba(255, 255, 255, 0.15);
      background: #090f1f;
      cursor: grab;
    }
    .crop-viewport:active {
      cursor: grabbing;
    }
    .crop-image {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: center;
      user-select: none;
      -webkit-user-drag: none;
    }
    .crop-ring {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border: 2px solid #3b82f6;
      border-radius: 6px;
      pointer-events: none;
      box-shadow: inset 0 0 0 100px rgba(0, 0, 0, 0.45);
    }
    .crop-slider-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 80%;
      margin: 1.25rem 0;
      color: #94a3b8;
    }
    .crop-slider-container input[type="range"] {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.1);
      outline: none;
      -webkit-appearance: none;
    }
    .crop-slider-container input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #3b82f6;
      cursor: pointer;
    }
    .crop-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
      width: 100%;
    }
    .branding-logo-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      padding: 0.5rem 0;
    }
    .logo-preview-wrapper {
      position: relative;
      width: 120px;
      height: 120px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
      overflow: hidden;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .logo-preview-wrapper:hover {
      border-color: rgba(59, 130, 246, 0.4);
      background: rgba(59, 130, 246, 0.02);
    }
    .logo-preview {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .logo-preview-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      color: #3b82f6;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .logo-preview-wrapper:hover .logo-preview-overlay {
      opacity: 1;
    }
    .logo-preview-overlay mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .logo-preview-overlay span {
      font-size: 0.7rem;
      font-weight: 600;
    }
    .logo-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      color: #64748b;
    }
    .logo-placeholder mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #475569;
    }
    .logo-placeholder span {
      font-size: 0.75rem;
      font-weight: 500;
    }
    .remove-logo-btn {
      font-size: 0.75rem !important;
      height: 32px !important;
      line-height: 32px !important;
    }
  `]
})
export class SettingsComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly brandingService = inject(BrandingService);

  readonly savingBranding = signal(false);
  readonly showCropper = signal(false);
  readonly cropImageSrc = signal<string | null>(null);
  readonly logoZoom = signal<number>(1.0);
  readonly logoTranslateX = signal<number>(0);
  readonly logoTranslateY = signal<number>(0);

  // Crop math parameters
  private baseWidth = 0;
  private baseHeight = 0;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private selectedLogoFile: File | null = null;
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);

  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);
  readonly team = signal<TeamMember[]>([]);

  // Team Invite signals
  readonly showInviteForm = signal(false);
  readonly sendingInvite = signal(false);
  readonly invitedPassword = signal<string | null>(null);
  readonly editingMemberUser = signal<TeamMember | null>(null);
  
  // SMTP Signals
  readonly savingSmtp = signal(false);
  readonly hideSmtpPassword = signal(true);
  readonly smtpHasPassword = signal(false);
  readonly smtpConfig = signal<any>(null);
  readonly smtpEditMode = signal(false);
  readonly updatingMember = signal(false);

  // AI Config signals
  readonly loadingAIConfig = signal(false);
  readonly savingAIConfig = signal(false);
  readonly deletingAIConfig = signal(false);
  readonly aiConfig = signal<AIConfig | null>(null);
  readonly aiEditMode = signal(false);

  // LinkedIn Config signals
  readonly loadingLinkedInConfig = signal(false);
  readonly savingLinkedInConfig = signal(false);
  readonly deletingLinkedInConfig = signal(false);
  readonly linkedinConfig = signal<LinkedInConfig | null>(null);
  readonly linkedinEditMode = signal(false);
  readonly selectedProvider = signal<string>('');
  readonly selectedConfigType = signal<string>('');
  readonly showAPIKey = signal(false);

  // LLM Stats signals
  readonly loadingStats = signal(false);
  readonly llmStats = signal<LLMStats | null>(null);

  // AI Prompts signals
  readonly loadingPrompts = signal(false);
  readonly aiPrompts = signal<AIPrompt[]>([]);
  readonly expandedPromptKey = signal<string | null>(null);
  readonly promptDrafts = signal<Record<string, string>>({});
  readonly savingPromptKey = signal<string | null>(null);
  readonly resettingPromptKey = signal<string | null>(null);
  readonly resettingAllPrompts = signal(false);

  // Computeds
  readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'admin' || this.authService.currentUser()?.is_superuser === true);
  readonly currentUserId = computed(() => this.authService.currentUser()?.id || '');

  // Provider definitions
  readonly providers: AIProviderOption[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      icon: '🟢',
      color: '#10a37f',
      defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
      placeholder: 'sk-proj-...'
    },
    {
      id: 'claude',
      name: 'Claude',
      icon: '🟠',
      color: '#d97757',
      defaultModels: ['claude-opus-4-7', 'claude-sonnet-4-5-20250514'],
      placeholder: 'sk-ant-...'
    }
  ];

  readonly profileForm: FormGroup = this.fb.group({
    first_name: ['', [Validators.required]],
    last_name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    timezone: ['UTC', [Validators.required]],
    job_title: ['']
  });

  readonly brandingForm: FormGroup = this.fb.group({
    organization_name: ['', [Validators.required]]
  });

  readonly smtpForm: FormGroup = this.fb.group({
    smtp_host: [''],
    smtp_port: [587, [Validators.required]],
    smtp_username: [''],
    smtp_password: [''],
    smtp_use_tls: [true],
    smtp_use_ssl: [false],
    smtp_from_email: ['', [Validators.email]]
  });

  readonly passwordForm: FormGroup = this.fb.group({
    old_password: ['', [Validators.required]],
    new_password: ['', [Validators.required, Validators.minLength(8)]],
    confirm_password: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  readonly inviteForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    first_name: [''],
    last_name: [''],
    role: ['sales_rep', [Validators.required]],
    job_title: ['']
  });

  readonly editMemberForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    first_name: [''],
    last_name: [''],
    role: ['sales_rep', [Validators.required]],
    job_title: ['']
  });

  readonly aiConfigForm: FormGroup = this.fb.group({
    api_key: ['', [Validators.required]],
    model_name: ['', [Validators.required]],
    base_url: ['']
  });

  readonly linkedinConfigForm: FormGroup = this.fb.group({
    linkedin_url: [''],
    cookies_json: [
      `[\n  {\n    "name": "li_at",\n    "value": "PASTE_YOUR_LI_AT_HERE"\n  },\n  {\n    "name": "JSESSIONID",\n    "value": "ajax:PASTE_YOUR_JSESSIONID_HERE"\n  }\n]`,
      [Validators.required]
    ]
  });

  passwordMatchValidator(g: FormGroup) {
    return g.get('new_password')?.value === g.get('confirm_password')?.value
      ? null
      : { mismatch: true };
  }

  constructor() {
    effect(() => {
      const name = this.brandingService.organizationName();
      if (this.brandingForm && !this.brandingForm.dirty) {
        this.brandingForm.patchValue({ organization_name: name });
      }
    });

    // Reactively load SMTP settings once the user is resolved as Admin
    effect(() => {
      if (this.isAdmin()) {
        this.loadSMTPSettings();
      }
    });
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.profileForm.patchValue({
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone || '',
        timezone: user.timezone,
        job_title: user.job_title || ''
      });
    }

    this.loadTeam();
    this.loadAIConfig();
    this.loadPrompts();
    this.loadLinkedInConfig();
    this.loadLLMStats();
  }

  // ─── Profile ────────────────────────────────
  loadTeam(): void {
    this.apiService.get<TeamMember[]>('/auth/team/').subscribe((res) => {
      this.team.set(res);
    });
  }

  onProfileSubmit(): void {
    if (this.profileForm.invalid) return;

    this.savingProfile.set(true);
    this.authService.updateProfile(this.profileForm.value).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.notification.success('Profile updated successfully');
      },
      error: () => {
        this.savingProfile.set(false);
        this.notification.error('Failed to update profile');
      }
    });
  }

  onPasswordSubmit(): void {
    if (this.passwordForm.invalid) return;

    this.savingPassword.set(true);
    const val = this.passwordForm.value;
    
    this.apiService.post('/auth/change-password/', {
      old_password: val.old_password,
      new_password: val.new_password,
      new_password_confirm: val.confirm_password
    }).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordForm.reset();
        this.notification.success('Password updated successfully');
      },
      error: (err) => {
        this.savingPassword.set(false);
        const msg = err.error?.error?.message || 'Failed to update password. Check old password.';
        this.notification.error(msg);
      }
    });
  }

  // ─── Branding Settings ───────────────────────
  onLogoSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.notification.error('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.notification.error('Logo file must be 5 MB or smaller.');
      return;
    }
    this.selectedLogoFile = file;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.cropImageSrc.set(e.target.result);
      this.showCropper.set(true);
    };
    reader.readAsDataURL(file);
  }

  onLogoImageLoaded(img: HTMLImageElement): void {
    const viewportSize = 200;
    const scale = Math.max(viewportSize / img.naturalWidth, viewportSize / img.naturalHeight);
    this.baseWidth = img.naturalWidth * scale;
    this.baseHeight = img.naturalHeight * scale;
    this.logoTranslateX.set((viewportSize - this.baseWidth) / 2);
    this.logoTranslateY.set((viewportSize - this.baseHeight) / 2);
    this.logoZoom.set(1.0);
  }

  startLogoDrag(e: MouseEvent): void {
    e.preventDefault();
    this.isDragging = true;
    this.startX = e.clientX - this.logoTranslateX();
    this.startY = e.clientY - this.logoTranslateY();
  }

  onLogoDrag(e: MouseEvent): void {
    if (!this.isDragging) return;
    this.logoTranslateX.set(e.clientX - this.startX);
    this.logoTranslateY.set(e.clientY - this.startY);
  }

  endLogoDrag(): void {
    this.isDragging = false;
  }

  onLogoZoomChange(e: any): void {
    this.logoZoom.set(parseFloat(e.target.value));
  }

  cancelCropping(): void {
    this.showCropper.set(false);
    this.cropImageSrc.set(null);
    this.selectedLogoFile = null;
  }

  applyDirectly(): void {
    if (!this.selectedLogoFile) return;

    this.savingBranding.set(true);
    const name = this.brandingForm.value.organization_name;

    this.brandingService.updateBranding(name, this.selectedLogoFile, false).subscribe({
      next: () => {
        this.savingBranding.set(false);
        this.showCropper.set(false);
        this.notification.success('Branding updated successfully');
      },
      error: (err) => {
        this.savingBranding.set(false);
        this.notification.error(err.error?.error?.message || 'Failed to update branding');
      }
    });
  }

  performCropAndSave(): void {
    if (!this.cropImageSrc() || !this.selectedLogoFile) return;

    this.savingBranding.set(true);

    const img = new Image();
    img.src = this.cropImageSrc()!;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.savingBranding.set(false);
        this.notification.error('Failed to crop logo');
        return;
      }

      const scaleRatio = 256 / 200;
      const dx = this.logoTranslateX() * scaleRatio;
      const dy = this.logoTranslateY() * scaleRatio;
      const dw = this.baseWidth * this.logoZoom() * scaleRatio;
      const dh = this.baseHeight * this.logoZoom() * scaleRatio;

      ctx.drawImage(img, dx, dy, dw, dh);

      canvas.toBlob((blob) => {
        if (!blob) {
          this.savingBranding.set(false);
          this.notification.error('Failed to crop logo');
          return;
        }

        const croppedFile = new File([blob], 'logo.png', { type: 'image/png' });
        const name = this.brandingForm.value.organization_name;

        this.brandingService.updateBranding(name, croppedFile, false).subscribe({
          next: () => {
            this.savingBranding.set(false);
            this.showCropper.set(false);
            this.notification.success('Branding updated successfully');
          },
          error: (err) => {
            this.savingBranding.set(false);
            this.notification.error(err.error?.error?.message || 'Failed to update branding');
          }
        });
      }, 'image/png');
    };
  }

  removeLogo(): void {
    this.savingBranding.set(true);
    const name = this.brandingForm.value.organization_name;
    this.brandingService.updateBranding(name, null, true).subscribe({
      next: () => {
        this.savingBranding.set(false);
        this.notification.success('Logo removed successfully');
      },
      error: () => {
        this.savingBranding.set(false);
        this.notification.error('Failed to remove logo');
      }
    });
  }

  onBrandingSubmit(): void {
    if (this.brandingForm.invalid) return;
    this.savingBranding.set(true);
    const name = this.brandingForm.value.organization_name;
    this.brandingService.updateBranding(name, null, false).subscribe({
      next: () => {
        this.savingBranding.set(false);
        this.notification.success('Branding name updated successfully');
      },
      error: (err) => {
        this.savingBranding.set(false);
        this.notification.error(err.error?.error?.message || 'Failed to update branding');
      }
    });
  }

  // ─── Team Invite ────────────────────────────
  onInviteSubmit(): void {
    if (this.inviteForm.invalid) return;

    this.sendingInvite.set(true);
    this.apiService.post<{ user: TeamMember, temp_password: string }>('/auth/team/invite/', this.inviteForm.value).subscribe({
      next: (res) => {
        this.sendingInvite.set(false);
        this.showInviteForm.set(false);
        this.inviteForm.reset({ role: 'sales_rep' });
        this.invitedPassword.set(res.temp_password);
        this.notification.success('Team member invited successfully.');
        this.loadTeam();
      },
      error: (err) => {
        this.sendingInvite.set(false);
        const msg = err.error?.error || 'Failed to invite team member';
        this.notification.error(msg);
      }
    });
  }

  toggleMemberActive(member: TeamMember): void {
    if (member.id === this.currentUserId()) return;

    this.apiService.post<{ user: TeamMember }>(`/auth/team/${member.id}/toggle-active/`, {}).subscribe({
      next: () => {
        this.notification.success(`User status updated successfully.`);
        this.loadTeam();
      },
      error: () => {
        this.notification.error('Failed to update member status.');
      }
    });
  }

  editMember(member: TeamMember): void {
    this.showInviteForm.set(false);
    this.editingMemberUser.set(member);
    this.editMemberForm.patchValue({
      email: member.email,
      first_name: member.first_name,
      last_name: member.last_name,
      role: member.role,
      job_title: member.job_title
    });
  }

  cancelEditingMember(): void {
    this.editingMemberUser.set(null);
    this.editMemberForm.reset();
  }

  onEditMemberSubmit(): void {
    if (this.editMemberForm.invalid) return;
    const member = this.editingMemberUser();
    if (!member) return;

    this.updatingMember.set(true);
    this.apiService.put<{ message: string, user: TeamMember }>(`/auth/team/${member.id}/`, this.editMemberForm.value).subscribe({
      next: () => {
        this.updatingMember.set(false);
        this.editingMemberUser.set(null);
        this.notification.success('Team member updated successfully.');
        this.loadTeam();
      },
      error: (err) => {
        this.updatingMember.set(false);
        const msg = err.error?.error || 'Failed to update team member';
        this.notification.error(msg);
      }
    });
  }

  setTempPassword(member: TeamMember): void {
    if (member.id === this.currentUserId()) return;
    
    this.apiService.post<{ message: string, temp_password: string }>(`/auth/team/${member.id}/temp-password/`, {}).subscribe({
      next: (res) => {
        this.invitedPassword.set(res.temp_password);
        this.notification.success(`Temporary password generated for ${member.full_name}.`);
      },
      error: (err) => {
        const msg = err.error?.error || 'Failed to generate temporary password';
        this.notification.error(msg);
      }
    });
  }

  resendInvite(member: TeamMember): void {
    if (member.id === this.currentUserId()) return;
    
    this.apiService.post<{ message: string, temp_password: string }>(`/auth/team/${member.id}/resend-invite/`, {}).subscribe({
      next: (res) => {
        this.invitedPassword.set(res.temp_password);
        this.notification.success(`Invitation email resent to ${member.full_name || member.email}.`);
      },
      error: (err) => {
        const msg = err.error?.error || 'Failed to resend invitation';
        this.notification.error(msg);
      }
    });
  }

  // ─── AI Configuration ──────────────────────
  loadAIConfig(): void {
    this.loadingAIConfig.set(true);
    this.apiService.get<AIConfig>('/ai/config/').subscribe({
      next: (res) => {
        this.loadingAIConfig.set(false);
        if (res && res.configured !== false) {
          this.aiConfig.set(res);
        } else {
          this.aiConfig.set(null);
        }
      },
      error: () => {
        this.loadingAIConfig.set(false);
        this.aiConfig.set(null);
      }
    });
  }

  selectProvider(id: string): void {
    this.selectedProvider.set(id);
    // Reset config type and form when switching providers
    this.selectedConfigType.set('');
    this.aiConfigForm.reset();
    this.showAPIKey.set(false);
  }

  selectConfigType(type: string): void {
    this.selectedConfigType.set(type);
    // Update base_url validator
    if (type === 'custom_endpoint') {
      this.aiConfigForm.get('base_url')?.setValidators([Validators.required]);
    } else {
      this.aiConfigForm.get('base_url')?.clearValidators();
      this.aiConfigForm.get('base_url')?.setValue('');
    }
    this.aiConfigForm.get('base_url')?.updateValueAndValidity();
  }

  getSelectedProvider(): AIProviderOption | undefined {
    return this.providers.find(p => p.id === this.selectedProvider());
  }

  getProviderIcon(providerId: string): string {
    return this.providers.find(p => p.id === providerId)?.icon || '🤖';
  }

  getProviderName(providerId: string): string {
    return this.providers.find(p => p.id === providerId)?.name || providerId;
  }

  getModelPlaceholder(): string {
    const p = this.getSelectedProvider();
    return p ? p.defaultModels[0] : 'model-name';
  }

  startAIEdit(): void {
    this.aiEditMode.set(true);
    const config = this.aiConfig();
    if (config) {
      this.selectedProvider.set(config.provider);
      this.selectedConfigType.set(config.config_type);
      this.aiConfigForm.patchValue({
        model_name: config.model_name,
        base_url: config.base_url || '',
        api_key: '' // always empty — user must re-enter
      });
      if (config.config_type === 'custom_endpoint') {
        this.aiConfigForm.get('base_url')?.setValidators([Validators.required]);
      } else {
        this.aiConfigForm.get('base_url')?.clearValidators();
      }
      this.aiConfigForm.get('base_url')?.updateValueAndValidity();
    }
  }

  cancelAIEdit(): void {
    this.aiEditMode.set(false);
    this.selectedProvider.set('');
    this.selectedConfigType.set('');
    this.aiConfigForm.reset();
    this.showAPIKey.set(false);
  }

  saveAIConfig(): void {
    if (this.aiConfigForm.invalid || !this.selectedProvider() || !this.selectedConfigType()) return;

    this.savingAIConfig.set(true);
    const payload = {
      provider: this.selectedProvider(),
      config_type: this.selectedConfigType(),
      api_key: this.aiConfigForm.value.api_key,
      model_name: this.aiConfigForm.value.model_name,
      base_url: this.aiConfigForm.value.base_url || ''
    };

    this.apiService.put<AIConfig>('/ai/config/', payload).subscribe({
      next: (res) => {
        this.savingAIConfig.set(false);
        this.aiConfig.set(res);
        this.aiEditMode.set(false);
        this.selectedProvider.set('');
        this.selectedConfigType.set('');
        this.aiConfigForm.reset();
        this.showAPIKey.set(false);
        this.notification.success('AI configuration saved successfully');
      },
      error: (err) => {
        this.savingAIConfig.set(false);
        const msg = err.error?.error?.message || 'Failed to save AI configuration';
        this.notification.error(msg);
      }
    });
  }

  deleteAIConfig(): void {
    this.deletingAIConfig.set(true);
    this.apiService.delete('/ai/config/').subscribe({
      next: () => {
        this.deletingAIConfig.set(false);
        this.aiConfig.set(null);
        this.aiEditMode.set(false);
        this.selectedProvider.set('');
        this.selectedConfigType.set('');
        this.aiConfigForm.reset();
        this.notification.success('AI configuration removed. System defaults will be used.');
      },
      error: () => {
        this.deletingAIConfig.set(false);
        this.notification.error('Failed to remove AI configuration');
      }
    });
  }

  // ─── AI Prompts ─────────────────────────────
  loadPrompts(): void {
    this.loadingPrompts.set(true);
    this.apiService.get<AIPrompt[]>('/ai/prompts/').subscribe({
      next: (prompts) => {
        this.loadingPrompts.set(false);
        this.aiPrompts.set(prompts);
        const drafts: Record<string, string> = {};
        prompts.forEach((p) => { drafts[p.key] = p.content; });
        this.promptDrafts.set(drafts);
      },
      error: () => {
        this.loadingPrompts.set(false);
        this.notification.error('Failed to load AI prompts');
      }
    });
  }

  togglePrompt(key: string): void {
    this.expandedPromptKey.set(this.expandedPromptKey() === key ? null : key);
  }

  getPromptDraft(key: string): string {
    return this.promptDrafts()[key] ?? '';
  }

  updatePromptDraft(key: string, value: string): void {
    this.promptDrafts.update((drafts) => ({ ...drafts, [key]: value }));
  }

  isPromptDirty(key: string): boolean {
    const prompt = this.aiPrompts().find((p) => p.key === key);
    if (!prompt) return false;
    return this.getPromptDraft(key) !== prompt.content;
  }

  savePrompt(key: string): void {
    const content = this.getPromptDraft(key).trim();
    if (!content) {
      this.notification.error('Prompt content cannot be empty');
      return;
    }

    this.savingPromptKey.set(key);
    this.apiService.put<AIPrompt>(`/ai/prompts/${key}/`, { content }).subscribe({
      next: (updated) => {
        this.savingPromptKey.set(null);
        this.aiPrompts.update((list) =>
          list.map((p) => (p.key === key ? updated : p))
        );
        this.promptDrafts.update((drafts) => ({ ...drafts, [key]: updated.content }));
        this.notification.success('Prompt saved successfully');
      },
      error: (err) => {
        this.savingPromptKey.set(null);
        const msg = err.error?.error?.message || 'Failed to save prompt';
        this.notification.error(msg);
      }
    });
  }

  resetPrompt(key: string): void {
    this.resettingPromptKey.set(key);
    this.apiService.delete<AIPrompt>(`/ai/prompts/${key}/`).subscribe({
      next: (updated) => {
        this.resettingPromptKey.set(null);
        this.aiPrompts.update((list) =>
          list.map((p) => (p.key === key ? updated : p))
        );
        this.promptDrafts.update((drafts) => ({ ...drafts, [key]: updated.content }));
        this.notification.success('Prompt reset to default');
      },
      error: () => {
        this.resettingPromptKey.set(null);
        this.notification.error('Failed to reset prompt');
      }
    });
  }

  resetAllPrompts(): void {
    this.resettingAllPrompts.set(true);
    this.apiService.post<AIPrompt[]>('/ai/prompts/reset/', {}).subscribe({
      next: (prompts) => {
        this.resettingAllPrompts.set(false);
        this.aiPrompts.set(prompts);
        const drafts: Record<string, string> = {};
        prompts.forEach((p) => { drafts[p.key] = p.content; });
        this.promptDrafts.set(drafts);
        this.notification.success('All prompts reset to defaults');
      },
      error: () => {
        this.resettingAllPrompts.set(false);
        this.notification.error('Failed to reset prompts');
      }
    });
  }

  // ─── LinkedIn Config ───────────────────────
  loadLinkedInConfig(): void {
    this.loadingLinkedInConfig.set(true);
    this.apiService.get<LinkedInConfig>('/agent/linkedin-config/').subscribe({
      next: (res) => {
        this.loadingLinkedInConfig.set(false);
        if (res && (res as any).configured !== false && res.linkedin_url !== undefined) {
          this.linkedinConfig.set(res);
        } else {
          this.linkedinConfig.set(null);
        }
      },
      error: () => {
        this.loadingLinkedInConfig.set(false);
        this.linkedinConfig.set(null);
      }
    });
  }

  startLinkedInEdit(): void {
    this.linkedinEditMode.set(true);
    const config = this.linkedinConfig();
    if (config) {
      this.linkedinConfigForm.patchValue({
        linkedin_url: config.linkedin_url,
        cookies_json: `[\n  {\n    "name": "li_at",\n    "value": "PASTE_YOUR_LI_AT_HERE"\n  },\n  {\n    "name": "JSESSIONID",\n    "value": "ajax:PASTE_YOUR_JSESSIONID_HERE"\n  }\n]`
      });
    }
  }

  cancelLinkedInEdit(): void {
    this.linkedinEditMode.set(false);
    this.linkedinConfigForm.reset();
  }

  saveLinkedInConfig(): void {
    if (this.linkedinConfigForm.invalid) return;

    this.savingLinkedInConfig.set(true);
    let parsedCookies = [];
    try {
      parsedCookies = JSON.parse(this.linkedinConfigForm.value.cookies_json);
      if (!Array.isArray(parsedCookies)) {
        throw new Error('Cookies must be a JSON array.');
      }
    } catch (e) {
      this.savingLinkedInConfig.set(false);
      this.notification.error('Invalid JSON cookies format. Must be a valid JSON array.');
      return;
    }

    const payload = {
      linkedin_url: this.linkedinConfigForm.value.linkedin_url || '',
      cookies: parsedCookies
    };

    this.apiService.put<LinkedInConfig>('/agent/linkedin-config/', payload).subscribe({
      next: (res) => {
        this.savingLinkedInConfig.set(false);
        this.linkedinConfig.set(res);
        this.linkedinEditMode.set(false);
        this.linkedinConfigForm.reset();
        this.notification.success('LinkedIn configuration saved successfully');
      },
      error: (err) => {
        this.savingLinkedInConfig.set(false);
        this.notification.error('Failed to save LinkedIn configuration');
      }
    });
  }

  deleteLinkedInConfig(): void {
    if (confirm('Are you sure you want to remove your LinkedIn session configuration?')) {
      this.deletingLinkedInConfig.set(true);
      this.apiService.delete('/agent/linkedin-config/').subscribe({
        next: () => {
          this.deletingLinkedInConfig.set(false);
          this.linkedinConfig.set(null);
          this.linkedinEditMode.set(false);
          this.linkedinConfigForm.reset();
          this.notification.success('LinkedIn configuration removed');
        },
        error: () => {
          this.deletingLinkedInConfig.set(false);
          this.notification.error('Failed to remove LinkedIn configuration');
        }
      });
    }
  }

  // ─── SMTP Configuration ─────────────────────
  loadSMTPSettings(): void {
    if (!this.isAdmin()) return;
    this.apiService.get<any>('/auth/organization/branding/').subscribe({
      next: (res) => {
        this.smtpForm.patchValue({
          smtp_host: res.smtp_host || '',
          smtp_port: res.smtp_port || 587,
          smtp_username: res.smtp_username || '',
          smtp_password: '',
          smtp_use_tls: res.smtp_use_tls !== undefined ? res.smtp_use_tls : true,
          smtp_use_ssl: res.smtp_use_ssl !== undefined ? res.smtp_use_ssl : false,
          smtp_from_email: res.smtp_from_email || ''
        });
        this.smtpHasPassword.set(res.smtp_has_password);
        if (res.smtp_host) {
          this.smtpConfig.set(res);
        } else {
          this.smtpConfig.set(null);
        }
      }
    });
  }

  startSmtpEdit(): void {
    this.smtpEditMode.set(true);
    const config = this.smtpConfig();
    if (config) {
      this.smtpForm.patchValue({
        smtp_host: config.smtp_host || '',
        smtp_port: config.smtp_port || 587,
        smtp_username: config.smtp_username || '',
        smtp_password: '',
        smtp_use_tls: config.smtp_use_tls !== undefined ? config.smtp_use_tls : true,
        smtp_use_ssl: config.smtp_use_ssl !== undefined ? config.smtp_use_ssl : false,
        smtp_from_email: config.smtp_from_email || ''
      });
    }
  }

  cancelSmtpEdit(): void {
    this.smtpEditMode.set(false);
    this.loadSMTPSettings();
  }

  deleteSmtpConfig(): void {
    if (!confirm('Are you sure you want to remove the SMTP configuration?')) return;
    this.savingSmtp.set(true);
    const formData = new FormData();
    formData.append('smtp_host', '');
    formData.append('smtp_port', '587');
    formData.append('smtp_username', '');
    formData.append('smtp_password', '');
    formData.append('smtp_use_tls', 'true');
    formData.append('smtp_use_ssl', 'false');
    formData.append('smtp_from_email', '');

    this.apiService.put<any>('/auth/organization/branding/', formData).subscribe({
      next: (res) => {
        this.savingSmtp.set(false);
        this.smtpConfig.set(null);
        this.smtpEditMode.set(false);
        this.smtpHasPassword.set(false);
        this.smtpForm.reset({
          smtp_port: 587,
          smtp_use_tls: true,
          smtp_use_ssl: false
        });
        this.notification.success('SMTP configuration removed successfully.');
      },
      error: (err) => {
        this.savingSmtp.set(false);
        this.notification.error('Failed to remove SMTP configuration');
      }
    });
  }

  onSMTPSubmit(): void {
    if (this.smtpForm.invalid) return;
    this.savingSmtp.set(true);
    
    const formData = new FormData();
    formData.append('smtp_host', this.smtpForm.value.smtp_host || '');
    formData.append('smtp_port', String(this.smtpForm.value.smtp_port));
    formData.append('smtp_username', this.smtpForm.value.smtp_username || '');
    formData.append('smtp_use_tls', String(this.smtpForm.value.smtp_use_tls));
    formData.append('smtp_use_ssl', String(this.smtpForm.value.smtp_use_ssl));
    formData.append('smtp_from_email', this.smtpForm.value.smtp_from_email || '');
    
    if (this.smtpForm.value.smtp_password) {
      formData.append('smtp_password', this.smtpForm.value.smtp_password);
    }
    
    this.apiService.put<any>('/auth/organization/branding/', formData).subscribe({
      next: (res) => {
        this.savingSmtp.set(false);
        this.smtpHasPassword.set(res.smtp_has_password);
        this.smtpForm.patchValue({ smtp_password: '' });
        if (res.smtp_host) {
          this.smtpConfig.set(res);
        } else {
          this.smtpConfig.set(null);
        }
        this.smtpEditMode.set(false);
        this.notification.success('SMTP configuration saved successfully.');
      },
      error: (err) => {
        this.savingSmtp.set(false);
        const msg = err.error?.error?.message || 'Failed to save SMTP configuration';
        this.notification.error(msg);
      }
    });
  }

  // ─── LLM Stats ─────────────────────────────
  loadLLMStats(): void {
    this.loadingStats.set(true);
    this.apiService.get<LLMStats>('/agent/llm-stats/').subscribe({
      next: (res) => {
        this.loadingStats.set(false);
        this.llmStats.set(res);
      },
      error: () => {
        this.loadingStats.set(false);
      }
    });
  }
}
