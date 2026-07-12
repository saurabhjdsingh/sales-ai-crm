import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';

import { CallStateService } from './call-state.service';
import { TwilioVoiceService } from './twilio-voice.service';
import { TelephonyService } from './telephony.service';
import { AudioService } from './audio.service';
import { NotificationService } from '../../core/services/notification.service';
import { ApiService } from '../../core/services/api.service';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';

@Component({
  selector: 'app-phone-widget',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatSelectModule
  ],
  template: `
    <!-- Floating Softphone Widget -->
    <div class="phone-widget-container" [class.expanded]="expanded()" [class.review-mode]="currentScreen() === 'review'">
      
      <!-- Minimized Floating Pill -->
      <button class="minimized-pill" *ngIf="!expanded()" (click)="toggleExpand()" [class.ringing]="isRinging()">
        <mat-icon>{{ isRinging() ? 'ring_volume' : 'call' }}</mat-icon>
        <span class="pulse-ring" *ngIf="isRinging()"></span>
        <span class="pill-label" *ngIf="callState.callDuration() > 0">{{ formatDuration(callState.callDuration()) }}</span>
      </button>

      <!-- Expanded Softphone Panel -->
      <div class="expanded-panel card" *ngIf="expanded()">
        <!-- Header -->
        <div class="panel-header">
          <div class="header-info">
            <mat-icon class="pulse-dot" *ngIf="callState.activeCall() && currentScreen() !== 'review'">lens</mat-icon>
            <h3>{{ getHeaderTitle() }}</h3>
          </div>
          <div class="header-actions">
            <button mat-icon-button (click)="toggleMinimize()" title="Minimize" *ngIf="currentScreen() !== 'review'">
              <mat-icon>remove</mat-icon>
            </button>
            <button mat-icon-button (click)="closeWidget()" title="Close Dialer" *ngIf="currentScreen() === 'dialer'">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Panel Body -->
        <div class="panel-body">
          
          <!-- Screen 1: Dialer -->
          <div class="screen-dialer" *ngIf="currentScreen() === 'dialer'">
            <!-- Simulator Fallback Badge -->
            <div class="simulator-badge" *ngIf="callState.isSimulated()" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); color: #f59e0b; padding: 0.4rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; text-align: center; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
              <mat-icon style="font-size: 16px; width: 16px; height: 16px; margin: 0; vertical-align: middle;">science</mat-icon>
              <span>Simulator Fallback Active (No Twilio Configured)</span>
            </div>

            <div class="dialer-input-container">
              <input type="text" [(ngModel)]="dialNumber" placeholder="Enter phone number..." class="phone-input" />
              <button mat-icon-button class="clear-btn" *ngIf="dialNumber" (click)="dialNumber = ''">
                <mat-icon>backspace</mat-icon>
              </button>
            </div>

            <!-- Keypad -->
            <div class="keypad-grid">
              <button class="key-btn" *ngFor="let key of keypadKeys" (click)="pressKey(key)">
                <span class="num">{{ key }}</span>
              </button>
            </div>

            <!-- Options -->
            <div class="options-container">
              <mat-checkbox [(ngModel)]="aiAssistCheck" (ngModelChange)="onAssistChange($event)" color="primary">
                Live Call Transcription
              </mat-checkbox>
              <mat-checkbox [(ngModel)]="aiAnalysisCheck" [disabled]="!aiAssistCheck" color="primary">
                Post-Call AI Summary
              </mat-checkbox>
            </div>

            <!-- Call Trigger -->
            <button class="action-btn call-trigger" [disabled]="!dialNumber" (click)="placeCall()">
              <mat-icon>call</mat-icon>
              <span>Call Lead</span>
            </button>
          </div>

          <!-- Screen 2: Outgoing Ringing -->
          <div class="screen-ringing-out text-center" *ngIf="currentScreen() === 'ringing_out'">
            <div class="avatar-ring">
              <mat-icon class="ringing-icon">phone_forwarded</mat-icon>
              <div class="ring-pulse1"></div>
              <div class="ring-pulse2"></div>
            </div>
            <div class="caller-meta">
              <h2>{{ callState.crmContext()?.contact?.full_name || 'External Number' }}</h2>
              <p>{{ dialNumber }}</p>
              <span class="ringing-label">Ringing...</span>
            </div>
            <button class="action-btn hangup-trigger mt-6" (click)="cancelCall()">
              <mat-icon>call_end</mat-icon>
              <span>Cancel</span>
            </button>
          </div>

          <!-- Screen 3: Incoming Call -->
          <div class="screen-ringing-in" *ngIf="currentScreen() === 'ringing_in'">
            <div class="incoming-alert text-center">
              <div class="avatar-ring animate-bounce">
                <mat-icon class="ringing-icon">ring_volume</mat-icon>
                <div class="ring-pulse1"></div>
                <div class="ring-pulse2"></div>
              </div>
              <h2>Incoming Call</h2>
              <p class="phone-subtitle">{{ incomingCallerNumber }}</p>
            </div>

            <!-- CRM Context Card -->
            <div class="crm-context-card" *ngIf="callState.crmContext() as context">
              <div class="contact-card-header">
                <mat-icon>person</mat-icon>
                <div>
                  <h4>{{ context.contact?.full_name }}</h4>
                  <span class="company">{{ context.company?.name || 'No Company' }}</span>
                </div>
              </div>
              <div class="quick-details" *ngIf="context.deals?.length">
                <span class="lbl">Active Deals:</span>
                <span class="val">{{ context.deals[0]?.name }} ({{ context.deals[0]?.expected_revenue | currency }})</span>
              </div>
            </div>

            <!-- Options for incoming call -->
            <div class="options-container" style="margin: 1.5rem 0;">
              <mat-checkbox [(ngModel)]="aiAssistCheck" (ngModelChange)="onAssistChange($event)" color="primary">
                Live Call Transcription
              </mat-checkbox>
              <mat-checkbox [(ngModel)]="aiAnalysisCheck" [disabled]="!aiAssistCheck" color="primary">
                Post-Call AI Summary
              </mat-checkbox>
            </div>

            <!-- Answer / Reject Actions -->
            <div class="incoming-actions">
              <button class="action-btn answer" (click)="acceptCall()">
                <mat-icon>call</mat-icon>
                <span>Accept</span>
              </button>
              <button class="action-btn reject" (click)="rejectCall()">
                <mat-icon>call_end</mat-icon>
                <span>Reject</span>
              </button>
            </div>
          </div>

          <!-- Screen 4: Active Call Screen -->
          <div class="screen-active" *ngIf="currentScreen() === 'active'">
            <div class="active-call-meta">
              <h3>{{ callState.crmContext()?.contact?.full_name || 'External Lead' }}</h3>
              <p>{{ dialNumber || incomingCallerNumber }}</p>
              <div class="call-timer">{{ formatDuration(callState.callDuration()) }}</div>
              
              <!-- AI Stream Status Indicator -->
              <div class="ai-stream-status-wrapper" [ngClass]="conversationIntelligence.streamStatus()">
                <span class="status-dot"></span>
                <span class="status-label">AI Capture: {{ getStreamStatusLabel() }}</span>
              </div>
            </div>

            <!-- Call Controls Grid -->
            <div class="controls-grid">
              <button class="control-btn" [class.active]="callState.isMuted()" (click)="toggleMute()">
                <mat-icon>{{ callState.isMuted() ? 'mic_off' : 'mic' }}</mat-icon>
                <span>Mute</span>
              </button>
              <button class="control-btn" [class.active]="callState.isHeld()" (click)="toggleHold()">
                <mat-icon>{{ callState.isHeld() ? 'play_arrow' : 'pause' }}</mat-icon>
                <span>{{ callState.isHeld() ? 'Resume' : 'Hold' }}</span>
              </button>
              <button class="control-btn" (click)="showKeypadInCall = !showKeypadInCall">
                <mat-icon>dialpad</mat-icon>
                <span>Keypad</span>
              </button>
            </div>

            <!-- In-call Keypad -->
            <div class="in-call-keypad" *ngIf="showKeypadInCall">
              <div class="keypad-grid mini">
                <button class="key-btn" *ngFor="let key of keypadKeys" (click)="pressInCallKey(key)">
                  <span>{{ key }}</span>
                </button>
              </div>
            </div>

            <!-- Call Notes Typing Area -->
            <div class="notes-area">
              <textarea [(ngModel)]="agentNotes" placeholder="Type manual notes during the call here..."></textarea>
            </div>

            <!-- End Call button -->
            <button class="action-btn hangup-trigger w-full mt-4" (click)="endCall()">
              <mat-icon>call_end</mat-icon>
              <span>End Call</span>
            </button>
          </div>

          <!-- Screen 5: Post Call Review -->
          <div class="screen-review" *ngIf="currentScreen() === 'review'">
            <div class="review-layout">
              <div class="review-fields">
                <h4>Confirm Call Outcomes</h4>
                
                <div class="sync-loader-card" *ngIf="conversationIntelligence.streamStatus() === 'connected' || conversationIntelligence.streamStatus() === 'connecting'">
                  <mat-spinner diameter="18"></mat-spinner>
                  <span>Syncing final call transcript segments from AI server...</span>
                </div>
                
                <div class="form-group">
                  <label>Conversation Summary</label>
                  <textarea class="summary-field" [(ngModel)]="reviewSummary" placeholder="Edit call summary..."></textarea>
                </div>

                <div class="form-grid">
                  <div class="form-group">
                    <label>Suggested Deal Stage</label>
                    <select [(ngModel)]="reviewDealStage" class="stage-select">
                      <option value="">No Stage Change</option>
                      <option value="lead">Lead</option>
                      <option value="sales_qualified">Sales Qualified</option>
                      <option value="meeting_booked">Meeting Booked</option>
                      <option value="negotiation">Negotiation</option>
                      <option value="poc">POC</option>
                      <option value="contract_sent">Contract Sent</option>
                      <option value="closed_won">Closed Won</option>
                      <option value="closed_lost">Closed Lost</option>
                    </select>
                  </div>
                </div>

                <!-- Suggested Tasks List -->
                <div class="suggested-tasks-section" *ngIf="callState.suggestedQuestions().length || callState.activeCall()?.suggested_tasks?.length">
                  <h5>Suggested Next Action Tasks</h5>
                  <div class="tasks-checklist">
                    @for (task of callState.activeCall()?.suggested_tasks; track task.id) {
                      <div class="task-checkbox-item">
                        <input type="checkbox" [id]="task.id" [(ngModel)]="taskApprovedMap[task.id]" />
                        <label [for]="task.id">
                          <strong>{{ task.title }}</strong>
                          <span class="task-meta">Type: {{ task.task_type | titlecase }} | Priority: {{ task.priority | titlecase }}</span>
                        </label>
                      </div>
                    }
                  </div>
                </div>

                <!-- Action Button logs to CRM -->
                <button class="action-btn confirm-log-btn" [disabled]="savingReview()" (click)="submitReview()">
                  @if (savingReview()) {
                    <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                    <mat-icon>check_circle</mat-icon>
                    <span>Confirm & Log Call</span>
                  }
                </button>
              </div>

              <!-- Draft Templates Side -->
              <div class="review-drafts" *ngIf="callState.aiAssistEnabled()">
                <div class="draft-card">
                  <h5>Suggested Email Follow-up</h5>
                  <pre class="draft-preview">{{ callState.suggestions()?.suggested_email || 'Generating draft...' }}</pre>
                </div>
                <div class="draft-card mt-3">
                  <h5>Suggested LinkedIn Draft</h5>
                  <pre class="draft-preview">{{ callState.suggestions()?.suggested_linkedin || 'Generating draft...' }}</pre>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Collapsible AI Assist Side Panel -->
      <div class="ai-assist-panel card" *ngIf="expanded() && callState.aiAssistEnabled() && currentScreen() === 'active'">
        <div class="panel-header">
          <div class="flex items-center gap-2">
            <mat-icon class="ai-icon">psychology</mat-icon>
            <h3>AI Assist Copilot</h3>
          </div>
        </div>
        <div class="panel-body flex-col">
          <!-- Real-time Insights Feed -->
          <div class="insights-feed">
            <div class="insight-badge objections" *ngIf="callState.objections().length">
              <h5>Objections Detected</h5>
              <ul>
                <li *ngFor="let o of callState.objections()">{{ o }}</li>
              </ul>
            </div>
            
            <div class="insight-badge buying" *ngIf="callState.buyingSignals().length">
              <h5>Buying Signals</h5>
              <ul>
                <li *ngFor="let s of callState.buyingSignals()">{{ s }}</li>
              </ul>
            </div>

            <div class="suggested-questions" *ngIf="callState.suggestedQuestions().length">
              <h5>Suggested Questions to Ask</h5>
              <ul>
                <li *ngFor="let q of callState.suggestedQuestions()">{{ q }}</li>
              </ul>
            </div>
          </div>

          <!-- Live Transcript Log -->
          <div class="transcript-feed">
            <div class="transcript-title">Live Transcript Feed</div>
            <div class="transcript-scroll" #transcriptContainer>
              <div class="empty-transcript" *ngIf="callState.transcript().length === 0">
                Listening for conversation dialogue segments...
              </div>
              @for (seg of callState.transcript(); track seg.timestamp) {
                <div class="seg" [class.agent]="seg.speaker === 'agent'">
                  <span class="spk">{{ seg.speaker === 'agent' ? 'You' : 'Customer' }}:</span>
                  <p class="txt">{{ seg.text }}</p>
                </div>
              }
            </div>
          </div>

          <!-- AI Copilot Chat Pane -->
          <div class="copilot-chat-pane">
            <div class="chat-messages" #chatContainer>
              <div class="message system" *ngIf="callState.copilotMessages().length === 0">
                Ask AI questions regarding this call or linked CRM context.
              </div>
              <div class="message" *ngFor="let m of callState.copilotMessages()" [class.assistant]="m.role === 'assistant'">
                <span class="sender">{{ m.role === 'user' ? 'You' : 'AI Copilot' }}:</span>
                <p>{{ m.content }}</p>
              </div>
            </div>
            <div class="chat-input-container">
              <input type="text" [(ngModel)]="chatInput" placeholder="Ask Copilot..." (keyup.enter)="askCopilot()" />
              <button mat-icon-button (click)="askCopilot()" [disabled]="!chatInput || loadingChat()">
                <mat-icon>send</mat-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  `,
  styles: [`
    .phone-widget-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1000;
      display: flex;
      gap: 12px;
      align-items: flex-end;
      font-family: 'Inter', sans-serif;
    }

    .minimized-pill {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      border: none;
      color: #ffffff;
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      position: relative;

      &:hover {
        transform: scale(1.05);
      }

      &.ringing {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
        animation: pulseRing 1.2s infinite;
      }

      .pulse-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 4px solid #ef4444;
        animation: pulseSpread 1.5s infinite;
      }

      .pill-label {
        font-size: 0.65rem;
        font-weight: 700;
        margin-top: -2px;
      }
    }

    .expanded-panel {
      width: 340px;
      height: 480px;
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .phone-widget-container.review-mode {
      .expanded-panel {
        width: 780px;
        height: 520px;
      }
    }

    .ai-assist-panel {
      width: 320px;
      height: 480px;
      background: #090f1f;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.01);

      .header-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        
        h3 { margin: 0; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
        .pulse-dot { font-size: 8px; width: 8px; height: 8px; color: #10b981; animation: blink 1s infinite; }
      }
      .ai-icon { color: #ec4899; }
    }

    .panel-body {
      flex: 1;
      padding: 1.25rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;

      &.flex-col { display: flex; flex-direction: column; gap: 0.75rem; }
    }

    /* Dialer styling */
    .dialer-input-container {
      display: flex;
      align-items: center;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.2);
      padding: 0.25rem 0.5rem;
      margin-bottom: 1rem;

      .phone-input {
        flex: 1;
        background: transparent;
        border: none;
        color: #f8fafc;
        font-size: 1.1rem;
        font-weight: 600;
        padding: 0.4rem;
        outline: none;
      }
      .clear-btn { color: #64748b; }
    }

    .keypad-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      margin-bottom: 1.25rem;

      &.mini { gap: 0.25rem; }

      .key-btn {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: #e2e8f0;
        border-radius: 8px;
        padding: 0.75rem;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: all 0.15s ease;

        &:hover { background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); color: #3b82f6; }
        .num { font-size: 1.1rem; font-weight: 600; }
      }
    }

    .options-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      ::ng-deep .mdc-checkbox { padding: 0; margin-right: 0.5rem; }
      ::ng-deep .mdc-label { font-size: 0.8rem; color: #94a3b8; }
    }

    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      border-radius: 8px;
      border: none;
      padding: 0.75rem 1rem;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      width: 100%;
      transition: all 0.2s ease;

      &.call-trigger {
        background: linear-gradient(135deg, #10b981, #059669);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        &:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(16, 185, 129, 0.4); }
        &:disabled { background: #1e293b; color: #475569; box-shadow: none; cursor: not-allowed; }
      }

      &.hangup-trigger {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        &:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(239, 68, 68, 0.4); }
      }

      &.answer { background: #10b981; color: white; &:hover { background: #059669; } }
      &.reject { background: #ef4444; color: white; &:hover { background: #dc2626; } }
    }

    /* Outbound Ringing screen */
    .avatar-ring {
      position: relative;
      width: 70px;
      height: 70px;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 2rem auto 1.5rem auto;

      .ringing-icon { color: #3b82f6; font-size: 32px; width: 32px; height: 32px; }

      .ring-pulse1, .ring-pulse2 {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid #3b82f6;
        animation: pulseRingOut 2s infinite;
      }
      .ring-pulse2 { animation-delay: 1s; }
    }

    .caller-meta {
      h2 { font-size: 1.25rem; margin: 0; color: #f8fafc; }
      p { margin: 0.25rem 0; color: #64748b; font-size: 0.9rem; }
      .ringing-label { color: #f59e0b; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    }

    /* Incoming Call screen */
    .incoming-alert {
      margin-bottom: 1rem;
      h2 { font-size: 1.15rem; margin: 0; color: #ef4444; }
      .phone-subtitle { font-size: 0.85rem; color: #64748b; margin: 0.25rem 0 0 0; }
      
      .avatar-ring {
        background: rgba(239, 68, 68, 0.1);
        .ringing-icon { color: #ef4444; }
        .ring-pulse1, .ring-pulse2 { border-color: #ef4444; }
      }
    }

    .crm-context-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 0.75rem;
      margin-bottom: 1.25rem;

      .contact-card-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;

        mat-icon { color: #3b82f6; }
        h4 { margin: 0; font-size: 0.85rem; color: #e2e8f0; }
        .company { font-size: 0.7rem; color: #64748b; }
      }

      .quick-details {
        font-size: 0.75rem;
        display: flex;
        justify-content: space-between;
        .lbl { color: #64748b; }
        .val { color: #60a5fa; font-weight: 500; }
      }
    }

    .incoming-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    /* Active Call screen */
    .active-call-meta {
      text-align: center;
      margin-bottom: 1rem;
      h3 { margin: 0; font-size: 1.1rem; color: #f8fafc; }
      p { margin: 0.25rem 0; color: #64748b; font-size: 0.85rem; }
      .call-timer { font-size: 1.5rem; font-weight: 700; color: #10b981; margin-top: 0.5rem; }
    }

    .controls-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;

      .control-btn {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        border-radius: 8px;
        padding: 0.5rem;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.7rem;
        transition: all 0.15s ease;

        mat-icon { font-size: 20px; width: 20px; height: 20px; }

        &:hover { background: rgba(59, 130, 246, 0.08); color: #3b82f6; }
        &.active { background: rgba(59, 130, 246, 0.15); border-color: #3b82f6; color: #3b82f6; }
      }
    }

    .in-call-keypad {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 0.5rem;
      margin-bottom: 1rem;
    }

    .notes-area {
      textarea {
        width: 100%;
        height: 60px;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 0.5rem;
        color: #cbd5e1;
        font-size: 0.8rem;
        outline: none;
        resize: none;
        box-sizing: border-box;

        &:focus { border-color: rgba(59, 130, 246, 0.5); }
      }
    }

    /* Post Call Review screen */
    .screen-review {
      height: 100%;
    }

    .sync-loader-card {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 6px;
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.75rem;
      color: #93c5fd;
    }

    .review-layout {
      display: flex;
      gap: 1.5rem;
      height: 100%;

      .review-fields {
        flex: 1.2;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;

        h4 { margin: 0 0 0.25rem 0; font-size: 1rem; font-weight: 600; color: #3b82f6; }
      }

      .review-drafts {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        overflow-y: auto;
      }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      label { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; }
      
      .summary-field {
        height: 80px;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        color: #cbd5e1;
        padding: 0.5rem;
        font-size: 0.85rem;
        resize: none;
        outline: none;
        &:focus { border-color: #3b82f6; }
      }

      .stage-select {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        color: #cbd5e1;
        padding: 0.5rem;
        font-size: 0.85rem;
        outline: none;
      }
    }

    .tasks-checklist {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 0.5rem;
      max-height: 120px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .task-checkbox-item {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        
        input { margin-top: 0.15rem; }
        label {
          font-size: 0.8rem;
          color: #e2e8f0;
          display: flex;
          flex-direction: column;
          cursor: pointer;

          .task-meta { font-size: 0.65rem; color: #64748b; }
        }
      }
    }

    .draft-card {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 0.75rem;

      h5 { margin: 0 0 0.4rem 0; font-size: 0.75rem; text-transform: uppercase; color: #ec4899; }
      .draft-preview {
        font-size: 0.75rem;
        white-space: pre-wrap;
        color: #94a3b8;
        max-height: 120px;
        overflow-y: auto;
        margin: 0;
        line-height: 1.4;
      }
    }

    .confirm-log-btn {
      background: #3b82f6;
      color: white;
      &:hover { background: #2563eb; }
    }

    /* AI Assist Copilot Panel */
    .insights-feed {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 150px;
      overflow-y: auto;

      .insight-badge {
        padding: 0.5rem;
        border-radius: 6px;
        font-size: 0.75rem;

        h5 { margin: 0 0 0.25rem 0; font-size: 0.75rem; }
        ul { margin: 0; padding-left: 1rem; }
        li { margin-bottom: 0.15rem; }

        &.objections { background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); h5 { color: #f87171; } }
        &.buying { background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.1); h5 { color: #34d399; } }
      }

      .suggested-questions {
        background: rgba(59, 130, 246, 0.05);
        border: 1px solid rgba(59, 130, 246, 0.1);
        padding: 0.5rem;
        border-radius: 6px;
        font-size: 0.75rem;
        h5 { margin: 0 0 0.25rem 0; color: #60a5fa; }
        ul { margin: 0; padding-left: 1rem; }
      }
    }

    .transcript-feed {
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      padding: 0.5rem;
      min-height: 120px;

      .transcript-title { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem; }
      
      .transcript-scroll {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        max-height: 150px;

        .empty-transcript { font-size: 0.75rem; color: #475569; font-style: italic; padding: 1rem 0; text-align: center; }

        .seg {
          font-size: 0.75rem;
          align-self: flex-start;
          background: rgba(255, 255, 255, 0.03);
          padding: 0.3rem 0.5rem;
          border-radius: 8px 8px 8px 0;
          max-width: 85%;
          line-height: 1.3;

          &.agent {
            align-self: flex-end;
            background: rgba(59, 130, 246, 0.1);
            border-radius: 8px 8px 0 8px;
          }

          .spk { font-size: 0.65rem; font-weight: 700; color: #64748b; margin-right: 0.25rem; }
          .txt { margin: 0; display: inline; }
        }
      }
    }

    .copilot-chat-pane {
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.2);

      .chat-messages {
        height: 80px;
        overflow-y: auto;
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        font-size: 0.75rem;

        .message {
          &.system { color: #64748b; font-style: italic; text-align: center; }
          &.assistant { color: #60a5fa; }
          p { margin: 0.15rem 0 0 0; }
          .sender { font-weight: 700; }
        }
      }

      .chat-input-container {
        display: flex;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        input { flex: 1; background: transparent; border: none; padding: 0.4rem; color: white; font-size: 0.75rem; outline: none; }
        button { color: #3b82f6; }
      }
    }

    /* Animations & utility classes */
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    @keyframes pulseRing { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
    @keyframes pulseRingOut { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(1.6); opacity: 0; } }
    @keyframes pulseSpread { 0% { transform: scale(0.95); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }

    .text-center { text-align: center; }
    .mt-3 { margin-top: 0.75rem; }
    .mt-4 { margin-top: 1rem; }
    .mt-6 { margin-top: 1.5rem; }
    .w-full { width: 100%; }
    .animate-bounce { animation: bounce 1s infinite; }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

    .ai-stream-status-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.6rem;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 500;
      margin-top: 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      
      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #94a3b8;
      }
      .status-label {
        color: #94a3b8;
      }

      &.connected {
        background: rgba(16, 185, 129, 0.08);
        border-color: rgba(16, 185, 129, 0.25);
        .status-dot {
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
          animation: blink 1.5s infinite;
        }
        .status-label { color: #10b981; }
      }

      &.connecting {
        background: rgba(245, 158, 11, 0.08);
        border-color: rgba(245, 158, 11, 0.25);
        .status-dot {
          background: #f59e0b;
          animation: blink 1s infinite;
        }
        .status-label { color: #f59e0b; }
      }

      &.error {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.25);
        .status-dot { background: #ef4444; }
        .status-label { color: #ef4444; }
      }
    }

    /* Light Theme Styles */
    :host-context(body.light-theme) {
      .expanded-panel {
        background: #ffffff;
        border-color: rgba(0, 0, 0, 0.08);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        h3, h2, h4 { color: #0f172a; }
      }

      .panel-header {
        border-bottom-color: rgba(0, 0, 0, 0.06);
        background: rgba(0, 0, 0, 0.01);
        .header-info h3 { color: #64748b; }
      }

      .dialer-input-container {
        border-color: rgba(0, 0, 0, 0.08);
        background: #f8fafc;
        .phone-input { color: #0f172a; }
      }

      .keypad-grid .key-btn {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.05);
        color: #334155;
        &:hover { background: rgba(59, 130, 246, 0.08); color: #2563eb; }
      }

      .options-container ::ng-deep .mdc-label { color: #64748b; }

      .crm-context-card {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.06);
        .contact-card-header h4 { color: #0f172a; }
      }

      .active-call-meta h3 { color: #0f172a; }
      .controls-grid .control-btn {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.05);
        color: #475569;
        &:hover { background: rgba(59, 130, 246, 0.05); }
      }

      .notes-area textarea {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.08);
        color: #334155;
      }

      .form-group {
        .summary-field, .stage-select {
          background: #f8fafc;
          border-color: rgba(0, 0, 0, 0.08);
          color: #334155;
        }
      }

      .tasks-checklist {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.08);
        .task-checkbox-item label {
          color: #334155;
        }
      }

      .draft-card {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.05);
        .draft-preview { color: #475569; }
      }

      /* AI Panel Light Overrides */
      .ai-assist-panel {
        background: #ffffff;
        border-color: rgba(0, 0, 0, 0.08);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        h3 { color: #0f172a; }
      }

      .transcript-feed {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.05);
        .transcript-scroll .seg {
          background: #f1f5f9;
          color: #334155;
          &.agent { background: rgba(59, 130, 246, 0.05); color: #1e3a8a; }
        }
      }

      .copilot-chat-pane {
        background: #f8fafc;
        border-color: rgba(0, 0, 0, 0.05);
        .chat-input-container {
          border-top-color: rgba(0, 0, 0, 0.05);
          input { color: #334155; }
        }
        .chat-messages .message p { color: #334155; }
      }
    }
  `]
})
export class PhoneWidgetComponent implements OnInit {
  readonly callState = inject(CallStateService);
  readonly twilioService = inject(TwilioVoiceService);
  readonly telephonyService = inject(TelephonyService);
  readonly audioService = inject(AudioService);
  readonly notification = inject(NotificationService);
  readonly apiService = inject(ApiService);
  readonly router = inject(Router);
  readonly conversationIntelligence = inject(ConversationIntelligenceService);

