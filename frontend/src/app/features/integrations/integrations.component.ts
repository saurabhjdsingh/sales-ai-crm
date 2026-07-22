import { Component, OnInit, Inject, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { TelephonyService, TelephonySettings } from '../telephony/telephony.service';

// ─── GMAIL CONFIG DIALOG ─────────────────────────────────────────────────────
@Component({
  selector: 'app-gmail-config-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="dialog-container dark-theme">
      <div class="dialog-header">
        <div class="title-area">
          <mat-icon class="gmail-icon">email</mat-icon>
          <h2 mat-dialog-title>Gmail Integration</h2>
        </div>
        <button mat-icon-button (click)="close()"><mat-icon>close</mat-icon></button>
      </div>

      <mat-dialog-content class="dialog-content">
        @if (data.apiConfigured) {
          <div class="status-summary" style="margin-bottom: 1.25rem;">
            <div class="badge-row" style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="t-badge gmail">📬 Google API Active</span>
              <span class="status-tag connected">CONFIGURED</span>
            </div>
          </div>
        } @else {
          <div class="status-summary" style="margin-bottom: 1.25rem;">
            <div class="badge-row" style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="t-badge inactive" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); color: #f87171;">📬 Google API Inactive</span>
              <span class="status-tag failed" style="background: rgba(239, 68, 68, 0.15); color: #f87171;">NOT CONFIGURED</span>
            </div>
          </div>
          <div class="connection-status disconnected" style="margin-bottom: 1.25rem;">
            <mat-icon class="status-icon">error_outline</mat-icon>
            <div class="status-info">
              <h3>Admin Setup Required</h3>
              <p>An administrator needs to configure the Google Client ID & Secret in settings before you can connect your mailbox.</p>
            </div>
          </div>
        }

        @if (data.status?.connected) {
          <div class="connection-status connected">
            <mat-icon class="status-icon">check_circle</mat-icon>
            <div class="status-info">
              <h3>Mailbox Connected</h3>
              <p>Synchronizing emails for <strong>{{ data.status?.email }}</strong></p>
            </div>
          </div>

          <div class="info-box">
            <p><strong>Sync Status:</strong> <span class="status-badge" [ngClass]="data.status?.status">{{ data.status?.status | uppercase }}</span></p>
            <p style="margin-top: 0.5rem; font-size: 0.8rem; color: #94a3b8;">Emails associated with CRM contacts are automatically synced in the background when viewing contacts, companies, or deals.</p>
          </div>
        } @else if (data.apiConfigured) {
          <div class="connection-status disconnected">
            <mat-icon class="status-icon">error_outline</mat-icon>
            <div class="status-info">
              <h3>Not Connected</h3>
              <p>Connect your mailbox to enable email timeline syncing.</p>
            </div>
          </div>
          <div class="features-list">
            <div class="feature-item">
              <mat-icon>check</mat-icon>
              <span>Automatic background syncing of interactions</span>
            </div>
            <div class="feature-item">
              <mat-icon>check</mat-icon>
              <span>Provider-agnostic activity rendering</span>
            </div>
            <div class="feature-item">
              <mat-icon>check</mat-icon>
              <span>Feeds contextual history directly to AI Copilot</span>
            </div>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="close()">Cancel</button>
        @if (data.status?.connected) {
          <button mat-flat-button color="warn" (click)="disconnect()" [disabled]="loading()">
            @if (loading()) { <mat-spinner diameter="18"></mat-spinner> }
            @else { Disconnect Account }
          </button>
        } @else {
          <button mat-flat-button color="primary" (click)="connect()" [disabled]="loading() || !data.apiConfigured">
            @if (loading()) { <mat-spinner diameter="18"></mat-spinner> }
            @else { <mat-icon>login</mat-icon> Connect Gmail }
          </button>
        }
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container { background-color: #0b1329; color: #e2e8f0; border-radius: 12px; }
    .dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .title-area { display: flex; align-items: center; gap: 0.75rem; }
    .title-area h2 { margin: 0 !important; color: #f8fafc; font-size: 1.25rem; font-weight: 700; }
    .gmail-icon { color: #f87171; }
    .dialog-content { padding: 1.5rem !important; }
    .connection-status { display: flex; align-items: center; gap: 1rem; padding: 1rem; border-radius: 8px; margin-bottom: 1.25rem; }
    .connection-status.connected { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.15); }
    .connection-status.disconnected { background: rgba(148, 163, 184, 0.08); border: 1px solid rgba(148, 163, 184, 0.15); }
    .status-icon { font-size: 28px; width: 28px; height: 28px; }
    .connected .status-icon { color: #34d399; }
    .disconnected .status-icon { color: #94a3b8; }
    .status-info h3 { margin: 0; font-size: 0.95rem; font-weight: 600; color: #f8fafc; }
    .status-info p { margin: 0.25rem 0 0 0; font-size: 0.8rem; color: #94a3b8; }
    .info-box { background: rgba(0, 0, 0, 0.15); padding: 1rem; border-radius: 6px; font-size: 0.85rem; }
    .status-badge { font-weight: 700; font-size: 0.75rem; padding: 0.1rem 0.35rem; border-radius: 4px; }
    .status-badge.connected { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .features-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .feature-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #cbd5e1; }
    .feature-item mat-icon { color: #3b82f6; font-size: 18px; width: 18px; height: 18px; }
    mat-dialog-actions { padding: 1rem 1.5rem !important; border-top: 1px solid rgba(255, 255, 255, 0.05); }

    .status-summary { display: flex; justify-content: space-between; align-items: center; }
    .badge-row { display: flex; align-items: center; gap: 0.75rem; }
    .t-badge { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.8rem; font-weight: 700; color: #34d399; }
    .t-badge.gmail { background: rgba(248, 113, 113, 0.08); border: 1px solid rgba(248, 113, 113, 0.2); color: #f87171; }
    .status-tag { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 4px; }
    .status-tag.connected { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .status-tag.failed { background: rgba(239, 68, 68, 0.15); color: #f87171; }

    /* Light theme overrides */
    :host-context(body.light-theme) .dialog-container { background-color: #ffffff !important; color: #334155 !important; }
    :host-context(body.light-theme) .dialog-header { border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
    :host-context(body.light-theme) .title-area h2 { color: #0f172a !important; }
    :host-context(body.light-theme) .status-info h3 { color: #0f172a !important; }
    :host-context(body.light-theme) .info-box { background: #f1f5f9; color: #334155; }
    :host-context(body.light-theme) .feature-item { color: #475569; }
    :host-context(body.light-theme) mat-dialog-actions { border-top: 1px solid rgba(0, 0, 0, 0.08); }
    :host-context(body.light-theme) .connection-status.disconnected { background: rgba(0, 0, 0, 0.02); border: 1px solid rgba(0, 0, 0, 0.06); }
    :host-context(body.light-theme) .connection-status.connected { background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.1); }
  `]
})
export class GmailConfigDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<GmailConfigDialogComponent>);
  readonly loading = signal(false);

  constructor(@Inject(MAT_DIALOG_DATA) public data: { status: any, apiConfigured: boolean, onConnect: () => void, onDisconnect: () => void }) {}

  connect(): void {
    this.loading.set(true);
    this.data.onConnect();
    this.close();
  }

  disconnect(): void {
    this.loading.set(true);
    this.data.onDisconnect();
    this.close();
  }

  close(): void {
    this.dialogRef.close();
  }
}

// ─── SECONDARY OUTBOUND DIALOG ─────────────────────────────────────────────
@Component({
  selector: 'app-secondary-outbound-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="dialog-container dark-theme">
      <div class="dialog-header">
        <div class="title-area">
          <mat-icon style="color: #60a5fa;">dns</mat-icon>
          <h2 mat-dialog-title>Secondary Outbound Mailbox</h2>
        </div>
        <button mat-icon-button (click)="close()"><mat-icon>close</mat-icon></button>
      </div>

      <mat-dialog-content class="dialog-content">
        <p style="font-size: 0.85rem; color: #94a3b8; margin: 0 0 1.25rem 0; line-height: 1.4;">
          Connect a secondary email account dedicated to cold sales outreach and AI sequences. All outbound emails will send from this account while prospect replies land in your Primary inbox.
        </p>

        @if (data.secondaryAccount) {
          <div class="connection-status connected" style="margin-bottom: 1.25rem;">
            <mat-icon class="status-icon" style="color: #34d399;">check_circle</mat-icon>
            <div class="status-info">
              <h3 style="margin:0; font-size:0.95rem; font-weight:600; color:#f8fafc;">
                {{ data.secondaryAccount.email }}
              </h3>
              <p style="margin:0.25rem 0 0 0; font-size:0.8rem; color:#94a3b8;">
                Type: <strong>{{ data.secondaryAccount.provider_type | uppercase }}</strong> | Role: Secondary Outbound Sender
              </p>
            </div>
          </div>
        } @else {
          <div class="options-grid" style="display: flex; flex-direction: column; gap: 1rem;">
            <div class="option-card" (click)="connectGoogleOAuth()" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 0.85rem;">
                <mat-icon style="color: #ea4335; font-size: 24px; width: 24px; height: 24px;">email</mat-icon>
                <div>
                  <h4 style="margin:0; font-size:0.95rem; font-weight:600; color:#f8fafc;">Connect Secondary Gmail ID (Google OAuth)</h4>
                  <p style="margin:0.2rem 0 0 0; font-size:0.78rem; color:#94a3b8;">Authorize a secondary Gmail / Google Workspace address via OAuth</p>
                </div>
              </div>
              <mat-icon style="color: #60a5fa;">chevron_right</mat-icon>
            </div>

            <div class="option-card" (click)="openCustomSmtp()" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 0.85rem;">
                <mat-icon style="color: #60a5fa; font-size: 24px; width: 24px; height: 24px;">dns</mat-icon>
                <div>
                  <h4 style="margin:0; font-size:0.95rem; font-weight:600; color:#f8fafc;">Connect Custom SMTP Server</h4>
                  <p style="margin:0.2rem 0 0 0; font-size:0.78rem; color:#94a3b8;">Configure custom SMTP credentials (SendGrid, Mailgun, SES, Custom Domain)</p>
                </div>
              </div>
              <mat-icon style="color: #60a5fa;">chevron_right</mat-icon>
            </div>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="close()">Close</button>
        @if (data.secondaryAccount) {
          <button mat-flat-button color="warn" (click)="disconnect()">Disconnect Secondary Account</button>
        }
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container { background-color: #0b1329; color: #e2e8f0; border-radius: 12px; max-width: 500px; width: 100%; }
    .dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .title-area { display: flex; align-items: center; gap: 0.75rem; }
    .title-area h2 { margin: 0 !important; color: #f8fafc; font-size: 1.25rem; font-weight: 700; }
    .dialog-content { padding: 1.5rem !important; }
    .option-card:hover { border-color: rgba(96, 165, 250, 0.4) !important; background: rgba(59, 130, 246, 0.08) !important; }
  `]
})
export class SecondaryOutboundDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<SecondaryOutboundDialogComponent>);

  constructor(@Inject(MAT_DIALOG_DATA) public data: {
    secondaryAccount: any;
    onConnectGoogle: () => void;
    onConnectSmtp: () => void;
    onDisconnect: (accountId: string) => void;
  }) {}

  connectGoogleOAuth(): void {
    this.dialogRef.close();
    this.data.onConnectGoogle();
  }

  openCustomSmtp(): void {
    this.dialogRef.close();
    this.data.onConnectSmtp();
  }

  disconnect(): void {
    if (this.data.secondaryAccount?.id) {
      this.data.onDisconnect(this.data.secondaryAccount.id);
      this.dialogRef.close();
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}

// ─── AI ASSISTANT CONFIG DIALOG ──────────────────────────────────────────────
@Component({
  selector: 'app-ai-config-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <div class="dialog-container dark-theme">
      <div class="dialog-header">
        <div class="title-area">
          <mat-icon class="ai-icon">smart_toy</mat-icon>
          <h2 mat-dialog-title>AI Assistant Configuration</h2>
        </div>
        <button mat-icon-button (click)="close()"><mat-icon>close</mat-icon></button>
      </div>

      <mat-dialog-content class="dialog-content">
        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="32"></mat-spinner>
            <p>Loading configuration details...</p>
          </div>
        } @else if (config() && !editMode()) {
          <div class="configured-state">
            <div class="configured-badge">
              <span class="p-icon">{{ getProviderIcon(config().provider) }}</span>
              <strong>{{ getProviderName(config().provider) }}</strong>
            </div>
            <div class="details-list">
              <div class="detail-row">
                <span>Model Name</span>
                <strong>{{ config().model_name }}</strong>
              </div>
              <div class="detail-row">
                <span>API Key</span>
                <strong>🔑 Masked ({{ config().api_key_masked }})</strong>
              </div>
              <div class="detail-row" *ngIf="config().base_url">
                <span>Endpoint Base URL</span>
                <strong style="word-break: break-all;">{{ config().base_url }}</strong>
              </div>
            </div>
            <div class="actions-row">
              <button mat-stroked-button (click)="editMode.set(true)">
                <mat-icon>edit</mat-icon> Reconfigure
              </button>
              <button mat-button color="warn" (click)="deleteConfig()" [disabled]="deleting()">
                <mat-icon>delete</mat-icon> Remove
              </button>
            </div>
          </div>
        } @else {
          <!-- Step 1: Provider selection -->
          @if (!selectedProvider()) {
            <h4 class="step-title">Choose your AI provider</h4>
            <div class="providers-grid">
              @for (p of providers; track p.id) {
                <div class="provider-option-card" (click)="selectProvider(p.id)">
                  <span class="p-card-icon">{{ p.icon }}</span>
                  <span class="p-card-name">{{ p.name }}</span>
                </div>
              }
            </div>
          } @else {
            <button mat-button type="button" class="back-btn" (click)="resetForm()">
              <mat-icon>arrow_back</mat-icon> Change Provider (Selected: {{ getProviderName(selectedProvider()!) }})
            </button>
            <form [formGroup]="form" (ngSubmit)="saveConfig()" class="config-form">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Configuration Type</mat-label>
                <mat-select formControlName="config_type" (selectionChange)="onConfigTypeChange($event.value)">
                  <mat-option value="cloud_api">Official Cloud API</mat-option>
                  <mat-option value="custom_endpoint">Custom / Proxy Endpoint</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>API Key</mat-label>
                <input matInput [type]="showKey() ? 'text' : 'password'" formControlName="api_key" required>
                <button matSuffix mat-icon-button type="button" (click)="showKey.set(!showKey())">
                  <mat-icon>{{ showKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Model Name</mat-label>
                <input matInput formControlName="model_name" required>
                <mat-hint *ngIf="getSelectedProvider()?.defaultModels?.length">
                  Popular: {{ getSelectedProvider()!.defaultModels.join(', ') }}
                </mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width" *ngIf="form.get('config_type')?.value === 'custom_endpoint'" style="margin-top: 1rem;">
                <mat-label>Base Endpoint URL</mat-label>
                <input matInput formControlName="base_url" placeholder="https://your-custom-proxy.com" required>
              </mat-form-field>

              <div class="form-buttons">
                <button mat-button type="button" (click)="cancelEdit()">Cancel</button>
                <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
                  @if (saving()) { <mat-spinner diameter="18"></mat-spinner> }
                  @else { Save Configuration }
                </button>
              </div>
            </form>
          }
        }
      </mat-dialog-content>
    </div>
  `,
  styles: [`
    .dialog-container { background-color: #0b1329; color: #e2e8f0; border-radius: 12px; max-width: 500px; width: 100%; }
    .dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .title-area { display: flex; align-items: center; gap: 0.75rem; }
    .title-area h2 { margin: 0 !important; color: #f8fafc; font-size: 1.25rem; font-weight: 700; }
    .ai-icon { color: #818cf8; }
    .dialog-content { padding: 1.5rem !important; }
    .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 0; gap: 1rem; color: #94a3b8; }
    .configured-state { display: flex; flex-direction: column; gap: 1.25rem; }
    .configured-badge { display: flex; align-items: center; gap: 0.5rem; background: rgba(129, 140, 248, 0.08); border: 1px solid rgba(129, 140, 248, 0.2); padding: 0.5rem 1rem; border-radius: 8px; color: #a5b4fc; }
    .details-list { background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.75rem; }
    .detail-row { display: flex; justify-content: space-between; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; }
    .detail-row:last-child { border: none; padding: 0; }
    .detail-row span { color: #64748b; }
    .detail-row strong { color: #e2e8f0; }
    .actions-row { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .step-title { color: #94a3b8; font-size: 0.95rem; font-weight: 600; margin: 0 0 1rem 0; }
    .providers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .provider-option-card { border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.015); border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; }
    .provider-option-card:hover { border-color: #818cf8; background: rgba(129, 140, 248, 0.04); }
    .p-card-icon { font-size: 1.5rem; }
    .p-card-name { font-weight: 600; font-size: 0.85rem; }
    .back-btn { margin-bottom: 1rem; font-size: 0.8rem; color: #818cf8; padding: 0; }
    .config-form { display: flex; flex-direction: column; gap: 1rem; }
    .full-width { width: 100%; }
    .form-buttons { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }

    /* Light theme overrides */
    :host-context(body.light-theme) .dialog-container { background-color: #ffffff !important; color: #334155 !important; }
    :host-context(body.light-theme) .dialog-header { border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
    :host-context(body.light-theme) .title-area h2 { color: #0f172a !important; }
    :host-context(body.light-theme) .details-list { background: #f1f5f9; }
    :host-context(body.light-theme) .detail-row strong { color: #0f172a; }
    :host-context(body.light-theme) .provider-option-card { border: 1px solid rgba(0, 0, 0, 0.08); background: #f8fafc; color: #334155; }
    :host-context(body.light-theme) .provider-option-card:hover { border-color: #818cf8; background: rgba(129, 140, 248, 0.04); }
    :host-context(body.light-theme) .step-title { color: #475569; }
  `]
})
export class AIConfigDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<AIConfigDialogComponent>);
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  readonly config = signal<any>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly editMode = signal(false);

  readonly selectedProvider = signal<string | null>(null);
  readonly showKey = signal(false);

  readonly providers = [
    { id: 'openai', name: 'OpenAI GPT', icon: '🤖', defaultModels: ['gpt-4o', 'gpt-4-turbo'] },
    { id: 'anthropic', name: 'Anthropic Claude', icon: '🧠', defaultModels: ['claude-3-5-sonnet', 'claude-3-opus'] },
    { id: 'gemini', name: 'Google Gemini', icon: '✨', defaultModels: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
    { id: 'custom', name: 'Local/Custom Ollama', icon: '💻', defaultModels: ['llama3', 'mistral'] }
  ];

  readonly form: FormGroup = this.fb.group({
    config_type: ['cloud_api', Validators.required],
    api_key: ['', Validators.required],
    model_name: ['', Validators.required],
    base_url: ['']
  });

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading.set(true);
    this.apiService.get<any>('/ai/config/').subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res && res.configured !== false) {
          this.config.set(res);
        } else {
          this.config.set(null);
        }
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  selectProvider(id: string): void {
    this.selectedProvider.set(id);
    const defaults = this.providers.find(p => p.id === id)?.defaultModels || [];
    this.form.patchValue({
      model_name: defaults[0] || ''
    });
  }

  onConfigTypeChange(val: string): void {
    if (val === 'custom_endpoint') {
      this.form.get('base_url')?.setValidators([Validators.required]);
    } else {
      this.form.get('base_url')?.clearValidators();
      this.form.get('base_url')?.setValue('');
    }
    this.form.get('base_url')?.updateValueAndValidity();
  }

  getSelectedProvider() {
    return this.providers.find(p => p.id === this.selectedProvider());
  }

  getProviderIcon(provider: string): string {
    return this.providers.find(p => p.id === provider)?.icon || '🤖';
  }

  getProviderName(provider: string): string {
    return this.providers.find(p => p.id === provider)?.name || provider;
  }

  cancelEdit(): void {
    this.editMode.set(false);
    this.resetForm();
  }

  resetForm(): void {
    this.selectedProvider.set(null);
    this.form.reset({ config_type: 'cloud_api' });
  }

  saveConfig(): void {
    if (this.form.invalid || !this.selectedProvider()) return;
    this.saving.set(true);
    const payload = {
      provider: this.selectedProvider(),
      ...this.form.value
    };
    this.apiService.put<any>('/ai/config/', payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success('AI Configuration updated successfully.');
        this.editMode.set(false);
        this.resetForm();
        this.loadConfig();
      },
      error: (err: any) => {
        this.saving.set(false);
        const msg = err.error?.error?.message || 'Failed to save configuration';
        this.notification.error(msg);
      }
    });
  }

  deleteConfig(): void {
    this.deleting.set(true);
    this.apiService.delete('/ai/config/').subscribe({
      next: () => {
        this.deleting.set(false);
        this.config.set(null);
        this.notification.success('AI Configuration removed.');
      },
      error: () => {
        this.deleting.set(false);
        this.notification.error('Failed to remove AI Configuration.');
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}

// ─── TELEPHONY CONFIG DIALOG ─────────────────────────────────────────────────
@Component({
  selector: 'app-telephony-config-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <div class="dialog-container dark-theme">
      <div class="dialog-header">
        <div class="title-area">
          <mat-icon class="phone-icon">phone</mat-icon>
          <h2 mat-dialog-title>Telephony Configuration</h2>
        </div>
        <div class="header-actions">
          <button mat-icon-button (click)="showGuide.set(!showGuide())" title="Setup Instructions" class="guide-toggle">
            <mat-icon>info_outline</mat-icon>
          </button>
          <button mat-icon-button (click)="close()"><mat-icon>close</mat-icon></button>
        </div>
      </div>

      <mat-dialog-content class="dialog-content">
        @if (showGuide()) {
          <div class="webhook-guide-box" style="margin-bottom: 1.5rem;">
            <h5 style="margin-top: 0; color: #fbbf24; font-size: 0.85rem; font-weight: 700;">Twilio Integration Setup Guide</h5>
            
            <div style="margin-top: 0.75rem;">
              <h6 style="margin: 0 0 0.25rem 0; color: #f8fafc; font-size: 0.8rem; font-weight: 600;">Set Up Outbound Calls (TwiML App):</h6>
              <p style="margin: 0 0 0.5rem 0; font-size: 0.75rem; color: #cbd5e1; line-height: 1.4;">
                Go to <strong>Voice > TwiML Apps</strong> in Twilio and select/create your app. Configure these URLs:
              </p>
              <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem;">
                <div>
                  <span style="font-size: 0.7rem; color: #94a3b8; font-weight: 500; display: block; margin-bottom: 0.15rem;">Voice Request URL (HTTP POST)</span>
                  <code (click)="copyText(getVoiceWebhookUrl())">{{ getVoiceWebhookUrl() }}</code>
                </div>
                <div>
                  <span style="font-size: 0.7rem; color: #94a3b8; font-weight: 500; display: block; margin-bottom: 0.15rem;">Voice Status Callback URL (HTTP POST)</span>
                  <code (click)="copyText(getStatusWebhookUrl())">{{ getStatusWebhookUrl() }}</code>
                </div>
              </div>
            </div>

            <div style="margin-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 0.75rem;">
              <h6 style="margin: 0 0 0.25rem 0; color: #f8fafc; font-size: 0.8rem; font-weight: 600;">Set Up Incoming Calls (Active Phone Number):</h6>
              <p style="margin: 0 0 0.5rem 0; font-size: 0.75rem; color: #cbd5e1; line-height: 1.4;">
                Go to <strong>Phone Numbers > Active Numbers</strong> and click your active phone number. Scroll to the Voice configuration section and set:
                <br>• <em>Configure With</em>: <strong>Webhook</strong>
              </p>
              <div>
                <span style="font-size: 0.7rem; color: #94a3b8; font-weight: 500; display: block; margin-bottom: 0.15rem;">A Call Comes In Webhook URL (HTTP POST)</span>
                <code (click)="copyText(getIncomingWebhookUrl())">{{ getIncomingWebhookUrl() }}</code>
              </div>
            </div>
          </div>
        }

        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="32"></mat-spinner>
            <p>Loading telephony configuration...</p>
          </div>
        } @else if (config() && !editMode()) {
          <div class="configured-state">
            <div class="status-summary">
              <div class="badge-row">
                <span class="t-badge twilio">📞 Twilio Active</span>
                <span class="status-tag" [ngClass]="config().connection_status">
                  {{ config().connection_status | uppercase }}
                </span>
              </div>
            </div>

            <div class="details-list">
              <div class="detail-row">
                <span>Account Name</span>
                <strong>{{ config().name }}</strong>
              </div>
              <div class="detail-row">
                <span>Account SID</span>
                <strong>{{ config().account_sid }}</strong>
              </div>
              <div class="detail-row">
                <span>Phone Number</span>
                <strong>{{ config().phone_number }}</strong>
              </div>
              <div class="detail-row">
                <span>Transcription</span>
                <strong>{{ config().transcription_provider | titlecase }}</strong>
              </div>
            </div>

            <div class="actions-row">
              <button mat-stroked-button (click)="testConnection()" [disabled]="testing()">
                @if (testing()) { <mat-spinner diameter="18"></mat-spinner> }
                @else { <mat-icon>network_check</mat-icon> Test Connection }
              </button>
              <button mat-stroked-button (click)="editMode.set(true)">
                <mat-icon>edit</mat-icon> Reconfigure
              </button>
              <button mat-button color="warn" (click)="deleteConfig()" [disabled]="deleting()">
                <mat-icon>delete</mat-icon> Remove
              </button>
            </div>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="saveConfig()" class="config-form">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Integration Name</mat-label>
              <input matInput formControlName="name" placeholder="My Twilio Credentials" required>
            </mat-form-field>

            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Account SID</mat-label>
                <input matInput formControlName="account_sid" required>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Phone Number</mat-label>
                <input matInput formControlName="phone_number" required placeholder="+1234567890">
              </mat-form-field>
            </div>

            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>API Key SID (SK...)</mat-label>
                <input matInput formControlName="api_key" placeholder="SK...">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>API Secret</mat-label>
                <input matInput type="password" formControlName="api_secret">
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Application SID (TwiML App)</mat-label>
              <input matInput formControlName="application_sid" placeholder="AP...">
            </mat-form-field>

            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Transcription Provider</mat-label>
                <mat-select formControlName="transcription_provider">
                  <mat-option value="none">None (Local Whisper Only)</mat-option>
                  <mat-option value="deepgram">Deepgram API</mat-option>
                  <mat-option value="whisper">OpenAI Whisper Cloud</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" *ngIf="form.get('transcription_provider')?.value !== 'none'">
                <mat-label>Transcription API Key</mat-label>
                <input matInput type="password" formControlName="transcription_key">
              </mat-form-field>
            </div>

            <div class="form-buttons">
              <button mat-button type="button" (click)="cancelEdit()">Cancel</button>
              <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
                @if (saving()) { <mat-spinner diameter="18"></mat-spinner> }
                @else { Save Integration }
              </button>
            </div>
          </form>
        }
      </mat-dialog-content>
    </div>
  `,
  styles: [`
    .dialog-container { background-color: #0b1329; color: #e2e8f0; border-radius: 12px; max-width: 550px; width: 100%; }
    .dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .title-area { display: flex; align-items: center; gap: 0.75rem; }
    .title-area h2 { margin: 0 !important; color: #f8fafc; font-size: 1.25rem; font-weight: 700; }
    .phone-icon { color: #10b981; }
    .header-actions { display: flex; align-items: center; gap: 0.25rem; }
    .dialog-content { padding: 1.5rem !important; }
    .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 0; gap: 1rem; color: #94a3b8; }
    .configured-state { display: flex; flex-direction: column; gap: 1.25rem; }
    .status-summary { display: flex; justify-content: space-between; align-items: center; }
    .badge-row { display: flex; align-items: center; gap: 0.75rem; }
    .t-badge { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.8rem; font-weight: 700; color: #34d399; }
    .status-tag { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 4px; }
    .status-tag.connected { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .status-tag.failed { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .guide-toggle { color: #3b82f6; }
    .details-list { background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.75rem; }
    .detail-row { display: flex; justify-content: space-between; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; }
    .detail-row:last-child { border: none; padding: 0; }
    .detail-row span { color: #64748b; }
    .detail-row strong { color: #e2e8f0; }
    .webhook-guide-box { background: rgba(245, 158, 11, 0.04); border: 1px solid rgba(245, 158, 11, 0.1); padding: 0.75rem 1rem; border-radius: 6px; }
    .webhook-guide-box h5 { margin: 0 0 0.25rem 0; color: #fbbf24; font-size: 0.8rem; }
    .webhook-guide-box p { margin: 0 0 0.5rem 0; font-size: 0.75rem; color: #94a3b8; }
    .webhook-guide-box code { display: block; background: #000; padding: 0.5rem; border-radius: 4px; font-family: monospace; font-size: 0.7rem; color: #60a5fa; cursor: pointer; word-break: break-all; }
    .actions-row { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .config-form { display: flex; flex-direction: column; gap: 1rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .full-width { width: 100%; }
    .form-buttons { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }

    /* Light theme overrides */
    :host-context(body.light-theme) .dialog-container { background-color: #ffffff !important; color: #334155 !important; }
    :host-context(body.light-theme) .dialog-header { border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
    :host-context(body.light-theme) .title-area h2 { color: #0f172a !important; }
    :host-context(body.light-theme) .details-list { background: #f1f5f9; }
    :host-context(body.light-theme) .detail-row strong { color: #0f172a; }
    :host-context(body.light-theme) .webhook-guide-box { background: rgba(245, 158, 11, 0.02); border: 1px solid rgba(245, 158, 11, 0.08); }
    :host-context(body.light-theme) .webhook-guide-box h5 { color: #d97706; }
    :host-context(body.light-theme) .webhook-guide-box p { color: #64748b; }
    :host-context(body.light-theme) .webhook-guide-box code { background: #f1f5f9; color: #1e3a8a; }
    :host-context(body.light-theme) .webhook-guide-box ol,
    :host-context(body.light-theme) .webhook-guide-box li {
      color: #334155 !important;
    }
    :host-context(body.light-theme) .webhook-guide-box h6 {
      color: #0f172a !important;
    }
  `]
})
export class TelephonyConfigDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<TelephonyConfigDialogComponent>);
  private readonly telephonyService = inject(TelephonyService);
  private readonly notification = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);

  readonly config = signal<any>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly testing = signal(false);
  readonly editMode = signal(false);
  readonly showGuide = signal(false);

  readonly form: FormGroup = this.fb.group({
    provider_type: ['twilio', Validators.required],
    name: ['Twilio Integration', Validators.required],
    account_sid: ['', Validators.required],
    api_key: [''],
    api_secret: [''],
    application_sid: [''],
    phone_number: ['', Validators.required],
    transcription_provider: ['none'],
    transcription_key: ['']
  });

  getVoiceWebhookUrl(): string {
    const conf = this.config();
    if (conf && conf.webhook_url) {
      const idx = conf.webhook_url.indexOf('/api/v1/');
      if (idx !== -1) {
        const base = conf.webhook_url.substring(0, idx);
        return `${base}/api/v1/telephony/webhooks/voice/${conf.id}/`;
      }
    }
    return `${window.location.origin}/api/v1/telephony/webhooks/voice/\{PROVIDER_ID\}/`;
  }

  getStatusWebhookUrl(): string {
    const conf = this.config();
    if (conf && conf.webhook_url) {
      const idx = conf.webhook_url.indexOf('/api/v1/');
      if (idx !== -1) {
        const base = conf.webhook_url.substring(0, idx);
        return `${base}/api/v1/telephony/webhooks/status/${conf.id}/`;
      }
    }
    return `${window.location.origin}/api/v1/telephony/webhooks/status/\{PROVIDER_ID\}/`;
  }

  getIncomingWebhookUrl(): string {
    const conf = this.config();
    if (conf && conf.webhook_url) {
      return conf.webhook_url;
    }
    return `${window.location.origin}/api/v1/telephony/webhooks/incoming/\{PROVIDER_ID\}/`;
  }

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading.set(true);
    this.telephonyService.getSettings().subscribe({
      next: (res: any) => {
        this.loading.set(false);
        const list = (res as any).results || res;
        if (list && list.length > 0) {
          const config = list[0];
          this.config.set(config);
          this.form.patchValue({
            provider_type: config.provider_type,
            name: config.name,
            account_sid: config.account_sid,
            application_sid: config.application_sid || '',
            phone_number: config.phone_number,
            transcription_provider: config.transcription_provider
          });
        } else {
          this.config.set(null);
        }
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  saveConfig(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    const settingsObj: TelephonySettings = { ...this.form.value };
    if (this.config()?.id) {
      settingsObj.id = this.config().id;
    }
    this.telephonyService.saveSettings(settingsObj).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.config.set(res);
        this.editMode.set(false);
        this.notification.success('Telephony credentials saved successfully.');
        this.loadConfig();
      },
      error: (err: any) => {
        this.saving.set(false);
        const msg = err.error?.error?.message || 'Failed to save configuration';
        this.notification.error(msg);
      }
    });
  }

  testConnection(): void {
    if (!this.config()?.id) return;
    this.testing.set(true);
    this.telephonyService.testConnection(this.config().id).subscribe({
      next: (res: any) => {
        this.testing.set(false);
        if (res.connected) {
          this.notification.success('Connection to Twilio API verified successfully.');
        } else {
          this.notification.error('Twilio verification failed.');
        }
        this.loadConfig();
      },
      error: () => {
        this.testing.set(false);
        this.notification.error('Test connection error.');
      }
    });
  }

  deleteConfig(): void {
    if (!this.config()?.id) return;
    if (confirm('Are you sure you want to remove this Twilio configuration?')) {
      this.deleting.set(true);
      this.apiService.delete(`/telephony/settings/${this.config().id}/`).subscribe({
        next: () => {
          this.deleting.set(false);
          this.config.set(null);
          this.form.reset({ provider_type: 'twilio', name: 'Twilio Integration', transcription_provider: 'none' });
          this.notification.success('Twilio configuration removed.');
        },
        error: (err: any) => {
          this.deleting.set(false);
          this.notification.error('Failed to delete configuration.');
        }
      });
    }
  }

  cancelEdit(): void {
    this.editMode.set(false);
  }

  copyText(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.notification.success('Webhook URL copied to clipboard.');
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}

// ─── INTEGRATIONS MAIN COMPONENT ──────────────────────────────────────────────
@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule
  ],
  template: `
    <div class="integrations-container">
      <div class="header">
        <h1>Integrations</h1>
        <p class="subtitle">Configure global add-ons and external integrations for your organization.</p>
      </div>

      <!-- Search & Filter Controls -->
      <div class="filters-bar">
        <div class="search-box">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            type="text"
            placeholder="Search integrations..."
            (input)="onSearch($event)"
            [value]="searchQuery()"
          >
        </div>

        <div class="tabs-list">
          @for (cat of categories; track cat) {
            <button
              class="tab-btn"
              [class.active]="selectedCategory() === cat"
              (click)="selectedCategory.set(cat)"
            >
              {{ cat }}
            </button>
          }
        </div>
      </div>

      <!-- Callback Processing Overlay -->
      @if (processingCallback()) {
        <div class="callback-overlay">
          <mat-spinner diameter="48"></mat-spinner>
          <h3>Finalizing Google OAuth Connection...</h3>
          <p>Exchanging credentials securely. Please wait.</p>
        </div>
      }

      <div class="integrations-grid">
        @for (item of filteredIntegrations(); track item.id) {
          <div class="glass-card integration-card" [class.coming-soon]="item.badge === 'COMING SOON'">
            <div class="card-top-header">
              <div class="logo-box" [ngClass]="item.iconClass">
                <mat-icon class="logo-icon">{{ item.icon }}</mat-icon>
              </div>
            </div>

            <div class="card-main-body">
              <h3>{{ item.title }}</h3>
              <p class="description">{{ item.description }}</p>
            </div>

            <div class="card-footer-action">
              <button
                class="configure-action-btn"
                (click)="configure(item.id)"
                [disabled]="item.badge === 'COMING SOON'"
              >
                <span>Configure</span>
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .integrations-container {
      font-family: 'Inter', sans-serif;
      color: #e2e8f0;
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem;
    }

    .header {
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 2.25rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.025em;
    }

    .subtitle {
      color: #94a3b8;
      font-size: 1rem;
      margin: 0;
    }

    .filters-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .search-box {
      position: relative;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0.6rem 1rem 0.6rem 2.5rem;
      display: flex;
      align-items: center;
      min-width: 300px;
    }

    .search-icon {
      position: absolute;
      left: 0.75rem;
      color: #64748b;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .search-box input {
      background: transparent;
      border: none;
      color: #cbd5e1;
      font-size: 0.9rem;
      outline: none;
      width: 100%;
    }

    .tabs-list {
      display: flex;
      gap: 0.5rem;
    }

    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: #94a3b8;
      padding: 0.5rem 1.25rem;
      border-radius: 20px;
      font-weight: 500;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.02);
    }

    .tab-btn.active {
      background: #ffffff;
      color: #0f172a;
      border-color: #ffffff;
    }

    .integrations-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(260px, 1fr));
      gap: 1.5rem;
    }

    @media (max-width: 1024px) {
      .integrations-grid {
        grid-template-columns: repeat(2, minmax(260px, 1fr));
      }
    }

    @media (max-width: 640px) {
      .integrations-grid {
        grid-template-columns: 1fr;
      }
    }

    .glass-card {
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .integration-card:hover {
      transform: translateY(-2px);
      border-color: rgba(59, 130, 246, 0.3);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }

    .integration-card.coming-soon {
      opacity: 0.5;
    }

    .card-top-header {
      display: flex;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .logo-box {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-box.gmail { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .logo-box.twilio { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .logo-box.ai-assistant { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
    .logo-box.outlook { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

    .logo-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .card-main-body {
      flex: 1;
      margin-bottom: 1rem;
    }

    .card-main-body h3 {
      font-size: 1.05rem;
      font-weight: 600;
      color: #f8fafc;
      margin: 0 0 0.4rem 0;
    }

    .description {
      color: #94a3b8;
      font-size: 0.8rem;
      line-height: 1.5;
      margin: 0;
    }

    .card-footer-action {
      display: flex;
      justify-content: flex-start;
      margin-top: auto;
      padding-top: 0.75rem;
    }

    .configure-action-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-weight: 500;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      gap: 0.15rem;
      cursor: pointer;
      padding: 0;
      transition: all 0.2s;
    }

    .configure-action-btn:hover:not(:disabled) {
      color: #f8fafc;
    }

    .configure-action-btn:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .configure-action-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .callback-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(9, 15, 31, 0.95);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ffffff;
    }

    .callback-overlay h3 { font-size: 1.5rem; margin: 1.5rem 0 0.5rem 0; }
    .callback-overlay p { color: #64748b; }

    /* ─── LIGHT THEME OVERRIDES ─── */
    :host-context(body.light-theme) .glass-card {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    :host-context(body.light-theme) .integration-card:hover {
      border-color: rgba(59, 130, 246, 0.4);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
    }

    :host-context(body.light-theme) .card-main-body h3 {
      color: #0f172a;
    }

    :host-context(body.light-theme) .description {
      color: #475569;
    }

    :host-context(body.light-theme) .configure-action-btn {
      color: #64748b;
    }

    :host-context(body.light-theme) .configure-action-btn:hover:not(:disabled) {
      color: #0f172a;
    }

    :host-context(body.light-theme) .search-box {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }

    :host-context(body.light-theme) .search-box input {
      color: #0f172a;
    }

    :host-context(body.light-theme) .search-box input::placeholder {
      color: #94a3b8;
    }

    :host-context(body.light-theme) .search-icon {
      color: #64748b;
    }

    :host-context(body.light-theme) .tab-btn {
      color: #64748b;
    }

    :host-context(body.light-theme) .tab-btn:hover {
      color: #0f172a;
      background: rgba(0, 0, 0, 0.03);
    }

    :host-context(body.light-theme) .tab-btn.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }
  `]
})
export class IntegrationsComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly telephonyService = inject(TelephonyService);

  readonly searchQuery = signal('');
  readonly selectedCategory = signal('All');
  readonly categories = ['All', 'Communication', 'AI Tools', 'Outreach'];

  // Connected statuses
  readonly gmailConnected = signal<any>(null);
  readonly gmailApiConfigured = signal<boolean>(false);
  readonly telephonyConnected = signal<boolean>(false);
  readonly aiConnected = signal<boolean>(false);

  readonly loading = signal(false);
  readonly processingCallback = signal(false);

  readonly integrations = [
    {
      id: 'gmail',
      title: 'Gmail Sync',
      description: 'Synchronize email conversations involving your contacts in the background and link them to CRM timelines.',
      icon: 'email',
      iconClass: 'gmail',
      category: 'Communication',
      badge: 'NOT CONFIGURED'
    },
    {
      id: 'telephony',
      title: 'Telephony (Twilio)',
      description: 'Configure Twilio credentials per-user for softphone dialers and transcription services.',
      icon: 'phone',
      iconClass: 'twilio',
      category: 'Communication',
      badge: 'NOT CONFIGURED'
    },
    {
      id: 'ai_assistant',
      title: 'AI Assistant',
      description: 'Connect Anthropic Claude, Google Gemini, or custom OpenAI endpoints to power the Sales CRM AI Copilot.',
      icon: 'smart_toy',
      iconClass: 'ai-assistant',
      category: 'AI Tools',
      badge: 'NOT CONFIGURED'
    },
    {
      id: 'secondary_smtp',
      title: 'Secondary Outbound Mailbox',
      description: 'Connect custom SMTP/Gmail sender for sales outreach to protect primary deliverability.',
      icon: 'dns',
      iconClass: 'gmail',
      category: 'Communication',
      badge: 'NOT CONFIGURED'
    },
    {
      id: 'outlook',
      title: 'Outlook Integration',
      description: 'Synchronize Microsoft Office 365 or Outlook mailboxes to retrieve email interactions.',
      icon: 'mail_outline',
      iconClass: 'outlook',
      category: 'Communication',
      badge: 'COMING SOON'
    }
  ];

  readonly filteredIntegrations = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();
    
    return this.integrations.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      const matchesCat = cat === 'All' || item.category === cat;
      return matchesSearch && matchesCat;
    });
  });

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      this.handleOAuthCallback(code);
    } else {
      this.loadStatuses();
    }
  }

  loadStatuses(): void {
    // Gmail status
    this.apiService.get<any>('/emails/account/').subscribe({
      next: (res) => this.gmailConnected.set(res)
    });

    // Gmail API config status
    this.apiService.get<any>('/emails/google/oauth-config/status/').subscribe({
      next: (res) => this.gmailApiConfigured.set(res && res.configured)
    });

    // Telephony status
    this.telephonyService.getSettings().subscribe({
      next: (res: any) => {
        const list = (res as any).results || res;
        this.telephonyConnected.set(list && list.length > 0);
      }
    });

    // AI config status
    this.apiService.get<any>('/ai/config/').subscribe({
      next: (res) => {
        this.aiConnected.set(res && res.configured !== false);
      }
    });
  }

  getBadgeText(id: string, defBadge: string): string {
    if (defBadge === 'COMING SOON') return 'COMING SOON';
    
    if (id === 'gmail') {
      return this.gmailConnected()?.connected ? 'ENABLED' : 'NOT CONFIGURED';
    }
    if (id === 'telephony') {
      return this.telephonyConnected() ? 'ENABLED' : 'NOT CONFIGURED';
    }
    if (id === 'ai_assistant') {
      return this.aiConnected() ? 'ENABLED' : 'NOT CONFIGURED';
    }
    return defBadge;
  }

  getBadgeClass(id: string, defBadge: string): string {
    const text = this.getBadgeText(id, defBadge);
    if (text === 'ENABLED') return 'enabled';
    if (text === 'COMING SOON') return 'coming-soon';
    return 'not-configured';
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.target.value);
  }

  configure(id: string): void {
    if (id === 'gmail') {
      this.dialog.open(GmailConfigDialogComponent, {
        width: '450px',
        panelClass: 'dark-dialog-panel',
        data: {
          status: this.gmailConnected(),
          apiConfigured: this.gmailApiConfigured(),
          onConnect: () => this.connectGmail(),
          onDisconnect: () => this.disconnectGmail()
        }
      });
    } else if (id === 'telephony') {
      const dialogRef = this.dialog.open(TelephonyConfigDialogComponent, {
        width: '550px',
        panelClass: 'dark-dialog-panel'
      });
      dialogRef.afterClosed().subscribe(() => this.loadStatuses());
    } else if (id === 'ai_assistant') {
      const dialogRef = this.dialog.open(AIConfigDialogComponent, {
        width: '500px',
        panelClass: 'dark-dialog-panel'
      });
      dialogRef.afterClosed().subscribe(() => this.loadStatuses());
    } else if (id === 'secondary_smtp') {
      const statusRes = this.gmailConnected();
      this.dialog.open(SecondaryOutboundDialogComponent, {
        width: '520px',
        panelClass: 'dark-dialog-panel',
        data: {
          secondaryAccount: statusRes?.secondary_account,
          onConnectGoogle: () => this.connectGmail('secondary_outbound'),
          onConnectSmtp: () => {
            import('./smtp-config-dialog.component').then((m) => {
              const ref = this.dialog.open(m.SmtpConfigDialogComponent, {
                width: '560px',
                panelClass: 'dark-dialog-panel'
              });
              ref.afterClosed().subscribe(() => this.loadStatuses());
            });
          },
          onDisconnect: (accId: string) => this.disconnectAccount(accId)
        }
      });
    }
  }

  // OAuth logic
  connectGmail(role = 'primary'): void {
    this.loading.set(true);
    const redirectUri = window.location.origin + '/integrations';
    this.apiService.get<any>('/emails/google/auth-url/', { redirect_uri: redirectUri, role }).subscribe({
      next: (res) => {
        if (res.url) {
          window.location.href = res.url;
        } else {
          this.loading.set(false);
          this.notification.error('Authorization URL returned was empty.');
        }
      },
      error: (err) => {
        this.loading.set(false);
        const errMsg = err.error?.error || 'Gmail credentials are not set on Settings. Contact your admin.';
        this.notification.error(errMsg);
      }
    });
  }

  disconnectGmail(): void {
    this.disconnectAccount();
  }

  disconnectAccount(accountId?: string): void {
    this.loading.set(true);
    this.apiService.post<any>('/emails/google/disconnect/', { account_id: accountId }).subscribe({
      next: () => {
        this.loading.set(false);
        this.notification.success('Email account disconnected successfully.');
        this.loadStatuses();
      },
      error: () => {
        this.loading.set(false);
        this.notification.error('Failed to disconnect email account.');
      }
    });
  }

  private handleOAuthCallback(code: string): void {
    this.processingCallback.set(true);
    const redirectUri = window.location.origin + '/integrations';
    const state = this.route.snapshot.queryParamMap.get('state') || '';
    this.apiService.post<any>('/emails/google/callback/', {
      code,
      redirect_uri: redirectUri,
      state
    }).subscribe({
      next: (res) => {
        this.processingCallback.set(false);
        this.notification.success('Gmail integrated successfully!');
        this.gmailConnected.set(res);
        this.loadStatuses();
        this.router.navigate([], {
          queryParams: { code: null, state: null, scope: null, authuser: null, prompt: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      },
      error: () => {
        this.processingCallback.set(false);
        this.notification.error('Authentication failed. Please verify configurations.');
        this.router.navigate([], {
          queryParams: { code: null, state: null, scope: null, authuser: null, prompt: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        }).then(() => this.loadStatuses());
      }
    });
  }
}
