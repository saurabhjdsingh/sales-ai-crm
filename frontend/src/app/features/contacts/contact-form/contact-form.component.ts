import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ContactStore } from '../services/contact.store';
import { Contact } from '../../../core/models/crm.model';
import { ApiService } from '../../../core/services/api.service';

interface DropdownItem {
  id: string;
  name: string;
}

@Component({
  selector: 'app-contact-form',
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
      <h2 mat-dialog-title>{{ isEdit ? 'Edit Contact' : 'Add Contact' }}</h2>

      <form [formGroup]="contactForm" (ngSubmit)="onSubmit()">
        <mat-dialog-content class="dialog-content">
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>First Name</mat-label>
              <input matInput formControlName="first_name" placeholder="John" required>
              @if (contactForm.get('first_name')?.hasError('required') && contactForm.get('first_name')?.touched) {
                <mat-error>First name is required</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Last Name</mat-label>
              <input matInput formControlName="last_name" placeholder="Doe" required>
              @if (contactForm.get('last_name')?.hasError('required') && contactForm.get('last_name')?.touched) {
                <mat-error>Last name is required</mat-error>
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
              @if (contactForm.get('company')?.hasError('required') && contactForm.get('company')?.touched) {
                <mat-error>Company is required</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Email Address</mat-label>
              <input matInput type="email" formControlName="email" placeholder="john.doe@company.com">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Phone Number</mat-label>
              <input matInput formControlName="phone" placeholder="+1 (555) 000-0000">
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Job Title</mat-label>
              <input matInput formControlName="job_title" placeholder="CISO / Security Engineer">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Department</mat-label>
              <input matInput formControlName="department" placeholder="Information Security">
            </mat-form-field>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Timezone</mat-label>
              <input matInput formControlName="timezone" placeholder="America/New_York">
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
                <mat-option value="approaching">Approaching</mat-option>
                <mat-option value="replied">Replied</mat-option>
                <mat-option value="follow_up">Follow Up</mat-option>
                <mat-option value="interested">Interested</mat-option>
                <mat-option value="not_icp">Not ICP</mat-option>
                <mat-option value="not_interested">Not Interested</mat-option>
                <mat-option value="unresponsive">Unresponsive</mat-option>
                <mat-option value="do_not_contact">Do Not Contact</mat-option>
                <mat-option value="bad_data">Bad Data</mat-option>
                <mat-option value="changed_job">Changed Job</mat-option>
                <mat-option value="on_hold">On-Hold</mat-option>
                <mat-option value="won">Won</mat-option>
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
              <input matInput formControlName="linkedin_url" placeholder="https://linkedin.com/in/johndoe">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Apollo ID</mat-label>
              <input matInput formControlName="apollo_id" placeholder="Apollo Contact ID">
            </mat-form-field>
          </div>
        </mat-dialog-content>

        <mat-dialog-actions align="end" class="dialog-actions">
          <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="contactForm.invalid || store.loading()">
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
export class ContactFormComponent implements OnInit {
  readonly store = inject(ContactStore);
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  readonly dialogRef = inject(MatDialogRef<ContactFormComponent>);
  readonly data = inject<any>(MAT_DIALOG_DATA, { optional: true });

  readonly isEdit = !!this.data && !!this.data.id; // It's an edit if data has id
  readonly users = signal<DropdownItem[]>([]);
  readonly companies = signal<DropdownItem[]>([]);
  readonly filteredCompanies = signal<DropdownItem[]>([]);

  readonly contactForm: FormGroup = this.fb.group({
    first_name: ['', [Validators.required]],
    last_name: ['', [Validators.required]],
    company: [null, [Validators.required]],
    email: [''],
    phone: [''],
    job_title: [''],
    department: [''],
    timezone: [''],
    country: [''],
    stage: ['cold'],
    owner: [null],
    linkedin_url: [''],
    apollo_id: ['']
  });

  ngOnInit(): void {
    // Load sales reps for dropdown selection
    this.apiService.get<any[]>('/auth/team/').subscribe((res) => {
      this.users.set(res.map((u) => ({ id: u.id, name: u.full_name })));
    });

    // Load companies list
    this.apiService.get<any>('/companies/', { page_size: 100 }).subscribe((res) => {
      const items = res.results.map((c: any) => ({ id: c.id, name: c.name }));
      this.companies.set(items);
      this.filteredCompanies.set(items);
      
      // If we are creating from a company page, pre-select that company
      if (this.data && this.data.company) {
        this.contactForm.patchValue({ company: this.data.company });
      }
    });

    if (this.isEdit && this.data) {
      this.contactForm.patchValue({
        first_name: this.data.first_name,
        last_name: this.data.last_name,
        company: this.data.company,
        email: this.data.email || '',
        phone: this.data.phone || '',
        job_title: this.data.job_title || '',
        department: this.data.department || '',
        timezone: this.data.timezone || '',
        country: this.data.country || '',
        stage: this.data.stage,
        owner: this.data.owner || null,
        linkedin_url: this.data.linkedin_url || '',
        apollo_id: this.data.apollo_id || ''
      });
    }
  }

  onSubmit(): void {
    if (this.contactForm.invalid) return;

    const contactData = this.contactForm.value;
    const callback = () => this.dialogRef.close();

    if (this.isEdit && this.data) {
      this.store.updateContact(this.data.id, contactData, callback);
    } else {
      this.store.createContact(contactData, callback);
    }
  }

  filterCompanies(event: Event): void {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    const all = this.companies();
    this.filteredCompanies.set(
      all.filter(c => c.name.toLowerCase().includes(query))
    );
  }
}