  // Widget visual signals
  readonly expanded = signal<boolean>(false);
  readonly currentScreen = signal<'dialer' | 'ringing_out' | 'ringing_in' | 'active' | 'review'>('dialer');

  // Input states
  dialNumber = '';
  aiAssistCheck = false;
  aiAnalysisCheck = false;
  showKeypadInCall = false;
  agentNotes = '';
  chatInput = '';
  loadingChat = signal<boolean>(false);

  // Incoming caller details
  incomingCallerNumber = '';

  // Keypad keys list
  readonly keypadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  // Review screen outputs
  reviewSummary = '';
  reviewDealStage = '';
  readonly savingReview = signal<boolean>(false);
  taskApprovedMap: Record<string, boolean> = {};

  // Ringing indicator helper
  readonly isRinging = computed(() => {
    return this.currentScreen() === 'ringing_out' || this.currentScreen() === 'ringing_in';
  });

  constructor() {
    // Watch for callState.activeCall adjustments from outer clicks
    effect(() => {
      const active = this.callState.activeCall();
      if (active) {
        this.expanded.set(true);
        if (active.dialerOpen) {
          this.currentScreen.set('dialer');
        } else if (active.direction === 'outbound' && active.status === 'queued') {
          this.currentScreen.set('ringing_out');
          this.dialNumber = active.participants[1]?.phone_number || '';
          this.aiAssistCheck = active.ai_assist_enabled;
        } else if (active.direction === 'inbound' && active.status === 'ringing') {
          this.currentScreen.set('ringing_in');
          this.incomingCallerNumber = active.participants[0]?.phone_number || '';
          this.aiAssistCheck = active.ai_assist_enabled;
          this.resolveCallCrmContext(this.incomingCallerNumber);
        } else if (active.status === 'in-progress') {
          this.currentScreen.set('active');
          this.aiAssistCheck = active.ai_assist_enabled;
        }
      }
    });

    // Watch for transcript and trigger Copilot context building if chat is launched
    effect(() => {
      const active = this.callState.activeCall();
      if (active && active.status === 'in-progress' && this.callState.aiAssistEnabled()) {
        // Automatically check/load or create AI Conversation scoped to Call
        if (!this.callState.conversationId() && this.expanded()) {
          this.createCallConversation(active.id);
        }
      }
    });
  }

