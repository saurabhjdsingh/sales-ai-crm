import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SequenceService } from '../services/sequence.service';
import { SequenceStep, SequenceActionType, DelayUnit } from '../../../core/models/crm.model';

@Component({
  selector: 'app-sequence-builder',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  template: `
    <div class="builder-container">
      <div class="header-section">
        <div>
          <a routerLink="/sequences" class="back-link">
            <mat-icon class="tiny-icon">arrow_back</mat-icon> Back to Sequences
          </a>
          <h1 class="page-title">{{ isEdit ? 'Edit Sequence' : 'Create New Sequence' }}</h1>
        </div>
        <div class="action-buttons">
          <button type="button" (click)="saveSequence()" [disabled]="saving" class="primary-btn">
            <mat-icon class="btn-icon">save</mat-icon>
            {{ saving ? 'Saving...' : 'Save Sequence' }}
          </button>
        </div>
      </div>

      <div class="builder-grid">
        <!-- Settings Column -->
        <div class="card settings-card">
          <h3 class="card-title">Sequence Settings</h3>
          <div class="form-group">
            <label class="form-label">Sequence Name *</label>
            <input type="text" [(ngModel)]="name" placeholder="e.g. Enterprise Executive Follow-up" class="form-input" />
          </div>

          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea [(ngModel)]="description" rows="2" placeholder="Purpose of this sequence..." class="form-textarea"></textarea>
          </div>

          <div class="toggle-group">
            <div class="toggle-row">
              <div>
                <div class="toggle-label">Active Status</div>
                <div class="toggle-sub">Enable contact enrollment and step execution</div>
              </div>
              <mat-slide-toggle [(ngModel)]="isActive" color="primary"></mat-slide-toggle>
            </div>

            <div class="toggle-row">
              <div>
                <div class="toggle-label">Track Email Opens</div>
                <div class="toggle-sub">Inject 1x1 open tracking pixel into AI emails</div>
              </div>
              <mat-slide-toggle [(ngModel)]="trackOpens" color="primary"></mat-slide-toggle>
            </div>

            <div class="toggle-row">
              <div>
                <div class="toggle-label">Stealth Click Tracking</div>
                <div class="toggle-sub">Wrap links via /r/&lt;token&gt; for click telemetry</div>
              </div>
              <mat-slide-toggle [(ngModel)]="trackClicks" color="primary"></mat-slide-toggle>
            </div>
          </div>

          <!-- Telemetry Auto-Tasks Settings -->
          <div class="card-section-title">Telemetry Auto-Tasks</div>
          <div class="toggle-group">
            <div class="toggle-row">
              <div>
                <div class="toggle-label">Task on Open Threshold</div>
                <div class="toggle-sub">Auto-create task when email opened N times</div>
              </div>
              <mat-slide-toggle [(ngModel)]="autoTaskOnOpenEnabled" color="primary"></mat-slide-toggle>
            </div>
            <div *ngIf="autoTaskOnOpenEnabled" class="form-group sub-field">
              <label class="form-label">Opens Threshold (n)</label>
              <input type="number" min="1" [(ngModel)]="autoTaskOpenCount" class="form-input" />
            </div>

            <div class="toggle-row">
              <div>
                <div class="toggle-label">Task on Click Threshold</div>
                <div class="toggle-sub">Auto-create task when link clicked N times</div>
              </div>
              <mat-slide-toggle [(ngModel)]="autoTaskOnClickEnabled" color="primary"></mat-slide-toggle>
            </div>
            <div *ngIf="autoTaskOnClickEnabled" class="form-group sub-field">
              <label class="form-label">Clicks Threshold (n)</label>
              <input type="number" min="1" [(ngModel)]="autoTaskClickCount" class="form-input" />
            </div>

            <div class="form-group" style="margin-top: 12px;">
              <label class="form-label">Assign Sequence Tasks To</label>
              <select [(ngModel)]="taskAssignmentStrategy" class="form-select">
                <option value="enrolled_by">User who enrolled contact to sequence</option>
                <option value="sequence_owner">Owner/Author of the sales sequence</option>
              </select>
            </div>
          </div>

          <!-- Exit & Auto-Stop Rules -->
          <div class="card-section-title" style="margin-top: 20px;">Exit & Auto-Stop Rules</div>
          <div class="toggle-group">
            <div class="toggle-row">
              <div>
                <div class="toggle-label">Stop on Email Reply</div>
                <div class="toggle-sub">Auto-stop sequence when contact replies</div>
              </div>
              <mat-slide-toggle [(ngModel)]="autoStopOnReply" color="primary"></mat-slide-toggle>
            </div>

            <div class="form-group" style="margin-top: 12px;">
              <label class="form-label">Auto-stop on Contact Stages</label>
              <div class="checkbox-grid">
                <label *ngFor="let stg of contactStageOptions" class="checkbox-item">
                  <input type="checkbox" [checked]="isContactStageAutoStopped(stg.value)" (change)="toggleContactStageAutoStop(stg.value)" />
                  <span>{{ stg.label }}</span>
                </label>
              </div>
            </div>

            <div class="form-group" style="margin-top: 12px;">
              <label class="form-label">Auto-stop on Deal Stages</label>
              <div class="checkbox-grid">
                <label *ngFor="let dstg of dealStageOptions" class="checkbox-item">
                  <input type="checkbox" [checked]="isDealStageAutoStopped(dstg.value)" (change)="toggleDealStageAutoStop(dstg.value)" />
                  <span>{{ dstg.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Visual Step Timeline Column -->
        <div class="card steps-card">
          <div class="steps-header">
            <h3 class="card-title">Sequence Steps Flow</h3>
            <div class="add-step-dropdown">
              <button type="button" (click)="addStep('ai_email')" class="add-step-btn email-btn">
                + AI Email
              </button>
              <button type="button" (click)="addStep('manual_task')" class="add-step-btn task-btn">
                + Manual Task
              </button>
              <button type="button" (click)="addStep('wait')" class="add-step-btn wait-btn">
                + Wait
              </button>
              <button type="button" (click)="addStep('update_stage')" class="add-step-btn stage-btn">
                + Update Stage
              </button>
            </div>
          </div>

          <div *ngIf="steps.length === 0" class="empty-steps">
            <mat-icon class="large-icon">route</mat-icon>
            <p>No steps added yet. Add an AI Email, Manual Task, Wait, or Update Stage step above to begin building the flow.</p>
          </div>

          <div class="steps-timeline">
            <div *ngFor="let step of steps; let idx = index" class="step-card">
              <div class="step-badge-num">{{ idx + 1 }}</div>

              <div class="step-main">
                <div class="step-top-bar">
                  <div class="step-type-pill" [ngClass]="step.action_type">
                    <mat-icon class="step-icon">
                      {{ step.action_type === 'ai_email' ? 'auto_awesome' : step.action_type === 'manual_task' ? 'assignment' : step.action_type === 'wait' ? 'schedule' : 'swap_horiz' }}
                    </mat-icon>
                    {{ step.action_type === 'ai_email' ? 'AI Email' : step.action_type === 'manual_task' ? 'Manual Task' : step.action_type === 'wait' ? 'Wait Duration' : 'Auto-update Stage' }}
                  </div>

                  <div class="step-controls">
                    <button type="button" mat-icon-button (click)="moveStepUp(idx)" [disabled]="idx === 0" matTooltip="Move Up">
                      <mat-icon>arrow_upward</mat-icon>
                    </button>
                    <button type="button" mat-icon-button (click)="moveStepDown(idx)" [disabled]="idx === steps.length - 1" matTooltip="Move Down">
                      <mat-icon>arrow_downward</mat-icon>
                    </button>
                    <button type="button" mat-icon-button color="warn" (click)="removeStep(idx)" matTooltip="Remove Step">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                </div>

                <!-- AI Email Configuration Form -->
                <div *ngIf="step.action_type === 'ai_email'" class="step-config-body">
                  <div class="form-group">
                    <label class="form-label">AI Personalization Prompt / Instruction</label>
                    <textarea
                      [(ngModel)]="step.configuration['prompt_instruction']"
                      rows="2"
                      placeholder="e.g. Write a friendly follow-up referencing our past call..."
                      class="form-textarea"
                    ></textarea>
                  </div>
                  <div class="form-row">
                    <div class="form-group flex-1">
                      <label class="form-label">Tone</label>
                      <input
                        type="text"
                        [(ngModel)]="step.configuration['tone']"
                        placeholder="conversational and consultative"
                        class="form-input"
                      />
                    </div>
                  </div>
                </div>

                <!-- Manual Task Configuration Form -->
                <div *ngIf="step.action_type === 'manual_task'" class="step-config-body">
                  <div class="form-group">
                    <label class="form-label">Task Title *</label>
                    <input
                      type="text"
                      [(ngModel)]="step.configuration['title']"
                      placeholder="e.g. Call Contact / Check LinkedIn Profile"
                      class="form-input"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Task Instructions</label>
                    <textarea
                      [(ngModel)]="step.configuration['description']"
                      rows="2"
                      placeholder="Details for the rep..."
                      class="form-textarea"
                    ></textarea>
                  </div>
                  <div class="form-row">
                    <div class="form-group flex-1">
                      <label class="form-label">Task Type</label>
                      <select [(ngModel)]="step.configuration['task_type']" class="form-select">
                        <option value="call">Call Contact</option>
                        <option value="email">Email</option>
                        <option value="linkedin">Check LinkedIn</option>
                        <option value="follow_up">Follow Up</option>
                        <option value="meeting">Book Meeting</option>
                        <option value="review_proposal">Send Proposal</option>
                      </select>
                    </div>
                    <div class="form-group flex-1">
                      <label class="form-label">Priority</label>
                      <select [(ngModel)]="step.configuration['priority']" class="form-select">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Wait Configuration Form -->
                <div *ngIf="step.action_type === 'wait'" class="step-config-body">
                  <div class="form-row">
                    <div class="form-group flex-1">
                      <label class="form-label">Wait Duration</label>
                      <input
                        type="number"
                        min="1"
                        [(ngModel)]="step.delay"
                        class="form-input"
                      />
                    </div>
                    <div class="form-group flex-1">
                      <label class="form-label">Unit</label>
                      <select [(ngModel)]="step.delay_unit" class="form-select">
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Auto-Update Contact Stage Configuration Form -->
                <div *ngIf="step.action_type === 'update_stage'" class="step-config-body">
                  <div class="form-group">
                    <label class="form-label">Target Contact Stage *</label>
                    <select [(ngModel)]="step.configuration['target_stage']" class="form-select">
                      <option *ngFor="let stg of contactStageOptions" [value]="stg.value">{{ stg.label }}</option>
                    </select>
                  </div>
                  <div class="note-box">
                    <mat-icon class="note-icon">info</mat-icon>
                    When this step executes, the contact's CRM stage will automatically update to the selected stage.
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .builder-container { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .header-section { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .back-link { display: flex; align-items: center; gap: 4px; color: #94a3b8; text-decoration: none; font-size: 13px; margin-bottom: 4px; }
    .tiny-icon { font-size: 16px; width: 16px; height: 16px; }
    .page-title { font-size: 24px; font-weight: 700; color: #f8fafc; margin: 0; }
    .builder-grid { display: grid; grid-template-columns: 380px 1fr; gap: 24px; align-items: start; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .card-title { font-size: 16px; font-weight: 700; color: #f8fafc; margin: 0 0 16px 0; }
    .card-section-title { font-weight: 700; font-size: 14px; margin-top: 16px; margin-bottom: 8px; color: #f8fafc; border-top: 1px solid #334155; padding-top: 12px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; }
    .form-input, .form-textarea, .form-select { width: 100%; padding: 8px 12px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; font-size: 13px; box-sizing: border-box; }
    .toggle-group { display: flex; flex-direction: column; gap: 12px; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; }
    .toggle-label { font-size: 13px; color: #f8fafc; font-weight: 500; }
    .toggle-sub { font-size: 11px; color: #64748b; }
    .sub-field { margin-left: 12px; margin-top: 4px; }
    .checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; max-height: 160px; overflow-y: auto; background: #0f172a; padding: 10px; border-radius: 6px; border: 1px solid #334155; }
    .checkbox-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #cbd5e1; cursor: pointer; }

    .steps-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .add-step-dropdown { display: flex; gap: 8px; }
    .add-step-btn { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
    .email-btn { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .task-btn { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .wait-btn { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .stage-btn { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); }

    .steps-timeline { display: flex; flex-direction: column; gap: 16px; }
    .step-card { display: flex; gap: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 16px; }
    .step-badge-num { width: 24px; height: 24px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .step-main { flex: 1; }
    .step-top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .step-type-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .step-type-pill.ai_email { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .step-type-pill.manual_task { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .step-type-pill.wait { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .step-type-pill.update_stage { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
    .step-icon { font-size: 14px; width: 14px; height: 14px; }
    .step-config-body { background: #1e293b; padding: 12px; border-radius: 6px; border: 1px solid #334155; margin-top: 8px; }
    .note-box { display: flex; gap: 8px; align-items: flex-start; font-size: 11px; color: #94a3b8; margin-top: 8px; }
    .note-icon { font-size: 14px; width: 14px; height: 14px; color: #3b82f6; }
    .form-row { display: flex; gap: 12px; }
    .flex-1 { flex: 1; }

    .primary-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    .btn-icon { font-size: 16px; width: 16px; height: 16px; }

    :host-context(body.light-theme) .page-title { color: #0f172a; }
    :host-context(body.light-theme) .card { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .card-title { color: #0f172a; }
    :host-context(body.light-theme) .card-section-title { color: #0f172a; border-top-color: #e2e8f0; }
    :host-context(body.light-theme) .form-label { color: #475569; }
    :host-context(body.light-theme) .form-input,
    :host-context(body.light-theme) .form-textarea,
    :host-context(body.light-theme) .form-select { background: #f8fafc; border-color: #cbd5e1; color: #0f172a; }
    :host-context(body.light-theme) .step-config-body { background: #f8fafc; border-color: #e2e8f0; }
    :host-context(body.light-theme) .step-card { background: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) .checkbox-grid { background: #f8fafc; border-color: #cbd5e1; }
    :host-context(body.light-theme) .checkbox-item { color: #1e293b; }
  `]
})
export class SequenceBuilderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(SequenceService);

  isEdit = false;
  sequenceId: string | null = null;
  saving = false;

  name = '';
  description = '';
  isActive = true;
  trackOpens = true;
  trackClicks = true;

  autoTaskOnOpenEnabled = false;
  autoTaskOpenCount = 2;
  autoTaskOnClickEnabled = false;
  autoTaskClickCount = 2;
  taskAssignmentStrategy: 'enrolled_by' | 'sequence_owner' = 'enrolled_by';

  autoStopOnReply = true;
  autoStopContactStages: string[] = ['do_not_contact', 'not_interested', 'won', 'not_icp', 'bad_data'];
  autoStopDealStages: string[] = ['closed_won', 'closed_lost'];

  readonly contactStageOptions = [
    { value: 'cold', label: 'Cold' },
    { value: 'approaching', label: 'Approaching' },
    { value: 'replied', label: 'Replied' },
    { value: 'follow_up', label: 'Follow Up' },
    { value: 'interested', label: 'Interested' },
    { value: 'not_icp', label: 'Not ICP' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'unresponsive', label: 'Unresponsive' },
    { value: 'do_not_contact', label: 'Do Not Contact' },
    { value: 'bad_data', label: 'Bad Data' },
    { value: 'changed_job', label: 'Changed Job' },
    { value: 'on_hold', label: 'On-Hold' },
    { value: 'won', label: 'Won' }
  ];

  readonly dealStageOptions = [
    { value: 'lead', label: 'Lead' },
    { value: 'sales_qualified', label: 'Sales Qualified' },
    { value: 'meeting_booked', label: 'Meeting Booked' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'poc', label: 'POC' },
    { value: 'contract_sent', label: 'Contract Sent' },
    { value: 'closed_won', label: 'Closed Won' },
    { value: 'closed_lost', label: 'Closed Lost' },
    { value: 'on_hold', label: 'On Hold' }
  ];

  steps: SequenceStep[] = [
    {
      step_number: 1,
      action_type: 'ai_email',
      delay: 0,
      delay_unit: 'days',
      configuration: { prompt_instruction: 'Initial outreach introducing our platform.', tone: 'conversational and consultative' }
    },
    {
      step_number: 2,
      action_type: 'wait',
      delay: 2,
      delay_unit: 'days',
      configuration: {}
    },
    {
      step_number: 3,
      action_type: 'manual_task',
      delay: 0,
      delay_unit: 'days',
      configuration: { title: 'Call Contact', description: 'Follow up call regarding email.', task_type: 'call', priority: 'medium', requires_outcome: true }
    }
  ];

  ngOnInit(): void {
    this.sequenceId = this.route.snapshot.paramMap.get('id');
    if (this.sequenceId) {
      this.isEdit = true;
      this.service.getSequence(this.sequenceId).subscribe((seq) => {
        this.name = seq.name;
        this.description = seq.description || '';
        this.isActive = seq.is_active;
        this.trackOpens = seq.track_opens;
        this.trackClicks = seq.track_clicks;
        this.autoTaskOnOpenEnabled = seq.auto_task_on_open_enabled || false;
        this.autoTaskOpenCount = seq.auto_task_open_count ?? 2;
        this.autoTaskOnClickEnabled = seq.auto_task_on_click_enabled || false;
        this.autoTaskClickCount = seq.auto_task_click_count ?? 2;
        this.taskAssignmentStrategy = seq.task_assignment_strategy || 'enrolled_by';
        this.autoStopOnReply = seq.auto_stop_on_reply ?? true;
        if (seq.auto_stop_contact_stages) {
          this.autoStopContactStages = seq.auto_stop_contact_stages;
        }
        if (seq.auto_stop_deal_stages) {
          this.autoStopDealStages = seq.auto_stop_deal_stages;
        }
        if (seq.steps && seq.steps.length > 0) {
          this.steps = seq.steps;
        }
      });
    }
  }

  addStep(type: SequenceActionType): void {
    const nextNum = this.steps.length + 1;
    let config: Record<string, any> = {};

    if (type === 'ai_email') {
      config = { prompt_instruction: 'Personalized follow up email.', tone: 'conversational and consultative' };
    } else if (type === 'manual_task') {
      config = { title: 'Follow Up Task', description: '', task_type: 'call', priority: 'medium', requires_outcome: true };
    } else if (type === 'update_stage') {
      config = { target_stage: 'contacted' };
    }

    this.steps.push({
      step_number: nextNum,
      action_type: type,
      delay: type === 'wait' ? 2 : 0,
      delay_unit: 'days',
      configuration: config
    });
  }

  removeStep(index: number): void {
    this.steps.splice(index, 1);
    this.reindexSteps();
  }

  moveStepUp(index: number): void {
    if (index === 0) return;
    const temp = this.steps[index];
    this.steps[index] = this.steps[index - 1];
    this.steps[index - 1] = temp;
    this.reindexSteps();
  }

  moveStepDown(index: number): void {
    if (index === this.steps.length - 1) return;
    const temp = this.steps[index];
    this.steps[index] = this.steps[index + 1];
    this.steps[index + 1] = temp;
    this.reindexSteps();
  }

  private reindexSteps(): void {
    this.steps.forEach((s, idx) => (s.step_number = idx + 1));
  }

  isContactStageAutoStopped(stageValue: string): boolean {
    return this.autoStopContactStages.includes(stageValue);
  }

  toggleContactStageAutoStop(stageValue: string): void {
    if (this.isContactStageAutoStopped(stageValue)) {
      this.autoStopContactStages = this.autoStopContactStages.filter(s => s !== stageValue);
    } else {
      this.autoStopContactStages.push(stageValue);
    }
  }

  isDealStageAutoStopped(stageValue: string): boolean {
    return this.autoStopDealStages.includes(stageValue);
  }

  toggleDealStageAutoStop(stageValue: string): void {
    if (this.isDealStageAutoStopped(stageValue)) {
      this.autoStopDealStages = this.autoStopDealStages.filter(s => s !== stageValue);
    } else {
      this.autoStopDealStages.push(stageValue);
    }
  }

  saveSequence(): void {
    if (!this.name.trim()) {
      alert('Please enter a sequence name.');
      return;
    }

    this.saving = true;
    const payload = {
      name: this.name,
      description: this.description,
      is_active: this.isActive,
      track_opens: this.trackOpens,
      track_clicks: this.trackClicks,
      auto_task_on_open_enabled: this.autoTaskOnOpenEnabled,
      auto_task_open_count: this.autoTaskOpenCount,
      auto_task_on_click_enabled: this.autoTaskOnClickEnabled,
      auto_task_click_count: this.autoTaskClickCount,
      task_assignment_strategy: this.taskAssignmentStrategy,
      auto_stop_on_reply: this.autoStopOnReply,
      auto_stop_contact_stages: this.autoStopContactStages,
      auto_stop_deal_stages: this.autoStopDealStages,
      steps: this.steps
    };

    if (this.isEdit && this.sequenceId) {
      this.service.updateSequence(this.sequenceId, payload).subscribe({
        next: () => {
          this.saving = false;
          this.router.navigate(['/sequences']);
        },
        error: () => (this.saving = false)
      });
    } else {
      this.service.createSequence(payload).subscribe({
        next: () => {
          this.saving = false;
          this.router.navigate(['/sequences']);
        },
        error: () => (this.saving = false)
      });
    }
  }
}
