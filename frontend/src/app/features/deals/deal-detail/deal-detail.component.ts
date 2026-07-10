import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { DealStore } from '../services/deal.store';
import { DealFormComponent } from '../deal-form/deal-form.component';
import { TimelineComponent } from '../../../shared/components/timeline/timeline.component';
import { AIChatPanelComponent } from '../../../shared/components/ai-chat-panel/ai-chat-panel.component';
import { ApiService } from '../../../core/services/api.service';
import { Contact, Deal, Note, Task } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationService } from '../../../core/services/notification.service';
import { marked } from 'marked';

@Component({
  selector: 'app-deal-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    TimelineComponent,
    AIChatPanelComponent
  ],
  template: `
    @if (store.loading() && !store.selectedDeal()) {
      <div class="loading-state">
        <mat-spinner diameter="48"></mat-spinner>
        <p>Loading deal data...</p>
      </div>
    } @else if (store.selectedDeal(); as deal) {
      <div class="detail-layout">
        <!-- Main Info and Tabs Column -->
        <div class="main-column">
          <!-- Deal profile card -->
          <div class="deal-profile-card">
            <div class="profile-header">
              <div class="avatar-box">
                <mat-icon class="deal-avatar-icon">monetization_on</mat-icon>
              </div>
              <div class="header-details">
                <div class="title-row">
                  <h1>{{ deal.name }}</h1>
                  <span class="stage-badge" [ngClass]="deal.stage">{{ getStageLabel(deal.stage) }}</span>
                </div>
                <div class="subtitle-row">
                  <a [routerLink]="['/companies', deal.company]" class="company-link">
                    {{ deal.company_name }}
                  </a>
                  <span class="divider">·</span>
                  <span class="priority-tag" [ngClass]="deal.priority">Priority: {{ deal.priority | uppercase }}</span>
                  <span class="divider" *ngIf="deal.expected_close_date">·</span>
                  <span *ngIf="deal.expected_close_date">Close: {{ deal.expected_close_date | date:'dd/MM/yyyy' }}</span>
                </div>
              </div>
              <div class="header-actions">
                <button mat-stroked-button (click)="openEditDialog(deal)" class="edit-btn">
                  <mat-icon>edit</mat-icon>
                  <span>Edit</span>
                </button>
                <button mat-flat-button color="warn" (click)="deleteDeal(deal)" class="delete-btn">
                  <mat-icon>delete</mat-icon>
                  <span>Delete</span>
                </button>
              </div>
            </div>

            <!-- Revenue / Risk Grid -->
            <div class="intel-grid">
              <div class="intel-box">
                <span class="intel-label">Expected Revenue</span>
                <span class="intel-value" *ngIf="deal.expected_revenue">
                  \${{ deal.expected_revenue | number:'1.2-2' }}
                </span>
                <span class="intel-value" *ngIf="!deal.expected_revenue">—</span>
              </div>
              <div class="intel-box">
                <span class="intel-label">Close Probability</span>
                <span class="intel-value">{{ deal.probability || 0 }}%</span>
              </div>
              <div class="intel-box">
                <span class="intel-label">Risk Level</span>
                <span class="intel-value risk-tag" [ngClass]="deal.risk">{{ deal.risk | uppercase }}</span>
              </div>
            </div>
            
            <p class="description" *ngIf="deal.description">{{ deal.description }}</p>
          </div>

          <!-- Bottom Tabs Panel -->
          <mat-tab-group class="dark-tabs">
            <!-- Timeline Tab -->
            <mat-tab label="Timeline">
              <div class="tab-content">
                <app-timeline [dealId]="deal.id"></app-timeline>
              </div>
            </mat-tab>

            <!-- Contacts Tab (Deal Contacts with Roles) -->
            <mat-tab label="Contacts">
              <div class="tab-content">
                <div class="tab-section-header">
                  <h3>Deal Contacts ({{ store.dealContacts().length }})</h3>
                </div>

                <!-- Add Contact Form -->
                <form [formGroup]="contactLinkForm" (ngSubmit)="addContact()" class="link-contact-form">
                  <mat-form-field appearance="outline">
                    <mat-label>Contact</mat-label>
                    <mat-select formControlName="contact">
                      @for (c of companyContacts(); track c.id) {
                        <mat-option [value]="c.id">{{ c.full_name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>Role on Deal</mat-label>
                    <mat-select formControlName="role">
                      <mat-option value="decision_maker">Decision Maker</mat-option>
                      <mat-option value="champion">Champion</mat-option>
                      <mat-option value="influencer">Influencer</mat-option>
                      <mat-option value="blocker">Blocker</mat-option>
                      <mat-option value="user">User</mat-option>
                      <mat-option value="evaluator">Evaluator</mat-option>
                    </mat-select>
                  </mat-form-field>

                  <button mat-flat-button color="primary" type="submit" [disabled]="contactLinkForm.invalid" class="link-btn">
                    Link Contact
                  </button>
                </form>

                <div class="deal-contacts-list">
                  @for (dc of store.dealContacts(); track dc.id) {
                    <div class="deal-contact-item">
                      <mat-icon class="person-icon">person</mat-icon>
                      <div class="contact-details">
                        <div class="contact-name" [routerLink]="['/contacts', dc.contact]">{{ dc.contact_name }}</div>
                        <div class="contact-role">{{ getRoleLabel(dc.role) }}</div>
                      </div>
                      <button mat-icon-button color="warn" (click)="removeContact(dc.contact)" matTooltip="Remove Link">
                        <mat-icon>link_off</mat-icon>
                      </button>
                    </div>
                  }
                  @if (store.dealContacts().length === 0) {
                    <div class="tab-empty-state">
                      <mat-icon>people_outline</mat-icon>
                      <p>No contacts linked to this deal yet. Use the selector above to link.</p>
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
          <!-- AI Deal Analysis Panel -->
          <div class="intel-card" *ngIf="deal.ai_analysis">
            <div class="card-header">
              <mat-icon class="intel-icon">insights</mat-icon>
              <span>AI Deal Analysis</span>
            </div>
            <div class="intel-body">
              <p class="summary-text" [innerHTML]="renderMarkdown(deal.ai_analysis)"></p>
            </div>
          </div>

          <!-- Chat panel -->
          <app-ai-chat-panel [entityType]="'deal'" [entityId]="deal.id" class="sidebar-chat"></app-ai-chat-panel>
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

    .deal-profile-card {
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
      background-color: rgba(245, 158, 11, 0.1);
      border-radius: 8px;
      border: 1px solid rgba(245, 158, 11, 0.2);
    }

    .deal-avatar-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #fbbf24;
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

    .priority-tag {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.05rem 0.35rem;
      border-radius: 4px;
    }

    .priority-tag.low { background-color: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .priority-tag.medium { background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .priority-tag.high { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .priority-tag.critical { background-color: rgba(239, 68, 68, 0.2); color: #f87171; }

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

    .stage-badge.lead { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .stage-badge.sales_qualified { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .stage-badge.meeting_booked { background: rgba(139, 92, 246, 0.15); color: #c084fc; }
    .stage-badge.negotiation { background: rgba(245, 158, 11, 0.15); color: #fbbd23; }
    .stage-badge.poc { background: rgba(20, 184, 166, 0.15); color: #2dd4bf; }
    .stage-badge.contract_sent { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .stage-badge.closed_won { background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 700; }
    .stage-badge.closed_lost { background: rgba(239, 68, 68, 0.15); color: #f87171; }

    .intel-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .intel-box {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 0.85rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .intel-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }

    .intel-value {
      font-size: 1.15rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .risk-tag {
      font-size: 0.9rem !important;
      font-weight: 800;
    }

    .risk-tag.low { color: #34d399; }
    .risk-tag.medium { color: #fbbf24; }
    .risk-tag.high { color: #f87171; }

    .description {
      font-size: 0.9rem;
      color: #cbd5e1;
      margin: 0;
      line-height: 1.6;
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

    /* Link contact form */
    .link-contact-form {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      padding: 0.75rem;
      border-radius: 8px;
    }

    .link-contact-form mat-form-field {
      flex: 1;
      height: 48px;
    }

    ::ng-deep .link-contact-form .mat-mdc-text-field-wrapper {
      background-color: rgba(255, 255, 255, 0.02) !important;
      height: 42px !important;
    }

    ::ng-deep .link-contact-form .mat-mdc-form-field-flex {
      height: 42px !important;
      align-items: center !important;
    }

    ::ng-deep .link-contact-form .mat-mdc-form-field-infix {
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }

    .link-btn {
      background-color: #3b82f6 !important;
      color: white !important;
      border-radius: 6px;
      height: 42px !important;
    }

    /* Deal Contacts List */
    .deal-contacts-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .deal-contact-item {
      display: flex;
      align-items: center;
      padding: 0.85rem;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 8px;
    }

    .person-icon {
      color: #94a3b8;
      margin-right: 0.75rem;
    }

    .contact-details {
      flex: 1;
    }

    .contact-name {
      font-weight: 600;
      color: #f8fafc;
      font-size: 0.85rem;
      cursor: pointer;
    }

    .contact-name:hover {
      color: #3b82f6;
      text-decoration: underline;
    }

    .contact-role {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
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
      color: #fbbf24;
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

    ::ng-deep .summary-text ul, ::ng-deep .summary-text ol {
      padding-left: 1.25rem;
      margin-bottom: 0.5rem;
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
  `]
})
export class DealDetailComponent implements OnInit {
  readonly store = inject(DealStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);