  ngOnInit(): void {
    // Setup listener for native WebRTC calls
    this.twilioService.initDevice();

    // Auto-transition to review screen on WebRTC disconnection
    this.twilioService.onDisconnectCallback = () => {
      if (this.currentScreen() === 'active' || this.currentScreen() === 'ringing_out') {
        const active = this.callState.activeCall();
        
        // Bypass AI analysis if user turned AI Assist OFF or didn't check AI Analysis
        if (!this.callState.aiAssistEnabled() || !this.aiAnalysisCheck) {
          this.notification.success('Call ended.');
          if (active && this.agentNotes) {
            this.apiService.patch<any>(`/telephony/calls/${active.id}/`, { notes: this.agentNotes }).subscribe();
          }
          this.closeWidget();
          this.router.navigateByUrl('/calls');
          return;
        }

        // Transition to review screen
        this.currentScreen.set('review');
        
        // Save manual notes if typed during call
        if (active && this.agentNotes) {
          this.apiService.patch<any>(`/telephony/calls/${active.id}/`, { notes: this.agentNotes }).subscribe();
        }
      }
    };
  }

  toggleExpand(): void {
    this.expanded.set(true);
  }

  toggleMinimize(): void {
    this.expanded.set(false);
  }

  toggleMute(): void {
    const isMuted = !this.callState.isMuted();
    this.twilioService.toggleMute(isMuted);
  }

