import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { ContactStore } from '../services/contact.store';
import { ContactFormComponent } from '../contact-form/contact-form.component';
import { TimelineComponent } from '../../../shared/components/timeline/timeline.component';
import { AIChatPanelComponent } from '../../../shared/components/ai-chat-panel/ai-chat-panel.component';
import { ApiService } from '../../../core/services/api.service';
import { EmailThread, Note, Task } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationService } from '../../../core/services/notification.service';
import { marked } from 'marked';
import { TelephonyService } from '../../telephony/telephony.service';
import { CallStateService } from '../../telephony/call-state.service';
import { TwilioVoiceService } from '../../telephony/twilio-voice.service';
import { SequenceService } from '../../sequences/services/sequence.service';
import { SequenceEnrollDialogComponent } from '../../sequences/sequence-enroll-dialog/sequence-enroll-dialog.component';
import { ContactEmailComposerComponent } from '../contact-email-composer/contact-email-composer.component';

@Component({
  selector: 'app-contact-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TimelineComponent,
    AIChatPanelComponent
  ],
  template: `
    @if (store.loading() && !store.selectedContact()) {
      <div class="loading-state">
        <mat-spinner diameter="48"></mat-spinner>
        <p>Loading contact data...</p>
      </div>
    } @else if (store.selectedContact(); as contact) {
      <div class="detail-layout">
        <!-- Main Info and Tabs Column -->
        <div class="main-column">
          <!-- Profile Card -->
          <div class="contact-profile-card">
            <div class="profile-header">
              <div class="avatar-box">
                <mat-icon class="contact-avatar-icon">person</mat-icon>
              </div>
              <div class="header-details">
                <div class="title-row">
                  <h1>{{ contact.full_name }}</h1>
                  <span class="stage-badge" [ngClass]="contact.stage">{{ getStageLabel(contact.stage) }}</span>
                </div>
                <div class="subtitle-row">
                  <span class="job-title">{{ contact.job_title || 'No Job Title' }}</span>
                  <span class="divider">at</span>
                  <a [routerLink]="['/companies', contact.company]" class="company-link">
                    {{ contact.company_name }}
                  </a>
                </div>
              </div>
              <div class="header-actions">
                <button mat-stroked-button (click)="openEditDialog(contact)" class="edit-btn">
                  <mat-icon>edit</mat-icon>
                  <span>Edit</span>
                </button>
                <button mat-flat-button color="warn" (click)="deleteContact(contact)" class="delete-btn">
                  <mat-icon>delete</mat-icon>
                  <span>Delete</span>
                </button>
              </div>
            </div>

            <!-- Additional Quick Info -->
            <div class="quick-info-grid">
              <div class="info-item" *ngIf="contact.email">
                <mat-icon>email</mat-icon>
                <span>{{ contact.email }}</span>
              </div>
              <div class="info-item phone-item" *ngIf="contact.phone" style="display: flex; align-items: center; gap: 0.5rem;">
                <mat-icon>phone</mat-icon>
                <span>{{ contact.phone }}</span>
                <button mat-icon-button color="primary" class="phone-call-btn" (click)="makeCall(contact)" title="Call contact" style="width: 28px; height: 28px; line-height: 28px; display: flex; align-items: center; justify-content: center;">
                  <mat-icon style="font-size: 16px; width: 16px; height: 16px;">call</mat-icon>
                </button>
              </div>
              <div class="info-item" *ngIf="contact.timezone">
                <mat-icon>schedule</mat-icon>
                <span>{{ contact.timezone }}</span>
              </div>
              <div class="info-item" *ngIf="contact.country">
                <mat-icon>place</mat-icon>
                <span>{{ contact.country }}</span>
              </div>
              <div class="info-item" *ngIf="contact.company_website">
                <mat-icon>language</mat-icon>
                <a [href]="formatExternalUrl(contact.company_website)" target="_blank" rel="noopener noreferrer" class="web-link">
                  {{ contact.company_website }}
                </a>
              </div>
              <div class="info-item" *ngIf="contact.linkedin_url">
                <mat-icon>link</mat-icon>
                <a [href]="formatExternalUrl(contact.linkedin_url)" target="_blank" rel="noopener noreferrer" class="linkedin-link">LinkedIn Profile</a>
              </div>
              <div class="info-item">
                <mat-icon>assignment_ind</mat-icon>
                <span>Owner: {{ contact.owner_detail?.name || 'Unassigned' }}</span>
              </div>
            </div>

            <!-- Action bar for emails sync & sequences -->
            <div class="profile-card-actions" style="display: flex; gap: 0.75rem; justify-content: flex-end;">
              <button mat-stroked-button (click)="openEnrollSequenceDialog(contact)" class="enroll-btn">
                <mat-icon style="color: #60a5fa;">auto_awesome</mat-icon>
                <span>Enroll in Sequence</span>
              </button>
              <button mat-stroked-button (click)="syncEmails(contact.id)" class="sync-email-btn" [disabled]="syncingEmails()">
                @if (syncingEmails()) {
                  <mat-spinner diameter="18" style="display: inline-block; margin-right: 6px;"></mat-spinner>
                  <span>Syncing...</span>
                } @else {
                  <mat-icon>sync</mat-icon>
                  <span>Sync Emails</span>
                }
              </button>
            </div>
          </div>

          <!-- Bottom Tabs Panel -->
          <mat-tab-group class="dark-tabs">
            <!-- Timeline Tab -->
            <mat-tab label="Timeline">
              <div class="tab-content">
                <app-timeline [contactId]="contact.id"></app-timeline>
              </div>
            </mat-tab>

            <!-- Tasks Tab -->
            <mat-tab label="Tasks">
              <div class="tab-content">
                <div class="tab-section-header">
                  <h3>Tasks</h3>
                  <button mat-button color="primary" (click)="openAddTask()">
                    <mat-icon>add</mat-icon> Add Task
                  </button>
                </div>

                <div class="tasks-list">
                  @for (t of tasks(); track t.id) {
                    <div class="task-item" [ngClass]="{ 'completed': t.status === 'completed' }">
                      <button class="checkbox-btn" (click)="toggleTaskComplete(t)">
                        <mat-icon>{{ t.status === 'completed' ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
                      </button>
                      <div class="task-details">
                        <div class="task-title">{{ t.title }}</div>
                        <div class="task-meta">
                          @if (t.due_date) {
                            <span class="task-due" [ngClass]="{ 'overdue': t.is_overdue }">
                              Due: {{ t.due_date | date:'dd/MM/yyyy' }}
                            </span>
                          }
                          <span class="task-priority" [ngClass]="t.priority">Priority: {{ t.priority }}</span>
                        </div>
                      </div>
                    </div>
                  }
                  @if (tasks().length === 0) {
                    <div class="tab-empty-state">
                      <mat-icon>assignment_turned_in</mat-icon>
                      <p>All clean! No tasks currently pending.</p>
                    </div>
                  }
                </div>
              </div>
            </mat-tab>

            <!-- Notes Tab -->
            <mat-tab label="Notes">
              <div class="tab-content">
                <div class="tab-section-header">
                  <h3>Rich Notes</h3>
                </div>

                <form [formGroup]="noteForm" (ngSubmit)="saveNote()" class="note-editor">
                  <textarea formControlName="content" placeholder="Write a markdown note (Ctrl+Enter to save)..." rows="3" class="note-textarea"></textarea>
                  <div class="note-editor-actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="noteForm.invalid">
                      Save Note
                    </button>
                  </div>
                </form>

                <div class="notes-feed">
                  @for (n of notes(); track n.id) {
                    <div class="note-card">
                      <div class="note-header">
                        <div class="note-meta-info">
                          <span class="note-author">{{ n.created_by?.name || 'User' }}</span>
                          <span class="divider">·</span>
                          <span class="note-time">{{ n.created_at | date:'short' }}</span>
                        </div>
                        <button mat-icon-button (click)="deleteNote(n.id)" class="delete-note-btn" matTooltip="Delete Note">
                          <mat-icon style="font-size: 16px; width: 16px; height: 16px; color: #94a3b8;">delete</mat-icon>
                        </button>
                      </div>
                      <div class="note-body" [innerHTML]="renderMarkdown(n.content)"></div>
                    </div>
                  }
                </div>
              </div>
            </mat-tab>

            <!-- Emails Tab -->
            <mat-tab label="Emails">
              <div class="tab-content">
                <div class="tab-section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <mat-icon style="color: #60a5fa;">email</mat-icon>
                    <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #f8fafc;">Email Threads</h3>
                  </div>
                  <div style="display: flex; gap: 0.5rem;">
                    <button type="button" (click)="openEmailComposer(undefined, 'Draft follow-up outreach email for ' + contact.full_name)" class="ai-email-action-btn">
                      <mat-icon style="font-size: 16px; width: 16px; height: 16px;">auto_awesome</mat-icon>
                      <span>Generate AI Email</span>
                    </button>
                    <button type="button" (click)="openEmailComposer()" class="custom-email-action-btn">
                      <mat-icon style="font-size: 16px; width: 16px; height: 16px;">edit</mat-icon>
                      <span>Compose Custom</span>
                    </button>
                  </div>
                </div>

                <div class="email-threads-list" style="display: flex; flex-direction: column; gap: 1rem;">
                  @for (t of emailThreads(); track t.id) {
                    <div class="thread-card">
                      <!-- Card Header with Direction Badge and Subject -->
                      <div class="thread-card-header">
                        <div class="thread-title-area">
                          <span class="direction-badge" [ngClass]="getThreadDirection(t)">
                            <mat-icon style="font-size: 14px; width: 14px; height: 14px; vertical-align: middle; margin-right: 2px;">
                              {{ getThreadDirection(t) === 'incoming' ? 'call_received' : 'send' }}
                            </mat-icon>
                            {{ getThreadDirection(t) === 'incoming' ? 'Received' : 'Sent' }}
                          </span>
                          <h4 class="thread-subject-title">{{ t.subject || '(No Subject)' }}</h4>
                        </div>

                        <!-- Telemetry Stats Bar -->
                        <div class="thread-telemetry">
                          <span title="Opens count" class="telemetry-item opens">
                            <mat-icon class="telemetry-icon">visibility</mat-icon> {{ t.open_count || 0 }}
                          </span>
                          <span title="Clicks count" class="telemetry-item clicks">
                            <mat-icon class="telemetry-icon">touch_app</mat-icon> {{ t.click_count || 0 }}
                          </span>
                          <span title="Replied status" class="telemetry-item replied" [class.has-replied]="t.has_replied">
                            <mat-icon class="telemetry-icon">{{ t.has_replied ? 'reply_all' : 'mark_email_read' }}</mat-icon>
                            {{ t.has_replied ? 'Replied' : 'Sent' }}
                          </span>
                        </div>
                      </div>

                      <div class="thread-meta-row">
                        <span class="meta-participants"><strong>Participants:</strong> {{ t.participants.join(', ') || 'N/A' }}</span>
                        <span class="meta-date">{{ t.last_message_time | date:'medium' }}</span>
                      </div>

                      <!-- Email Description Glimpse -->
                      <p class="thread-glimpse-desc" [innerHTML]="formatTextWithLinks(t.snippet || (t.messages && t.messages.length ? t.messages[t.messages.length - 1].plain_text_body : ''))"></p>

                      <!-- Thread Action Bar -->
                      <div class="thread-action-bar">
                        <button type="button" (click)="viewEmailConversation(t.id)" class="thread-action-view-btn">
                          <mat-icon style="font-size: 15px; width: 15px; height: 15px;">chat</mat-icon>
                          <span>View Full Conversation</span>
                        </button>

                        <div class="reply-action-group">
                          <button type="button" (click)="openEmailComposer(t, 'Reply to thread regarding ' + t.subject)" class="thread-action-ai-btn">
                            <mat-icon style="font-size: 15px; width: 15px; height: 15px;">auto_fix_high</mat-icon>
                            <span>Reply with AI</span>
                          </button>
                          <button type="button" (click)="openEmailComposer(t)" class="thread-action-reply-btn">
                            <mat-icon style="font-size: 15px; width: 15px; height: 15px;">reply</mat-icon>
                            <span>Reply</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  }

                  @if (emailThreads().length === 0) {
                    <div class="tab-empty-state">
                      <mat-icon style="font-size: 32px; width: 32px; height: 32px; color: #64748b;">mail_outline</mat-icon>
                      <p>No email threads found for this contact yet. Click 'Generate AI Email' above or 'Sync Emails' to fetch your inbox.</p>
                    </div>
                  }
                </div>
              </div>
            </mat-tab>
          </mat-tab-group>
        </div>

        <!-- Sidebar / AI Intelligence Column -->
        <div class="sidebar-column">
          <!-- AI Assistant Summary -->
          <div class="intel-card" *ngIf="contact.ai_summary">
            <div class="card-header">
              <mat-icon class="intel-icon">psychology</mat-icon>
              <span>AI Rep Summary</span>
            </div>
            <div class="intel-body">
              <p class="summary-text">{{ contact.ai_summary }}</p>
            </div>
          </div>

          <!-- Chat panel -->
          <app-ai-chat-panel [entityType]="'contact'" [entityId]="contact.id" class="sidebar-chat"></app-ai-chat-panel>
        </div>
      </div>
    }
  `,
  styles: [`
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 60vh;
      color: #64748b;
      gap: 1rem;
    }

    .detail-layout {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 1.5rem;
      height: 100%;
      align-items: start;
    }

    .main-column {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      min-width: 0;
    }

    .contact-profile-card {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
    }

    .profile-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      padding-bottom: 1rem;
    }

    .avatar-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background-color: rgba(16, 185, 129, 0.1);
      border-radius: 50%;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .contact-avatar-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #10b981;
    }

    .header-details {
      flex: 1;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
      letter-spacing: -0.025em;
    }

    .subtitle-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #64748b;
      font-size: 0.85rem;
      margin-top: 0.25rem;
    }

    .company-link {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 500;
    }

    .company-link:hover {
      text-decoration: underline;
    }

    .divider {
      color: #334155;
    }

    .edit-btn {
      color: #94a3b8 !important;
      border-color: rgba(255, 255, 255, 0.08) !important;
    }

    .edit-btn:hover {
      background: rgba(255, 255, 255, 0.03) !important;
      color: #f8fafc !important;
    }

    .delete-btn {
      background-color: #ef4444 !important;
      color: #ffffff !important;
      border-radius: 6px;
      margin-left: 0.5rem;
    }

    .delete-btn:hover {
      background-color: #dc2626 !important;
    }

    .stage-badge {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    .stage-badge.cold { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .stage-badge.approaching { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .stage-badge.replied { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .stage-badge.follow_up { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .stage-badge.interested { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .stage-badge.not_icp { background: rgba(100, 116, 139, 0.15); color: #94a3b8; }
    .stage-badge.not_interested { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .stage-badge.unresponsive { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
    .stage-badge.do_not_contact { background: rgba(220, 38, 38, 0.2); color: #ef4444; }
    .stage-badge.bad_data { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .stage-badge.changed_job { background: rgba(156, 163, 175, 0.15); color: #d1d5db; }
    .stage-badge.won { background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 700; }

    .quick-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .info-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #cbd5e1;
      font-size: 0.85rem;
    }

    .info-item mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #64748b;
    }

    .linkedin-link {
      color: #60a5fa;
      text-decoration: none;
    }

    .linkedin-link:hover {
      text-decoration: underline;
    }

    /* Dark tabs */
    .dark-tabs {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
    }

    ::ng-deep .dark-tabs .mat-mdc-tab-header {
      background-color: #0b1329 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    }

    ::ng-deep .dark-tabs .mat-mdc-tab {
      color: #64748b !important;
      font-weight: 600 !important;
    }

    ::ng-deep .dark-tabs .mat-mdc-tab.mdc-tab--active {
      color: #3b82f6 !important;
    }

    ::ng-deep .dark-tabs .mdc-tab-indicator__active-indicator {
      border-color: #3b82f6 !important;
    }

    .tab-content {
      padding: 1.5rem;
      min-height: 240px;
    }

    .tab-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .tab-section-header h3 {
      font-size: 1rem;
      font-weight: 600;
      color: #f8fafc;
      margin: 0;
    }

    .tab-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      color: #475569;
      text-align: center;
    }

    .tab-empty-state mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 0.5rem;
    }

    /* Tasks List */
    .tasks-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .task-item {
      display: flex;
      align-items: center;
      padding: 0.6rem 0.75rem;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 6px;
    }

    .task-item.completed {
      opacity: 0.5;
    }

    .checkbox-btn {
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      padding: 0;
      margin-right: 0.75rem;
      display: flex;
      align-items: center;
    }

    .task-item.completed .checkbox-btn {
      color: #10b981;
    }

    .task-details {
      flex: 1;
    }

    .task-title {
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .task-item.completed .task-title {
      text-decoration: line-through;
    }

    .task-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .task-due.overdue {
      color: #ef4444;
      font-weight: 600;
    }

    .task-priority.high { color: #f59e0b; }
    .task-priority.urgent { color: #ef4444; font-weight: 600; }

    /* Notes Area */
    .note-editor {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .note-textarea {
      background-color: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      color: #f8fafc;
      padding: 0.75rem;
      font-size: 0.85rem;
      font-family: inherit;
      resize: vertical;
      outline: none;
    }

    .note-textarea:focus {
      border-color: #3b82f6;
    }

    .note-editor-actions {
      display: flex;
      justify-content: flex-end;
    }

    .notes-feed {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .note-card {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 1rem;
    }

    .note-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }

    .ai-email-action-btn {
      background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.45rem 0.85rem;
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s;
    }
    .ai-email-action-btn:hover { opacity: 0.9; }

    .custom-email-action-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      border-radius: 6px;
      padding: 0.45rem 0.85rem;
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .custom-email-action-btn:hover { background: rgba(255, 255, 255, 0.05); color: #ffffff; }

    .thread-action-ai-btn {
      background: rgba(192, 132, 252, 0.1);
      border: 1px solid rgba(192, 132, 252, 0.25);
      color: #c084fc;
      border-radius: 6px;
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .thread-action-ai-btn:hover { background: rgba(192, 132, 252, 0.2); }

    .thread-action-reply-btn {
      background: rgba(96, 165, 250, 0.1);
      border: 1px solid rgba(96, 165, 250, 0.25);
      color: #60a5fa;
      border-radius: 6px;
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .thread-action-reply-btn:hover { background: rgba(96, 165, 250, 0.2); }

    .thread-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .thread-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .thread-title-area {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex: 1;
      min-width: 200px;
    }

    .direction-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      letter-spacing: 0.04em;
    }
    .direction-badge.outgoing { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .direction-badge.incoming { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }

    .thread-subject-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .thread-telemetry {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(0, 0, 0, 0.25);
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .telemetry-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .telemetry-item.opens { color: #60a5fa; }
    .telemetry-item.clicks { color: #a78bfa; }
    .telemetry-item.replied { color: #64748b; }
    .telemetry-item.replied.has-replied { color: #34d399; }
    .telemetry-icon { font-size: 15px; width: 15px; height: 15px; }

    .thread-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: #64748b;
    }

    .thread-glimpse-desc {
      font-size: 0.83rem;
      color: #cbd5e1;
      margin: 0;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      background: rgba(0, 0, 0, 0.15);
      padding: 0.6rem 0.75rem;
      border-radius: 6px;
      border-left: 3px solid #3b82f6;
    }

    .thread-action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      padding-top: 0.6rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .reply-action-group {
      display: flex;
      gap: 0.5rem;
    }

    .thread-action-view-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      border-radius: 6px;
      padding: 0.38rem 0.75rem;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s;
    }
    .thread-action-view-btn:hover { background: rgba(255, 255, 255, 0.08); color: #ffffff; }

    .note-meta-info {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .delete-note-btn {
      width: 24px !important;
      height: 24px !important;
      line-height: 24px !important;
      padding: 0 !important;
    }

    .note-author {
      font-weight: 600;
      color: #cbd5e1;
    }

    .note-body {
      font-size: 0.85rem;
      line-height: 1.5;
      color: #cbd5e1;
    }

    /* Sidebar Column */
    .sidebar-column {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      height: calc(100vh - 110px);
    }

    .intel-card {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .intel-card .card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background-color: #0b1329;
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .intel-icon {
      color: #10b981;
    }

    .intel-body {
      padding: 1rem;
      max-height: 350px;
      overflow-y: auto;
    }

    .summary-text {
      font-size: 0.85rem;
      line-height: 1.5;
      color: #cbd5e1;
      margin: 0;
    }

    .sidebar-chat {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 320px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .profile-card-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 1.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 1rem;
    }

    :host-context(body.light-theme) .profile-card-actions {
      border-top-color: rgba(0, 0, 0, 0.06);
    }
  `]
})
export class ContactDetailComponent implements OnInit {
  readonly store = inject(ContactStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly telephonyService = inject(TelephonyService);
  private readonly callState = inject(CallStateService);
  private readonly twilioService = inject(TwilioVoiceService);

  private readonly sequenceService = inject(SequenceService);

  readonly tasks = signal<Task[]>([]);
  readonly notes = signal<Note[]>([]);
  readonly emailThreads = signal<EmailThread[]>([]);

  getThreadDirection(thread: EmailThread): string {
    if (thread.messages && thread.messages.length > 0) {
      const lastMsg = thread.messages[thread.messages.length - 1];
      return lastMsg.direction || 'outgoing';
    }
    return 'outgoing';
  }

  formatTextWithLinks(text: string | undefined): string {
    if (!text) return '';
    const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
    let html = text.replace(urlPattern, (url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline;">${url}</a>`;
    });
    return html.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]+)"([^>]*)>/gi, (match, href, rest) => {
      if (!rest.includes('target=')) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`;
      }
      return match.replace(/target="[^"]*"/gi, 'target="_blank" rel="noopener noreferrer"');
    });
  }

  openEnrollSequenceDialog(contact: any): void {
    this.dialog.open(SequenceEnrollDialogComponent, {
      width: '500px',
      data: {
        contactId: contact.id,
        contactName: contact.full_name
      }
    });
  }

  openEmailComposer(thread?: EmailThread, initialPrompt?: string): void {
    const contact = this.store.selectedContact();
    if (!contact) return;

    const ref = this.dialog.open(ContactEmailComposerComponent, {
      width: '640px',
      data: {
        contact,
        thread,
        initialPrompt
      },
      panelClass: 'dark-dialog-panel'
    });

    ref.afterClosed().subscribe((sentEmail) => {
      if (sentEmail) {
        const id = contact.id;
        this.loadLinkedData(id);
      }
    });
  }

  viewEmailConversation(threadId: string): void {
    if (!threadId) return;

    import('../../../shared/components/timeline/email-conversation-dialog.component').then((m) => {
      const ref = this.dialog.open(m.EmailConversationDialogComponent, {
        width: '750px',
        maxHeight: '90vh',
        data: { threadId },
        panelClass: 'dark-dialog-panel'
      });

      ref.afterClosed().subscribe((res) => {
        if (res && res.action === 'reply' && res.thread) {
          const prompt = res.isAI ? `Reply to email thread regarding ${res.thread.subject}` : undefined;
          this.openEmailComposer(res.thread, prompt);
        }
      });
    });
  }

  readonly noteForm: FormGroup = this.fb.group({
    content: ['', [Validators.required]]
  });

  readonly syncingEmails = signal(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.store.loadContact(id);
        this.loadLinkedData(id);
        this.syncEmails(id, true);
      }
    });
  }

  formatExternalUrl(url: string | undefined): string {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://${url}`;
  }

  makeCall(contact: any): void {
    if (!contact.phone) {
      this.notification.error('This contact has no phone number.');
      return;
    }

    this.callState.resetCallState();
    this.twilioService.initDevice();

    this.telephonyService.initiateCall({
      phone: contact.phone,
      contact_id: contact.id,
      ai_assist_enabled: true
    }).subscribe({
      next: (call) => {
        this.callState.activeCall.set(call);
        this.twilioService.makeCall(contact.phone, call.id);
      },
      error: () => this.notification.error('Failed to initiate Call.')
    });
  }

  private loadLinkedData(contactId: string): void {
    // Load linked tasks
    this.apiService.get<any>('/tasks/', { contact: contactId, status: 'pending' }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.tasks.set(data);
      }
    });

    // Load linked notes
    this.apiService.get<any>('/notes/', { contact: contactId }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.notes.set(data);
      }
    });

    // Load email threads & telemetry
    this.loadEmailThreads(contactId);
  }

  loadEmailThreads(contactId: string): void {
    this.apiService.get<any>('/emails/contact-threads/', { contact_id: contactId }).subscribe({
      next: (threads) => {
        this.emailThreads.set(Array.isArray(threads) ? threads : []);
      }
    });
  }

  openEditDialog(contact: any): void {
    this.dialog.open(ContactFormComponent, {
      width: '560px',
      data: contact,
      panelClass: 'dark-dialog-panel'
    });
  }

  deleteContact(contact: any): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Contact',
        message: `Are you sure you want to delete the contact "${contact.first_name} ${contact.last_name}"? This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.deleteContact(contact.id, () => {
          this.router.navigate(['/contacts']);
        });
      }
    });
  }

  deleteNote(noteId: string): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Delete Note',
        message: 'Are you sure you want to delete this note?',
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.apiService.delete(`/notes/${noteId}/`).subscribe({
          next: () => {
            this.notification.success('Note deleted successfully');
            // Refresh notes
            const id = this.route.snapshot.paramMap.get('id');
            if (id) {
              this.loadLinkedData(id);
            }
          },
          error: () => {
            this.notification.error('Failed to delete note');
          }
        });
      }
    });
  }

  getStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      cold: 'Cold',
      approaching: 'Approaching',
      replied: 'Replied',
      follow_up: 'Follow Up',
      interested: 'Interested',
      not_icp: 'Not ICP',
      not_interested: 'Not Interested',
      unresponsive: 'Unresponsive',
      do_not_contact: 'DNC',
      bad_data: 'Bad Data',
      changed_job: 'Job Changed',
      won: 'Won'
    };
    return labels[stage] || stage;
  }

  openAddTask(): void {
    import('../../tasks/task-form/task-form.component').then((m) => {
      const ref = this.dialog.open(m.TaskFormComponent, {
        width: '560px',
        data: { contact: this.store.selectedContact()?.id, company: this.store.selectedContact()?.company },
        panelClass: 'dark-dialog-panel'
      });
      ref.afterClosed().subscribe(() => {
        const id = this.store.selectedContact()?.id;
        if (id) this.loadLinkedData(id);
      });
    });
  }

  toggleTaskComplete(task: Task): void {
    this.apiService.post<Task>(`/tasks/${task.id}/complete/`, {}).subscribe({
      next: () => {
        this.notification.success('Task completed');
        const id = this.store.selectedContact()?.id;
        if (id) this.loadLinkedData(id);
      },
      error: () => this.notification.error('Failed to complete task')
    });
  }

  saveNote(): void {
    if (this.noteForm.invalid) return;
    const content = this.noteForm.value.content;
    const contactId = this.store.selectedContact()?.id;
    const companyId = this.store.selectedContact()?.company;

    this.apiService.post<Note>('/notes/', {
      content,
      contact: contactId,
      company: companyId
    }).subscribe({
      next: (newNote) => {
        this.notes.update((ns) => [newNote, ...ns]);
        this.noteForm.reset();
        this.notification.success('Note added');
      },
      error: () => this.notification.error('Failed to save note')
    });
  }

  renderMarkdown(content: string): string {
    if (!content) return '';
    let html = marked.parse(content) as string;
    return html.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]+)"([^>]*)>/gi, (match, href, rest) => {
      if (!rest.includes('target=')) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`;
      }
      return match.replace(/target="[^"]*"/gi, 'target="_blank" rel="noopener noreferrer"');
    });
  }

  syncEmails(contactId: string, isAutosync = false): void {
    if (!contactId) return;
    if (!isAutosync) {
      this.syncingEmails.set(true);
    }
    this.apiService.post<any>('/emails/sync/', { contact_id: contactId }).subscribe({
      next: (res) => {
        if (res.status === 'syncing') {
          if (!isAutosync) {
            this.notification.success('Email synchronization started in the background.');
            setTimeout(() => {
              this.syncingEmails.set(false);
              this.store.loadContact(contactId);
              this.loadLinkedData(contactId);
            }, 4000);
          }
        } else {
          this.syncingEmails.set(false);
          if (!isAutosync) {
            this.notification.error('Please integrate Gmail.');
          }
        }
      },
      error: (err) => {
        this.syncingEmails.set(false);
        if (!isAutosync) {
          const errMsg = err.error?.message || 'Please integrate Gmail';
          this.notification.error(errMsg);
        }
      }
    });
  }
}