  readonly companyContacts = signal<Contact[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly notes = signal<Note[]>([]);

  readonly contactLinkForm: FormGroup = this.fb.group({
    contact: [null, [Validators.required]],
    role: ['', [Validators.required]]
  });

  readonly noteForm: FormGroup = this.fb.group({
    content: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.store.loadDeal(id);
        this.loadLinkedData(id);
      }
    });
  }

  private loadLinkedData(dealId: string): void {
    // Load tasks
    this.apiService.get<any>('/tasks/', { deal: dealId, status: 'pending' }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.tasks.set(data);
      }
    });

    // Load notes
    this.apiService.get<any>('/notes/', { deal: dealId }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.results || []);
        this.notes.set(data);
      }
    });

    // Load all contacts of the company to allow linking them
    this.store.selectedDeal(); // Triggers reactivity
    setTimeout(() => {
      const dealObj = this.store.selectedDeal();
      if (dealObj && dealObj.company) {
        this.apiService.get<any>('/contacts/', { company: dealObj.company }).subscribe({
          next: (res) => {
            const data = Array.isArray(res) ? res : (res?.results || []);
            this.companyContacts.set(data);
          }
        });
      }
    }, 100);
  }

  openEditDialog(deal: Deal): void {
    this.dialog.open(DealFormComponent, {
      width: '560px',
      data: deal,
      panelClass: 'dark-dialog-panel'
    });
  }

  deleteDeal(deal: Deal): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Deal',
        message: `Are you sure you want to delete the deal "${deal.name}"? This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.deleteDeal(deal.id, () => {
          this.router.navigate(['/deals']);
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
      lead: 'Lead',
      sales_qualified: 'Sales Qualified',
      meeting_booked: 'Meeting Booked',
      negotiation: 'Negotiation',
      poc: 'POC',
      contract_sent: 'Contract Sent',
      closed_won: 'Closed Won',
      closed_lost: 'Closed Lost',
      on_hold: 'On Hold'
    };
    return labels[stage] || stage;
  }

  getRoleLabel(role: string): string {
    const roles: Record<string, string> = {
      decision_maker: 'Decision Maker',
      champion: 'Champion',
      influencer: 'Influencer',
      blocker: 'Blocker',
      user: 'User',
      evaluator: 'Evaluator'
    };
    return roles[role] || role;
  }

  addContact(): void {
    if (this.contactLinkForm.invalid) return;
    const deal = this.store.selectedDeal();
    if (!deal) return;

    const val = this.contactLinkForm.value;
    this.store.addDealContact(deal.id, val.contact, val.role, false);
    this.contactLinkForm.reset();
  }

  removeContact(contactId: string): void {
    const deal = this.store.selectedDeal();
    if (!deal) return;
    this.store.removeDealContact(deal.id, contactId);
  }

  openAddTask(): void {
    import('../../tasks/task-form/task-form.component').then((m) => {
      const ref = this.dialog.open(m.TaskFormComponent, {
        width: '560px',
        data: { deal: this.store.selectedDeal()?.id, company: this.store.selectedDeal()?.company },
        panelClass: 'dark-dialog-panel'
      });
      ref.afterClosed().subscribe(() => {
        const id = this.store.selectedDeal()?.id;
        if (id) this.loadLinkedData(id);
      });
    });
  }

  toggleTaskComplete(task: Task): void {
    this.apiService.post<Task>(`/tasks/${task.id}/complete/`, {}).subscribe({
      next: () => {
        this.notification.success('Task completed');
        const id = this.store.selectedDeal()?.id;
        if (id) this.loadLinkedData(id);
      },
      error: () => this.notification.error('Failed to complete task')
    });
  }

  saveNote(): void {
    if (this.noteForm.invalid) return;
    const content = this.noteForm.value.content;
    const deal = this.store.selectedDeal();
    if (!deal) return;

    this.apiService.post<Note>('/notes/', {
      content,
      deal: deal.id,
      company: deal.company
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