  toggleHold(): void {
    const isHeld = !this.callState.isHeld();
    const active = this.callState.activeCall();
    if (active) {
      this.twilioService.toggleHold(isHeld, active.id);
    }
  }

  pressKey(num: string): void {
    this.dialNumber += num;
    this.audioServicePlayTone(num);
  }

  pressInCallKey(num: string): void {
    this.audioServicePlayTone(num);
  }

  private audioServicePlayTone(num: string): void {
    this.audioService.playDtmfTone(num);
  }

  resolveCallCrmContext(phone: string): void {
    this.telephonyService.lookupPhoneNumber(phone).subscribe(context => {
      this.callState.crmContext.set(context);
    });
  }

  placeCall(): void {
    if (!this.dialNumber) return;
    this.callState.resetCallState();
    
    // Resolve matching Contact Context if dialing from Dialpad
    this.telephonyService.lookupPhoneNumber(this.dialNumber).subscribe(context => {
      this.callState.crmContext.set(context);
      
      const payload = {
        phone: this.dialNumber,
        contact_id: context.contact?.id,
        deal_id: context.deals?.length ? context.deals[0].id : undefined,
        ai_assist_enabled: this.aiAssistCheck,
        ai_analysis_enabled: this.aiAnalysisCheck
      };

      this.telephonyService.initiateCall(payload).subscribe({
        next: (call) => {
          this.callState.activeCall.set(call);
          this.callState.aiAssistEnabled.set(this.aiAssistCheck);
          this.currentScreen.set('ringing_out');
          this.twilioService.makeCall(this.dialNumber, call.id);
        },
        error: () => this.notification.error('Failed to initiate Call.')
      });
    });
  }

