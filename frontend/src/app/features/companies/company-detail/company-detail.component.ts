import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { CompanyStore } from '../services/company.store';
import { CompanyFormComponent } from '../company-form/company-form.component';
import { TimelineComponent } from '../../../shared/components/timeline/timeline.component';
import { AIChatPanelComponent } from '../../../shared/components/ai-chat-panel/ai-chat-panel.component';
import { ApiService } from '../../../core/services/api.service';
import { Company, Contact, Deal, Note, Task } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationService } from '../../../core/services/notification.service';
import { marked } from 'marked';

@Component({
  selector: 'app-company-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    TimelineComponent,
    AIChatPanelComponent
  ],
  template: `
    @if (store.loading() && !store.selectedCompany()) {
      <div class="loading-state">
        <mat-spinner diameter="48"></mat-spinner>
        <p>Loading company data...</p>
      </div>
    } @else if (store.selectedCompany(); as company) {
      <div class="detail-layout">
        <!-- Main Info and Tabs Column -->
        <div class="main-column">
          <!-- Profile Header -->
          <div class="company-profile-card">
            <div class="profile-header">
              <div class="avatar-box">
                <mat-icon class="company-avatar-icon">business</mat-icon>
              </div>
              <div class="header-details">
                <div class="title-row">
                  <h1>{{ company.name }}</h1>
                  <span class="stage-badge" [ngClass]="company.stage">{{ getStageLabel(company.stage) }}</span>
                </div>
                <div class="subtitle-row">
                  <a *ngIf="company.website" [href]="formatExternalUrl(company.website)" target="_blank" class="web-link">
                    <mat-icon>link</mat-icon>
                    <span>{{ company.website }}</span>
                  </a>
                  <span *ngIf="company.website && company.linkedin_url" class="divider">·</span>
                  <a *ngIf="company.linkedin_url" [href]="formatExternalUrl(company.linkedin_url)" target="_blank" class="web-link linkedin-link">
                    <mat-icon>share</mat-icon>
                    <span>LinkedIn</span>
                  </a>
                  <span *ngIf="company.industry" class="divider">·</span>
                  <span *ngIf="company.industry">{{ company.industry }}</span>
                  <span *ngIf="company.company_size" class="divider">·</span>
                  <span *ngIf="company.company_size">{{ company.company_size }} Employees</span>
                </div>
              </div>
              <div class="header-actions">
                <button mat-stroked-button (click)="openEditDialog(company)" class="edit-btn">
                  <mat-icon>edit</mat-icon>
                  <span>Edit</span>
                </button>
                <button mat-flat-button color="warn" (click)="deleteCompany(company)" class="delete-btn">
                  <mat-icon>delete</mat-icon>
                  <span>Delete</span>
                </button>
              </div>
            </div>
            
            <p class="description" *ngIf="company.description">{{ company.description }}</p>

            <!-- Action bar for emails sync -->
            <div class="profile-card-actions">
              <button mat-stroked-button (click)="syncEmails(company.id)" class="sync-email-btn" [disabled]="syncingEmails()">
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
                <app-timeline [companyId]="company.id"></app-timeline>
              </div>
            </mat-tab>

            <!-- Contacts Tab -->
            <mat-tab label="Contacts">
              <div class="tab-content">
                <div class="tab-section-header">
                  <h3>Contacts ({{ contacts().length }})</h3>
                  <button mat-button color="primary" (click)="openCreateContact()">
                    <mat-icon>add</mat-icon> Add Contact
                  </button>
                </div>
                
                <div class="contacts-grid">
                  @for (c of contacts(); track c.id) {
                    <div class="contact-card" [routerLink]="['/contacts', c.id]">
                      <div class="contact-avatar">
                        <mat-icon>person</mat-icon>
                      </div>
                      <div class="contact-info">
                        <div class="contact-name">{{ c.full_name }}</div>
                        <div class="contact-title">{{ c.job_title || 'No title' }}</div>
                        <div class="contact-email" *ngIf="c.email">
                          <mat-icon>email</mat-icon> <span>{{ c.email }}</span>
                        </div>
                      </div>
                      <mat-icon class="card-arrow">chevron_right</mat-icon>
                    </div>
                  }
                  @if (contacts().length === 0) {
                    <div class="tab-empty-state">
                      <mat-icon>people_outline</mat-icon>
                      <p>No contacts linked to this company yet.</p>
                    </div>
                  }
                </div>
              </div>
            </mat-tab>

            <!-- Deals Tab -->
            <mat-tab label="Deals">
              <div class="tab-content">
                <div class="tab-section-header">
                  <h3>Deals ({{ deals().length }})</h3>
                  <button mat-button color="primary" (click)="openCreateDeal()">
                    <mat-icon>add</mat-icon> Add Deal
                  </button>
                </div>

                <div class="deals-list">
                  @for (d of deals(); track d.id) {
                    <div class="deal-item" [routerLink]="['/deals', d.id]">
                      <mat-icon class="deal-icon">monetization_on</mat-icon>
                      <div class="deal-details">
                        <div class="deal-name">{{ d.name }}</div>
                        <div class="deal-meta">
                          <span class="deal-stage">{{ d.stage | titlecase }}</span>
                          <span class="divider">·</span>
                          <span class="deal-prob">Prob: {{ d.probability || 0 }}%</span>
                        </div>
                      </div>
                      <div class="deal-revenue" *ngIf="d.expected_revenue">
                        \${{ d.expected_revenue | number:'1.2-2' }}
                      </div>
                      <mat-icon class="card-arrow">chevron_right</mat-icon>
                    </div>
                  }
                  @if (deals().length === 0) {
                    <div class="tab-empty-state">
                      <mat-icon>monetization_on</mat-icon>
                      <p>No deals registered for this company yet.</p>
                    </div>
                  }
                </div>
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
          </mat-tab-group>
        </div>

        <!-- Sidebar / AI Intelligence Column -->
        <div class="sidebar-column">
          <!-- ICP Score & Research Summary Panel -->
          <div class="intel-card">
            <div class="card-header">
              <mat-icon class="intel-icon">insights</mat-icon>
              <span>Radar 36 Intelligence</span>
            </div>

            <div class="intel-body">
              <!-- Score Widget -->
              <div class="icp-score-widget">
                <div class="score-ring" [ngClass]="getIcpClass(company.icp_score || 0)">
                  <span class="score-value">{{ company.icp_score !== null && company.icp_score !== undefined ? company.icp_score : '—' }}</span>
                  <span class="score-label">ICP Score</span>
                </div>
                <button mat-stroked-button color="accent" (click)="triggerResearch()" class="research-btn">
                  <mat-icon>refresh</mat-icon>
                  <span>Re-run AI Analysis</span>
                </button>
              </div>

              @if (store.research(); as res) {
                @if (res.research_status === 'in_progress') {
                  <div class="research-status-loader">
                    <mat-spinner diameter="20"></mat-spinner>
                    <span>AI research in progress...</span>
                  </div>
                } @else if (res.research_status === 'completed') {
                  <!-- Business summary -->
                  <div class="intel-section">
                    <h4>Business Summary</h4>
                    <p>{{ res.business_summary }}</p>
                  </div>

                  <!-- Pain Points -->
                  <div class="intel-section" *ngIf="res.pain_points.length > 0">
                    <h4>Identified Pain Points</h4>
                    <mat-chip-set>
                      @for (p of res.pain_points; track p) {
                        <mat-chip class="red-chip">{{ p }}</mat-chip>
                      }
                    </mat-chip-set>
                  </div>

                  <!-- Buying Signals -->
                  <div class="intel-section" *ngIf="res.buying_signals.length > 0">
                    <h4>Buying Signals</h4>
                    <mat-chip-set>
                      @for (s of res.buying_signals; track s) {
                        <mat-chip class="green-chip">{{ s }}</mat-chip>
                      }
                    </mat-chip-set>
                  </div>

                  <!-- Why Radar 36 Fits -->
                  <div class="intel-section" *ngIf="res.why_radar36_fits">
                    <h4>Why Radar 36 Fits</h4>
                    <p>{{ res.why_radar36_fits }}</p>
                  </div>

                  <!-- Objections -->
                  <div class="intel-section" *ngIf="res.potential_objections.length > 0">
                    <h4>Likely Objections</h4>
                    <mat-chip-set>
                      @for (o of res.potential_objections; track o) {
                        <mat-chip class="gray-chip">{{ o }}</mat-chip>
                      }
                    </mat-chip-set>
                  </div>

                  <!-- Tech stack -->
                  <div class="intel-section" *ngIf="res.technology_stack.length > 0">
                    <h4>Technology Stack</h4>
                    <mat-chip-set>
                      @for (t of res.technology_stack; track t) {
                        <mat-chip class="blue-chip">{{ t }}</mat-chip>
                      }
                    </mat-chip-set>
                  </div>
                }
              } @else {
                <div class="no-intel-state">
                  <mat-icon>psychology</mat-icon>
                  <p>No AI analysis results available for this company.</p>
                  <button mat-flat-button color="primary" (click)="triggerResearch()">
                    Run AI Research
                  </button>
                </div>
              }
            </div>
          </div>

          <!-- Chat panel -->
          <app-ai-chat-panel [entityType]="'company'" [entityId]="company.id" class="sidebar-chat"></app-ai-chat-panel>
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

    .company-profile-card {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
    }

    .profile-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .avatar-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background-color: rgba(59, 130, 246, 0.1);
      border-radius: 8px;
      border: 1px solid rgba(59, 130, 246, 0.2);
    }

    .company-avatar-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #3b82f6;
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
      flex-wrap: wrap;
    }

    .web-link {
      display: flex;
      align-items: center;
      gap: 0.2rem;
      color: #3b82f6;
      text-decoration: none;
    }

    .web-link:hover {
      text-decoration: underline;
    }

    .web-link mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
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

    .description {
      font-size: 0.9rem;
      color: #cbd5e1;
      margin: 0;
      line-height: 1.6;
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
    .stage-badge.active_opportunity { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .stage-badge.current_client { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .stage-badge.dead_opportunity { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .stage-badge.do_not_prospect { background: rgba(220, 38, 38, 0.2); color: #ef4444; }

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

    .tab-empty-state p {
      font-size: 0.85rem;
    }

    /* Contacts Grid */
    .contacts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .contact-card {
      display: flex;
      align-items: center;
      padding: 0.85rem;
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .contact-card:hover {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .contact-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.05);
      color: #94a3b8;
      margin-right: 0.75rem;
    }

    .contact-info {
      flex: 1;
      overflow: hidden;
    }

    .contact-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .contact-title {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .contact-email {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: #475569;
      margin-top: 0.25rem;
    }

    .contact-email mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .card-arrow {
      color: #475569;
    }

    /* Deals List */
    .deals-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .deal-item {
      display: flex;
      align-items: center;
      padding: 0.85rem;
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .deal-item:hover {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .deal-icon {
      color: #fbbf24;
      margin-right: 0.75rem;
    }

    .deal-details {
      flex: 1;
    }

    .deal-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .deal-meta {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .deal-revenue {
      font-weight: 700;
      color: #f8fafc;
      font-size: 0.9rem;
      margin-right: 1rem;
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
      color: #a78bfa;
    }

    .intel-body {
      padding: 1.25rem;
      max-height: 350px;
      overflow-y: auto;
    }

    .icp-score-widget {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 0.75rem;
      margin-bottom: 1.25rem;
    }

    .score-ring {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.05);
    }

    .score-ring.high { border-color: #10b981; color: #34d399; }
    .score-ring.medium { border-color: #f59e0b; color: #fbbf24; }
    .score-ring.low { border-color: #ef4444; color: #f87171; }

    .score-value {
      font-size: 1.25rem;
      font-weight: 800;
    }

    .score-label {
      font-size: 0.55rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.7;
    }

    .research-btn {
      color: #cbd5e1 !important;
      border-color: rgba(255, 255, 255, 0.08) !important;
      font-size: 0.75rem !important;
      height: 32px !important;
    }

    .research-status-loader {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #64748b;
      font-size: 0.8rem;
      padding: 1rem 0;
    }

    .intel-section {
      margin-bottom: 1rem;
    }

    .intel-section h4 {
      font-size: 0.75rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 0.35rem 0;
    }

    .intel-section p {
      font-size: 0.8rem;
      line-height: 1.4;
      color: #cbd5e1;
      margin: 0;
    }

    mat-chip {
      font-size: 0.75rem !important;
      height: 24px !important;
      border-radius: 4px !important;
    }

    ::ng-deep .red-chip { background-color: rgba(239, 68, 68, 0.15) !important; color: #f87171 !important; }
    ::ng-deep .green-chip { background-color: rgba(16, 185, 129, 0.15) !important; color: #34d399 !important; }
    ::ng-deep .blue-chip { background-color: rgba(59, 130, 246, 0.15) !important; color: #60a5fa !important; }
    ::ng-deep .gray-chip { background-color: rgba(255, 255, 255, 0.05) !important; color: #cbd5e1 !important; }

    .no-intel-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 1.5rem 0.5rem;
      color: #475569;
    }

    .no-intel-state mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 0.5rem;
    }

    .no-intel-state p {
      font-size: 0.8rem;
      margin-bottom: 1rem;
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
export class CompanyDetailComponent implements OnInit {
  readonly store = inject(CompanyStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);

  readonly contacts = signal<Contact[]>([]);
  readonly deals = signal<Deal[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly notes = signal<Note[]>([]);

  readonly noteForm: FormGroup = this.fb.group({
    content: ['', [Validators.required]]
  });

  readonly syncingEmails = signal(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.store.loadCompany(id);
        this.loadLinkedData(id);
        this.syncEmails(id, true);
      }
    });
  }

  syncEmails(companyId: string, isAutosync = false): void {
    if (!companyId) return;
    if (!isAutosync) {
      this.syncingEmails.set(true);
    }
    this.apiService.post<any>('/emails/sync/', { company_id: companyId }).subscribe({
      next: (res) => {
        if (res.status === 'syncing') {
          if (!isAutosync) {
            this.notification.success('Email synchronization started in the background.');
            setTimeout(() => {
              this.syncingEmails.set(false);
              this.store.loadCompany(companyId);
              this.loadLinkedData(companyId);
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

  formatExternalUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `https://${url}`;
  }

  private loadLinkedData(companyId: string): void {
    // Load linked contacts
    this.apiService.get<any>('/contacts/', { company: companyId }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.contacts.set(data);
      }
    });

    // Load linked deals
    this.apiService.get<any>('/deals/', { company: companyId }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.deals.set(data);
      }
    });

    // Load linked tasks
    this.apiService.get<any>('/tasks/', { company: companyId, status: 'pending' }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.tasks.set(data);
      }
    });

    // Load linked notes
    this.apiService.get<any>('/notes/', { company: companyId }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.notes.set(data);
      }
    });
  }

  openEditDialog(company: Company): void {
    this.dialog.open(CompanyFormComponent, {
      width: '560px',
      data: company,
      panelClass: 'dark-dialog-panel'
    });
  }

  deleteCompany(company: Company): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Company',
        message: `Deleting the company "${company.name}" will automatically delete all contacts in this company, associated deals if any, and unlink notes and tasks. This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.deleteCompany(company.id, () => {
          this.router.navigate(['/companies']);
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
            const company = this.store.selectedCompany();
            if (company) {
              this.loadLinkedData(company.id);
            }
          },
          error: () => {
            this.notification.error('Failed to delete note');
          }
        });
      }
    });
  }

  triggerResearch(): void {
    const company = this.store.selectedCompany();
    if (company) {
      this.store.triggerResearch(company.id);
    }
  }

  getStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      cold: 'Cold',
      active_opportunity: 'Active Opportunity',
      current_client: 'Current Client',
      dead_opportunity: 'Dead Opportunity',
      do_not_prospect: 'Do Not Prospect'
    };
    return labels[stage] || stage;
  }

  getIcpClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  openCreateContact(): void {
    // Open dynamic contact creation dialog (handled in contact module, we will load it)
    import('../../contacts/contact-form/contact-form.component').then((m) => {
      const ref = this.dialog.open(m.ContactFormComponent, {
        width: '560px',
        data: { company: this.store.selectedCompany()?.id },
        panelClass: 'dark-dialog-panel'
      });
      ref.afterClosed().subscribe(() => {
        const id = this.store.selectedCompany()?.id;
        if (id) this.loadLinkedData(id);
      });
    });
  }

  openCreateDeal(): void {
    import('../../deals/deal-form/deal-form.component').then((m) => {
      const ref = this.dialog.open(m.DealFormComponent, {
        width: '560px',
        data: { company: this.store.selectedCompany()?.id },
        panelClass: 'dark-dialog-panel'
      });
      ref.afterClosed().subscribe(() => {
        const id = this.store.selectedCompany()?.id;
        if (id) this.loadLinkedData(id);
      });
    });
  }

  openAddTask(): void {
    import('../../tasks/task-form/task-form.component').then((m) => {
      const ref = this.dialog.open(m.TaskFormComponent, {
        width: '560px',
        data: { company: this.store.selectedCompany()?.id },
        panelClass: 'dark-dialog-panel'
      });
      ref.afterClosed().subscribe(() => {
        const id = this.store.selectedCompany()?.id;
        if (id) this.loadLinkedData(id);
      });
    });
  }

  toggleTaskComplete(task: Task): void {
    const originalStatus = task.status;
    this.apiService.post<Task>(`/tasks/${task.id}/complete/`, {}).subscribe({
      next: () => {
        this.notification.success('Task completed');
        const id = this.store.selectedCompany()?.id;
        if (id) this.loadLinkedData(id);
      },
      error: () => this.notification.error('Failed to complete task')
    });
  }

  saveNote(): void {
    if (this.noteForm.invalid) return;
    const content = this.noteForm.value.content;
    const companyId = this.store.selectedCompany()?.id;

    this.apiService.post<Note>('/notes/', {
      content,
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
    return marked.parse(content) as string;
  }
}
