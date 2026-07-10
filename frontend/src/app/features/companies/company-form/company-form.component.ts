import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CompanyStore } from '../services/company.store';
import { Company } from '../../../core/models/crm.model';
import { ApiService } from '../../../core/services/api.service';

interface DropdownItem {
  id: string;
  name: string;
}

@Component({
  selector: 'app-company-form',
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
      <h2 mat-dialog-title>{{ isEdit ? 'Edit Company' : 'Add Company' }}</h2>
      
      <form [formGroup]="companyForm" (ngSubmit)="onSubmit()">
        <mat-dialog-content class="dialog-content">
          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Company Name</mat-label>
              <input matInput formControlName="name" placeholder="Acme Corporation" required>
              @if (companyForm.get('name')?.hasError('required') && companyForm.get('name')?.touched) {
                <mat-error>Name is required</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Website</mat-label>
              <input matInput formControlName="website" placeholder="https://acme.com">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Industry</mat-label>
              <input matInput formControlName="industry" placeholder="Cybersecurity">
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Company Size</mat-label>
              <mat-select formControlName="company_size">
                <mat-option value="">Select Size</mat-option>
                <mat-option value="1-10">1-10</mat-option>
                <mat-option value="11-50">11-50</mat-option>
                <mat-option value="51-200">51-200</mat-option>
                <mat-option value="201-500">201-500</mat-option>
                <mat-option value="500+">500+</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Country</mat-label>
              <input matInput formControlName="country" placeholder="United States">
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Stage</mat-label>
              <mat-select formControlName="stage">
                <mat-option value="cold">Cold</mat-option>
                <mat-option value="active_opportunity">Active Opportunity</mat-option>
                <mat-option value="current_client">Current Client</mat-option>
                <mat-option value="dead_opportunity">Dead Opportunity</mat-option>
                <mat-option value="do_not_prospect">Do Not Prospect</mat-option>
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
              <mat-label>LinkedIn URL</mat-label>
              <input matInput formControlName="linkedin_url" placeholder="https://linkedin.com/company/acme">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Apollo ID</mat-label>
              <input matInput formControlName="apollo_id" placeholder="Apollo ID">
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description</mat-label>
              <textarea matInput formControlName="description" rows="3" placeholder="Brief description of the company..."></textarea>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Tags (Comma separated)</mat-label>
              <input matInput formControlName="tags_input" placeholder="saas, key-account, enterprise">
            </mat-form-field>
          </div>
        </mat-dialog-content>

        <mat-dialog-actions align="end" class="dialog-actions">
          <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="companyForm.invalid || store.loading()">
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

    ::ng-deep .dark-dialog-panel .mat-mdc-dialog-container .mdc-dialog__surface {
      background-color: #0b1329 !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 12px !important;
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

    ::ng-deep .dialog-content .mat-mdc-form-field-focus-overlay {
      background-color: transparent !important;
    }

    .dialog-actions {
      padding: 1rem 1.5rem 1.5rem 1.5rem !important;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
  `]
})
export class CompanyFormComponent implements OnInit {
  readonly store = inject(CompanyStore);
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  readonly dialogRef = inject(MatDialogRef<CompanyFormComponent>);
  readonly data = inject<Company>(MAT_DIALOG_DATA, { optional: true });

  readonly isEdit = !!this.data;
  readonly users = signal<DropdownItem[]>([]);

  readonly companyForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    website: [''],
    industry: [''],
    company_size: [''],
    country: [''],
    stage: ['cold'],
    owner: [null],
    linkedin_url: [''],
    apollo_id: [''],
    description: [''],
    tags_input: ['']
  });

  ngOnInit(): void {
    // Load sales reps for dropdown selection
    this.apiService.get<any[]>('/auth/team/').subscribe((res) => {
      this.users.set(res.map((u) => ({ id: u.id, name: u.full_name })));
    });

    if (this.isEdit && this.data) {
      this.companyForm.patchValue({
        name: this.data.name,
        website: this.data.website || '',
        industry: this.data.industry || '',
        company_size: this.data.company_size || '',
        country: this.data.country || '',
        stage: this.data.stage,
        owner: this.data.owner || null,
        linkedin_url: this.data.linkedin_url || '',
        apollo_id: this.data.apollo_id || '',
        description: this.data.description || '',
        tags_input: this.data.tags ? this.data.tags.join(', ') : ''
      });
    }
  }

  onSubmit(): void {
    if (this.companyForm.invalid) return;

    const val = this.companyForm.value;
    const tags = val.tags_input
      ? val.tags_input.split(',').map((t: string) => t.trim()).filter((t: string) => !!t)
      : [];

    const companyData: Partial<Company> = {
      name: val.name,
      website: val.website,
      industry: val.industry,
      company_size: val.company_size || undefined,
      country: val.country,
      stage: val.stage,
      owner: val.owner,
      linkedin_url: val.linkedin_url,
      apollo_id: val.apollo_id || undefined,
      description: val.description,
      tags
    };

    const callback = () => this.dialogRef.close();

    if (this.isEdit && this.data) {
      this.store.updateCompany(this.data.id, companyData, callback);
    } else {
      this.store.createCompany(companyData, callback);
    }
  }
}