  cancelCall(): void {
    this.twilioService.hangup();
    this.closeWidget();
  }

  acceptCall(): void {
    const active = this.callState.activeCall();
    if (!active) return;

    this.currentScreen.set('active');
    this.callState.aiAssistEnabled.set(this.aiAssistCheck);
    
    // Sync checkboxes to backend Call record for incoming calls
    this.apiService.patch<any>(`/telephony/calls/${active.id}/`, {
      ai_assist_enabled: this.aiAssistCheck,
      ai_analysis_enabled: this.aiAnalysisCheck
    }).subscribe();

    this.callState.startTimer();
    this.callState.appendTranscriptLine('agent', 'Hello! Thank you for calling. How can I help you today?');
    
    if (this.callState.isSimulated()) {
      // Run mock response timer
      setTimeout(() => {
        this.callState.appendTranscriptLine('contact', 'Hi! I saw your pricing page and wanted to discuss integrations.');
      }, 2500);
    } else {
      this.twilioService.acceptIncomingCall(active.id);
    }
  }

  rejectCall(): void {
    this.twilioService.hangup();
    this.closeWidget();
  }

  endCall(): void {
    const active = this.callState.activeCall();
    if (!active) return;

    this.twilioService.hangup();
    
    // Bypass AI analysis if user turned AI Assist OFF or didn't check AI Analysis
    if (!this.callState.aiAssistEnabled() || !this.aiAnalysisCheck) {
      this.notification.success('Call ended.');
      if (this.agentNotes) {
        this.apiService.patch<any>(`/telephony/calls/${active.id}/`, { notes: this.agentNotes }).subscribe();
      }
      this.closeWidget();
      this.router.navigateByUrl('/calls');
      return;
    }
    
    // Transition to review screen
    this.currentScreen.set('review');
    
    // Set manual notes to call
    if (this.agentNotes) {
      this.apiService.patch<any>(`/telephony/calls/${active.id}/`, { notes: this.agentNotes }).subscribe();
    }

    // Trigger post-call summarization
    const conversationId = this.conversationIntelligence.activeConversationId();
    if (conversationId) {
      this.pollConversationSummary(conversationId);
    } else {
      this.telephonyService.summarizeCall(active.id).subscribe(() => {
        this.pollCallSummary(active.id);
      });
    }
  }

