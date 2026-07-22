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
              <input matInput formControlName="title" placeholder="Follow up on security proposal" required />
              @if (taskForm.get('title')?.hasError('required') && taskForm.get('title')?.touched) {
                <mat-error>Title is required</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Task Type</mat-label>
              <mat-select formControlName="task_type">
                @for (t of taskTypes; track t.value) {
                  <mat-option [value]="t.value">{{ t.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Priority</mat-label>
              <mat-select formControlName="priority">
                @for (p of priorities; track p.value) {
                  <mat-option [value]="p.value">{{ p.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Due Date</mat-label>
              <input matInput type="datetime-local" formControlName="due_date" lang="en-GB" (click)="showDatePicker($event)" (focus)="showDatePicker($event)" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Reminder Date</mat-label>
              <input matInput type="datetime-local" formControlName="reminder_at" lang="en-GB" (click)="showDatePicker($event)" (focus)="showDatePicker($event)" />
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
                @for (r of repeatOptions; track r.value) {
                  <mat-option [value]="r.value">{{ r.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <!-- Associations -->
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Company</mat-label>
              <mat-select formControlName="company" placeholder="Select Company">
                <mat-option [value]="null">None</mat-option>
                @for (c of filteredCompanies(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Contact</mat-label>
              <mat-select formControlName="contact" placeholder="Select Contact">
                <mat-option [value]="null">None</mat-option>
                @for (c of filteredContacts(); track c.id) {
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

  readonly isEdit = !!this.data && !!this.data.id;

  readonly taskTypes = [
    { value: 'call', label: 'Call' },
    { value: 'email', label: 'Email' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'follow_up', label: 'Follow Up' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'review_proposal', label: 'Review Proposal' },
    { value: 'other', label: 'Other' }
  ];

  readonly priorities = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' }
  ];

  readonly repeatOptions = [
    { value: 'none', label: 'None' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];

  readonly users = signal<DropdownItem[]>([]);
  readonly companies = signal<DropdownItem[]>([]);
  readonly filteredCompanies = signal<DropdownItem[]>([]);
  readonly contacts = signal<DropdownItem[]>([]);
  readonly filteredContacts = signal<DropdownItem[]>([]);
  readonly deals = signal<DropdownItem[]>([]);

  readonly taskForm: FormGroup = this.fb.group({
    title: ['', [Validators.required]],
    description: [''],
    due_date: [''],
    reminder_at: [''],
    priority: ['medium'],
    task_type: ['call'],
    owner: [null],
    repeat: ['none'],
    company: [null],
    contact: [null],
    deal: [null],
    status: ['pending']
  });

  ngOnInit(): void {
    // 1. Populate form immediately with data passed in dialog
    if (this.data) {
      this.populateForm(this.data);
    }

    // 2. Fetch full detail from backend if editing to ensure complete fields are loaded
    if (this.isEdit && this.data && this.data.id) {
      this.apiService.get<any>(`/tasks/${this.data.id}/`).subscribe({
        next: (taskDetail) => {
          if (taskDetail) {
            this.populateForm(taskDetail);
            this.ensureAssociationsInDropdowns(taskDetail);
          }
        }
      });
    }

    // 3. Load sales reps
    this.apiService.get<any[]>('/auth/team/').subscribe((res) => {
      if (Array.isArray(res)) {
        this.users.set(res.map((u) => ({ id: u.id, name: u.full_name || u.name || u.email })));
      }
    });

    // 4. Load associations
    this.apiService.get<any>('/companies/', { page_size: 100 }).subscribe((res) => {
      const items = (Array.isArray(res) ? res : (res?.results || [])).map((c: any) => ({ id: c.id, name: c.name }));
      this.mergeDropdownItems('companies', items);
    });

    this.apiService.get<any>('/contacts/', { page_size: 100 }).subscribe((res) => {
      const items = (Array.isArray(res) ? res : (res?.results || [])).map((c: any) => ({ id: c.id, name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() }));
      this.mergeDropdownItems('contacts', items);
    });

    this.apiService.get<any>('/deals/', { page_size: 100 }).subscribe((res) => {
      const items = (Array.isArray(res) ? res : (res?.results || [])).map((d: any) => ({ id: d.id, name: d.name }));
      this.mergeDropdownItems('deals', items);
    });

    // Auto-link company when contact is selected
    this.taskForm.get('contact')?.valueChanges.subscribe((contactId) => {
      if (contactId && !this.taskForm.get('company')?.value) {
        this.apiService.get<any>(`/contacts/${contactId}/`).subscribe((c) => {
          if (c && c.company) {
            const compId = this.extractId(c.company);
            if (compId) {
              this.taskForm.patchValue({ company: compId });
            }
          }
        });
      }
    });
  }

  private extractId(val: any): string | null {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val.id) return val.id;
    return null;
  }

  private populateForm(taskData: any): void {
    if (!taskData) return;
    const companyId = this.extractId(taskData.company);
    const contactId = this.extractId(taskData.contact);
    const dealId = this.extractId(taskData.deal);
    const ownerId = this.extractId(taskData.owner);

    this.taskForm.patchValue({
      title: taskData.title || '',
      description: taskData.description || '',
      due_date: this.toLocalISOString(taskData.due_date),
      reminder_at: this.toLocalISOString(taskData.reminder_at),
      priority: taskData.priority || 'medium',
      task_type: taskData.task_type || 'call',
      owner: ownerId,
      repeat: taskData.repeat || 'none',
      company: companyId,
      contact: contactId,
      deal: dealId,
      status: taskData.status || 'pending'
    });

    // Merge inline names into dropdown signals so mat-select options match immediately
    if (taskData.company && typeof taskData.company === 'object') {
      this.mergeDropdownItems('companies', [{ id: taskData.company.id, name: taskData.company.name }]);
    } else if (taskData.company_name && companyId) {
      this.mergeDropdownItems('companies', [{ id: companyId, name: taskData.company_name }]);
    }

    if (taskData.contact && typeof taskData.contact === 'object') {
      this.mergeDropdownItems('contacts', [{ id: taskData.contact.id, name: taskData.contact.full_name || taskData.contact.name }]);
    } else if (taskData.contact_name && contactId) {
      this.mergeDropdownItems('contacts', [{ id: contactId, name: taskData.contact_name }]);
    }

    if (taskData.deal && typeof taskData.deal === 'object') {
      this.mergeDropdownItems('deals', [{ id: taskData.deal.id, name: taskData.deal.name }]);
    } else if (taskData.deal_name && dealId) {
      this.mergeDropdownItems('deals', [{ id: dealId, name: taskData.deal_name }]);
    }
  }

  private ensureAssociationsInDropdowns(detail: any): void {
    if (detail.company && typeof detail.company === 'object') {
      this.mergeDropdownItems('companies', [{ id: detail.company.id, name: detail.company.name }]);
    }
    if (detail.contact && typeof detail.contact === 'object') {
      this.mergeDropdownItems('contacts', [{ id: detail.contact.id, name: detail.contact.full_name || detail.contact.name }]);
    }
    if (detail.deal && typeof detail.deal === 'object') {
      this.mergeDropdownItems('deals', [{ id: detail.deal.id, name: detail.deal.name }]);
    }
  }

  private mergeDropdownItems(type: 'companies' | 'contacts' | 'deals', newItems: DropdownItem[]): void {
    if (!newItems || newItems.length === 0) return;
    if (type === 'companies') {
      const current = [...this.companies()];
      newItems.forEach(item => {
        if (!current.some(c => c.id === item.id)) {
          current.push(item);
        }
      });
      this.companies.set(current);
      this.filteredCompanies.set(current);
    } else if (type === 'contacts') {
      const current = [...this.contacts()];
      newItems.forEach(item => {
        if (!current.some(c => c.id === item.id)) {
          current.push(item);
        }
      });
      this.contacts.set(current);
      this.filteredContacts.set(current);
    } else if (type === 'deals') {
      const current = [...this.deals()];
      newItems.forEach(item => {
        if (!current.some(d => d.id === item.id)) {
          current.push(item);
        }
      });
      this.deals.set(current);
    }
  }

  private toLocalISOString(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const tzoffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  }

  showDatePicker(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (e) {
        console.error(e);
      }
    }
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
