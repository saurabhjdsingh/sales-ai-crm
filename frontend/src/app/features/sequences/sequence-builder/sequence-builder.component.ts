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
            <textarea [(ngModel)]="description" rows="3" placeholder="Purpose of this sequence..." class="form-textarea"></textarea>
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
            </div>
          </div>

          <div *ngIf="steps.length === 0" class="empty-steps">
            <mat-icon class="large-icon">route</mat-icon>
            <p>No steps added yet. Add an AI Email, Manual Task, or Wait step above to begin building the flow.</p>
          </div>

          <div class="steps-timeline">
            <div *ngFor="let step of steps; let idx = index" class="step-card">
              <div class="step-badge-num">{{ idx + 1 }}</div>

              <div class="step-main">
                <div class="step-top-bar">
                  <div class="step-type-pill" [ngClass]="step.action_type">
                    <mat-icon class="step-icon">
                      {{ step.action_type === 'ai_email' ? 'auto_awesome' : step.action_type === 'manual_task' ? 'assignment' : 'schedule' }}
                    </mat-icon>
                    {{ step.action_type === 'ai_email' ? 'AI Email' : step.action_type === 'manual_task' ? 'Manual Task' : 'Wait Duration' }}
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
                      placeholder="e.g. Write a friendly follow-up referencing our past call and their security challenges..."
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
                  <div class="note-box">
                    <mat-icon class="note-icon">info</mat-icon>
                    Emails are generated dynamically when due using full CRM context (notes, call logs, research) and placed in the Approval Queue for mandatory human review.
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
                  <div class="toggle-row mini">
                    <span class="toggle-label">Require Structured Outcome Selection to Complete Task</span>
                    <mat-slide-toggle [(ngModel)]="step.configuration['requires_outcome']" color="primary"></mat-slide-toggle>
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

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .builder-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      color: #94a3b8;
      font-size: 0.85rem;
      text-decoration: none;
      margin-bottom: 0.25rem;
    }

    .back-link:hover { color: #f8fafc; }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
    }

    .primary-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: #ffffff;
      padding: 0.65rem 1.4rem;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.9rem;
    }

    .builder-grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 1.5rem;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 1.25rem 0;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin-bottom: 1rem;
    }

    .form-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #94a3b8;
    }

    .form-input, .form-textarea, .form-select {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 0.6rem 0.8rem;
      color: #f8fafc;
      font-size: 0.875rem;
      outline: none;
    }

    .form-input:focus, .form-textarea:focus, .form-select:focus {
      border-color: #3b82f6;
    }

    .toggle-group {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 1.25rem;
    }

    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .toggle-row.mini { margin-top: 0.5rem; }

    .toggle-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: #e2e8f0;
    }

    .toggle-sub {
      font-size: 0.75rem;
      color: #64748b;
    }

    .steps-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .add-step-dropdown {
      display: flex;
      gap: 0.5rem;
    }

    .add-step-btn {
      border: none;
      padding: 0.45rem 0.8rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.8rem;
      cursor: pointer;
    }

    .add-step-btn.email-btn { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .add-step-btn.task-btn { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .add-step-btn.wait-btn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

    .empty-steps {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }

    .large-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #3b82f6;
      margin-bottom: 0.5rem;
    }

    .steps-timeline {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .step-card {
      display: flex;
      gap: 1rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 1rem;
    }

    .step-badge-num {
      width: 28px;
      height: 28px;
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .step-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .step-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .step-type-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
    }

    .step-type-pill.ai_email { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .step-type-pill.manual_task { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .step-type-pill.wait { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

    .step-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .form-row {
      display: flex;
      gap: 1rem;
    }

    .flex-1 { flex: 1; }

    .note-box {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(59, 130, 246, 0.05);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 6px;
      padding: 0.6rem 0.8rem;
      color: #93c5fd;
      font-size: 0.78rem;
    }

    .note-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .btn-icon, .tiny-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .page-title { color: #0f172a; }
    :host-context(body.light-theme) .page-subtitle { color: #334155; }
    :host-context(body.light-theme) .form-card,
    :host-context(body.light-theme) .step-card { background: #ffffff; border-color: #cbd5e1; color: #0f172a; }
    :host-context(body.light-theme) .form-label { color: #000000 !important; font-weight: 700; }
    :host-context(body.light-theme) .form-input,
    :host-context(body.light-theme) .form-textarea,
    :host-context(body.light-theme) .form-select { background: #f8fafc; border-color: #cbd5e1; color: #0f172a; }
    :host-context(body.light-theme) .step-config-body { background: #f8fafc; border-color: #e2e8f0; }
    :host-context(body.light-theme) .step-number { background: #0f172a; color: #ffffff; }
    :host-context(body.light-theme) .step-title-input { color: #0f172a; }
    :host-context(body.light-theme) .back-link { color: #475569; }
    :host-context(body.light-theme) .secondary-btn { background: #f1f5f9; border-color: #cbd5e1; color: #1e293b; }
    :host-context(body.light-theme) .add-step-bar { background: #ffffff; border-color: #cbd5e1; }
    :host-context(body.light-theme) .add-btn { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
    :host-context(body.light-theme) .toggle-label { color: #0f172a; font-weight: 600; }
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