  pollConversationSummary(conversationId: string): void {
    const checkInterval = setInterval(() => {
      this.conversationIntelligence.getConversationDetail(conversationId).subscribe(data => {
        if (data && data.status === 'completed') {
          clearInterval(checkInterval);
          this.callState.suggestions.set(data.summary);
          this.reviewSummary = data.summary?.executive_summary || '';
          this.reviewDealStage = data.summary?.suggested_deal_stage || '';
          
          // Pre-check all suggested tasks
          this.taskApprovedMap = {};
          if (data.summary && data.summary.tasks) {
            data.summary.tasks.forEach((t: any) => {
              this.taskApprovedMap[t.title] = true;
            });
            // Update active call suggested tasks
            const active = this.callState.activeCall();
            if (active) {
              this.callState.activeCall.set({
                ...active,
                suggested_tasks: data.summary.tasks.map((t: any) => ({
                  id: t.title,
                  title: t.title,
                  description: t.description,
                  due_days_offset: t.due_days_offset,
                  priority: t.priority,
                  task_type: t.task_type
                }))
              });
            }
          }
        }
      });
    }, 2000);
  }

  pollCallSummary(callId: string): void {
    // Poll details to fetch generated AI summaries
    const checkInterval = setInterval(() => {
      this.telephonyService.getCallDetail(callId).subscribe(data => {
        if (data && data.summary_status === 'completed') {
          clearInterval(checkInterval);
          this.callState.activeCall.set(data);
          this.callState.suggestions.set(data.summary);
          this.reviewSummary = data.summary?.summary || '';
          this.reviewDealStage = data.summary?.suggested_deal_stage || '';
          
          // Pre-check all suggested tasks
          this.taskApprovedMap = {};
          if (data.suggested_tasks) {
            data.suggested_tasks.forEach((t: any) => {
              this.taskApprovedMap[t.id] = true;
            });
          }
        }
      });
    }, 2000);
  }

