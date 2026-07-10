import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TaskStore } from '../services/task.store';
import { Task } from '../../../core/models/crm.model';
import { ApiService } from '../../../core/services/api.service';

interface DropdownItem {
  id: string;
  name: string;
}

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title>{{ isEdit ? 'Edit Task' : 'Add Task' }}</h2>

      <form [formGroup]="taskForm" (ngSubmit)="onSubmit()">
        <mat-dialog-content class="dialog-content">
          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Task Title</mat-label>
              <input matInput formControlName="title" placeholder="Follow up on security proposal" required>
              @if (taskForm.get('title')?.hasError('required') && taskForm.get('title')?.touched) {
                <mat-error>Title is required</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Task Type</mat-label>
              <mat-select formControlName="task_type">
                <mat-option value="call">Call</mat-option>
                <mat-option value="email">Email</mat-option>
                <mat-option value="linkedin">LinkedIn</mat-option>
                <mat-option value="follow_up">Follow Up</mat-option>
                <mat-option value="meeting">Meeting</mat-option>
                <mat-option value="review_proposal">Review Proposal</mat-option>
                <mat-option value="other">Other</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Priority</mat-label>
              <mat-select formControlName="priority">
                <mat-option value="low">Low</mat-option>
                <mat-option value="medium">Medium</mat-option>
                <mat-option value="high">High</mat-option>
                <mat-option value="urgent">Urgent</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Due Date</mat-label>
              <input matInput type="datetime-local" formControlName="due_date" lang="en-GB">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Reminder Date</mat-label>
              <input matInput type="datetime-local" formControlName="reminder_at" lang="en-GB">
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Assigned To</mat-label>
              <mat-select formControlName="owner">
                <mat-option [value]="null">Unassigned</mat-option>
                @for (user of users(); track user.id) {
                  <mat-option [value]="user.id">{{ user.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Repeat</mat-label>
              <mat-select formControlName="repeat">
                <mat-option value="none">None</mat-option>
                <mat-option value="daily">Daily</mat-option>
                <mat-option value="weekly">Weekly</mat-option>
                <mat-option value="monthly">Monthly</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <!-- Associations (Hidden/readonly if passed in context, editable otherwise) -->
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Company</mat-label>
              <mat-select formControlName="company">
                <mat-option [value]="null">None</mat-option>
                @for (c of companies(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Contact</mat-label>
              <mat-select formControlName="contact">
                <mat-option [value]="null">None</mat-option>
                @for (c of contacts(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Linked Deal</mat-label>
              <mat-select formControlName="deal">
                <mat-option [value]="null">None</mat-option>
                @for (d of deals(); track d.id) {
                  <mat-option [value]="d.id">{{ d.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description</mat-label>
              <textarea matInput formControlName="description" rows="3" placeholder="Add specific task instructions..."></textarea>
            </mat-form-field>
          </div>
        </mat-dialog-content>

        <mat-dialog-actions align="end" class="dialog-actions">
          <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="taskForm.invalid || store.loading()">
            Save
          </button>
        </mat-dialog-actions>
      </form>
    </div>
  `,
  styles: [`
    .dialog-container {
      background-color: #0b1329;
      color: #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }

    mat-dialog-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
      padding: 1.5rem 1.5rem 1rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .dialog-content {
      padding: 1.5rem !important;
      max-height: 70vh;
      overflow-y: auto;
    }

    .form-row {
      margin-bottom: 1rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .full-width {
      width: 100%;
    }

    ::ng-deep .dialog-content .mat-mdc-text-field-wrapper {
      background-color: rgba(255, 255, 255, 0.02) !important;
    }

    .dialog-actions {
      padding: 1rem 1.5rem 1.5rem 1.5rem !important;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
  `]
})
export class TaskFormComponent implements OnInit {
  readonly store = inject(TaskStore);
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  readonly dialogRef = inject(MatDialogRef<TaskFormComponent>);
  readonly data = inject<any>(MAT_DIALOG_DATA, { optional: true });

  readonly isEdit = !!this.data && !this.data.company && !this.data.contact && !this.data.deal;
  readonly users = signal<DropdownItem[]>([]);
  readonly companies = signal<DropdownItem[]>([]);
  readonly contacts = signal<DropdownItem[]>([]);
  readonly deals = signal<DropdownItem[]>([]);

  readonly taskForm: FormGroup = this.fb.group({
    title: ['', [Validators.required]],
    description: [''],
    due_date: [''],
    reminder_at: [''],
    priority: ['medium'],
    owner: [null],
    repeat: ['none'],
    company: [null],
    contact: [null],
    deal: [null],
    status: ['pending']
  });

  ngOnInit(): void {
    // Load sales reps
    this.apiService.get<any[]>('/auth/team/').subscribe((res) => {
      this.users.set(res.map((u) => ({ id: u.id, name: u.full_name })));
    });

    // Load associations
    this.apiService.get<any>('/companies/', { page_size: 100 }).subscribe((res) => {
      this.companies.set(res.results.map((c: any) => ({ id: c.id, name: c.name })));
      if (this.data && this.data.company) {
        this.taskForm.patchValue({ company: this.data.company });
      }
    });

    this.apiService.get<any>('/contacts/', { page_size: 100 }).subscribe((res) => {
      this.contacts.set(res.results.map((c: any) => ({ id: c.id, name: c.full_name })));
      if (this.data && this.data.contact) {
        this.taskForm.patchValue({ contact: this.data.contact });
      }
    });

    this.apiService.get<any>('/deals/', { page_size: 100 }).subscribe((res) => {
      this.deals.set(res.results.map((d: any) => ({ id: d.id, name: d.name })));
      if (this.data && this.data.deal) {
        this.taskForm.patchValue({ deal: this.data.deal });
      }
    });

    if (this.isEdit && this.data) {
      this.taskForm.patchValue({
        title: this.data.title,
        description: this.data.description || '',
        due_date: this.toLocalISOString(this.data.due_date),
        reminder_at: this.toLocalISOString(this.data.reminder_at),
        priority: this.data.priority,
        owner: this.data.owner || null,
        repeat: this.data.repeat || 'none',
        company: this.data.company || null,
        contact: this.data.contact || null,
        deal: this.data.deal || null,
        status: this.data.status
      });
    }
  }

  private toLocalISOString(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const pad = (num: number) => (num < 10 ? '0' : '') + num;
    return date.getFullYear() +
      '-' + pad(date.getMonth() + 1) +
      '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) +
      ':' + pad(date.getMinutes());
  }

  onSubmit(): void {
    if (this.taskForm.invalid) return;

    const val = this.taskForm.value;
    const taskData = { ...val };
    
    // Format dates to ISO strings, deleting empty values
    if (taskData.due_date) {
      taskData.due_date = new Date(taskData.due_date).toISOString();
    } else {
      delete taskData.due_date;
    }
    if (taskData.reminder_at) {
      taskData.reminder_at = new Date(taskData.reminder_at).toISOString();
    } else {
      delete taskData.reminder_at;
    }

    const callback = () => this.dialogRef.close();

    if (this.isEdit && this.data) {
      this.store.updateTask(this.data.id, taskData, callback);
    } else {
      this.store.createTask(taskData, callback);
    }
  }
}
