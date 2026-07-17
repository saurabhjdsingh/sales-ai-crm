import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DealStore } from '../services/deal.store';
import { Deal } from '../../../core/models/crm.model';
import { ApiService } from '../../../core/services/api.service';

interface DropdownItem {
  id: string;
  name: string;
}

@Component({
  selector: 'app-deal-form',
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
      <h2 mat-dialog-title>{{ isEdit ? 'Edit Deal' : 'Add Deal' }}</h2>

      <form [formGroup]="dealForm" (ngSubmit)="onSubmit()">
        <mat-dialog-content class="dialog-content">
          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Deal Name</mat-label>
              <input matInput formControlName="name" placeholder="Acme Vulnerability Assessment" required>
              @if (dealForm.get('name')?.hasError('required') && dealForm.get('name')?.touched) {
                <mat-error>Name is required</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Company</mat-label>
              <mat-select formControlName="company" required placeholder="Select Company">
                <div class="select-search-container">
                  <input type="text" 
                         placeholder="Search company..." 
                         (input)="filterCompanies($event)" 
                         (keydown)="$event.stopPropagation()"
                         class="select-search-input" />
                </div>
                @for (c of filteredCompanies(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
              @if (dealForm.get('company')?.hasError('required') && dealForm.get('company')?.touched) {
                <mat-error>Company is required</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Expected Revenue ($)</mat-label>
              <input matInput type="number" formControlName="expected_revenue" placeholder="15000">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Probability (%)</mat-label>
              <input matInput type="number" formControlName="probability" placeholder="50" min="0" max="100">
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Stage</mat-label>
              <mat-select formControlName="stage">
                <mat-option value="lead">Lead</mat-option>
                <mat-option value="sales_qualified">Sales Qualified</mat-option>
                <mat-option value="meeting_booked">Meeting Booked</mat-option>
                <mat-option value="negotiation">Negotiation</mat-option>
                <mat-option value="poc">POC</mat-option>
                <mat-option value="contract_sent">Contract Sent</mat-option>
                <mat-option value="closed_won">Closed Won</mat-option>
                <mat-option value="closed_lost">Closed Lost</mat-option>
                <mat-option value="on_hold">On Hold</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Owner</mat-label>
              <mat-select formControlName="owner">
                <mat-option [value]="null">Unassigned</mat-option>
                @for (user of users(); track user.id) {
                  <mat-option [value]="user.id">{{ user.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Priority</mat-label>
              <mat-select formControlName="priority">
                <mat-option value="low">Low</mat-option>
                <mat-option value="medium">Medium</mat-option>
                <mat-option value="high">High</mat-option>
                <mat-option value="critical">Critical</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Risk Level</mat-label>
              <mat-select formControlName="risk">
                <mat-option value="low">Low</mat-option>
                <mat-option value="medium">Medium</mat-option>
                <mat-option value="high">High</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Expected Close Date</mat-label>
              <input matInput type="date" formControlName="expected_close_date" lang="en-GB" (click)="showDatePicker($event)" (focus)="showDatePicker($event)">
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description</mat-label>
              <textarea matInput formControlName="description" rows="3" placeholder="Brief outline of deal terms..."></textarea>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Internal Notes</mat-label>
              <textarea matInput formControlName="internal_notes" rows="3" placeholder="Internal notes not visible to customer..."></textarea>
            </mat-form-field>
          </div>
        </mat-dialog-content>

        <mat-dialog-actions align="end" class="dialog-actions">
          <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="dealForm.invalid || store.loading()">
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

    .select-search-container {
      padding: 8px 12px;
      position: sticky;
      top: 0;
      background: #0f172a;
      z-index: 100;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .select-search-input {
      width: 100%;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      background: #1e293b;
      color: white;
      box-sizing: border-box;
      font-size: 0.9rem;
      outline: none;
    }
    .select-search-input:focus {
      border-color: #3b82f6;
    }
    :host-context(body.light-theme) .select-search-container {
      background: #f1f5f9;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    }
    :host-context(body.light-theme) .select-search-input {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid rgba(0, 0, 0, 0.15);
    }
  `]
})
export class DealFormComponent implements OnInit {
  readonly store = inject(DealStore);
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  readonly dialogRef = inject(MatDialogRef<DealFormComponent>);
  readonly data = inject<any>(MAT_DIALOG_DATA, { optional: true });

  readonly isEdit = !!this.data && !!this.data.id;
  readonly users = signal<DropdownItem[]>([]);
  readonly companies = signal<DropdownItem[]>([]);
  readonly filteredCompanies = signal<DropdownItem[]>([]);

  readonly dealForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    company: [null, [Validators.required]],
    expected_revenue: [null],
    probability: [null, [Validators.min(0), Validators.max(100)]],
    stage: ['lead'],
    owner: [null],
    priority: ['medium'],
    risk: ['medium'],
    expected_close_date: [''],
    description: [''],
    internal_notes: ['']
  });

  ngOnInit(): void {
    // Load sales reps
    this.apiService.get<any[]>('/auth/team/').subscribe((res) => {
      this.users.set(res.map((u) => ({ id: u.id, name: u.full_name })));
    });

    // Load companies
    this.apiService.get<any>('/companies/', { page_size: 100 }).subscribe((res) => {
      const items = res.results.map((c: any) => ({ id: c.id, name: c.name }));
      this.companies.set(items);
      this.filteredCompanies.set(items);
      if (this.data && this.data.company) {
        this.dealForm.patchValue({ company: this.data.company });
      }
    });

    if (this.isEdit && this.data) {
      this.dealForm.patchValue({
        name: this.data.name,
        company: this.data.company,
        expected_revenue: this.data.expected_revenue,
        probability: this.data.probability,
        stage: this.data.stage,
        owner: this.data.owner || null,
        priority: this.data.priority,
        risk: this.data.risk,
        expected_close_date: this.data.expected_close_date || '',
        description: this.data.description || '',
        internal_notes: this.data.internal_notes || ''
      });
    }
  }

  onSubmit(): void {
    if (this.dealForm.invalid) return;

    const dealData = this.dealForm.value;
    if (!dealData.expected_close_date) {
      delete dealData.expected_close_date;
    }
    const callback = () => this.dialogRef.close();

    if (this.isEdit && this.data) {
      this.store.updateDeal(this.data.id, dealData, callback);
    } else {
      this.store.createDeal(dealData, callback);
    }
  }

  filterCompanies(event: Event): void {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    const all = this.companies();
    this.filteredCompanies.set(
      all.filter(c => c.name.toLowerCase().includes(query))
    );
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
}