  submitReview(): void {
    const active = this.callState.activeCall();
    if (!active) return;

    const conversationId = this.conversationIntelligence.activeConversationId();
    if (conversationId) {
      this.savingReview.set(true);

      const approvedTasks = (this.callState.activeCall()?.suggested_tasks || [])
        .filter((t: any) => this.taskApprovedMap[t.title])
        .map((t: any) => ({
          title: t.title,
          description: t.description,
          due_days_offset: t.due_days_offset,
          priority: t.priority,
          task_type: t.task_type,
          approved: true
        }));

      const reviewPayload = {
        executive_summary: this.reviewSummary,
        conversation_summary: this.callState.suggestions()?.conversation_summary,
        suggested_deal_stage: this.reviewDealStage || null,
        tasks: approvedTasks
      };

      this.conversationIntelligence.confirmReview(conversationId, reviewPayload).subscribe({
        next: () => {
          this.notification.success('Call activity successfully logged!');
          this.savingReview.set(false);
          this.closeWidget();
          this.router.navigateByUrl('/calls');
        },
        error: () => {
          this.notification.error('Failed to log call activity.');
          this.savingReview.set(false);
        }
      });
    } else {
      this.savingReview.set(true);

      // Prepare approved tasks
      const approvedTasks = (active.suggested_tasks || [])
        .filter((t: any) => this.taskApprovedMap[t.id])
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          due_date: t.due_date,
          priority: t.priority,
          task_type: t.task_type
        }));

      const reviewPayload = {
        summary: this.reviewSummary,
        pain_points: this.callState.suggestions()?.pain_points || [],
        next_steps: this.callState.suggestions()?.next_steps || [],
        suggested_deal_stage: this.reviewDealStage || null,
        tasks: approvedTasks
      };

      this.telephonyService.confirmPostCallReview(active.id, reviewPayload).subscribe({
        next: () => {
          this.notification.success('Call activity successfully logged!');
          this.savingReview.set(false);
          this.closeWidget();
          // Route back or refresh views
          this.router.navigateByUrl('/calls');
        },
        error: () => {
          this.notification.error('Failed to log call activity.');
          this.savingReview.set(false);
        }
      });
    }
  }

  closeWidget(): void {
    this.callState.resetCallState();
    this.expanded.set(false);
    this.dialNumber = '';
    this.agentNotes = '';
    this.chatInput = '';
    this.currentScreen.set('dialer');
  }


  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  getHeaderTitle(): string {
    const screen = this.currentScreen();
    if (screen === 'dialer') return 'Softphone Dialer';
    if (screen === 'ringing_out') return 'Calling Outbound';
    if (screen === 'ringing_in') return 'Incoming Call';
    if (screen === 'active') return 'Active Call';
    if (screen === 'review') return 'Post-Call Review';
    return 'Softphone';
  }

  getStreamStatusLabel(): string {
    const status = this.conversationIntelligence.streamStatus();
    if (status === 'connected') return 'Streaming';
    if (status === 'connecting') return 'Connecting...';
    if (status === 'error') return 'Connection Error';
    return 'Offline';
  }

  // AI Copilot Chat actions
  createCallConversation(callId: string): void {
    this.apiService.post<any>('/ai/conversations/', {
      entity_type: 'call',
      entity_id: callId,
      title: 'Active Call AI Assistant'
    }).subscribe(conv => {
      this.callState.conversationId.set(conv.id);
    });
  }

  askCopilot(): void {
    const convId = this.callState.conversationId();
    if (!this.chatInput || !convId) return;

    const query = this.chatInput;
    this.chatInput = '';
    this.callState.appendCopilotMessage('user', query);
    this.loadingChat.set(true);

    this.apiService.post<any>(`/ai/conversations/${convId}/messages/`, {
      message: query
    }).subscribe({
      next: (res) => {
        this.callState.appendCopilotMessage('assistant', res.content);
        this.loadingChat.set(false);
      },
      error: () => {
        this.notification.error('Failed to get answer from Copilot.');
        this.loadingChat.set(false);
      }
    });
  }

  onAssistChange(val: boolean): void {
    if (!val) {
      this.aiAnalysisCheck = false;
    }
  }
}
