import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { MeetingService } from '../../core/services/meeting.service';
import { Meeting } from '../../core/models/crm.model';

export interface MeetingEditDialogData {
  meeting: Meeting;
}

@Component({
  selector: 'app-meeting-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="edit-dialog-container">
      <div class="dialog-header">
        <div class="header-title">
          <mat-icon class="header-icon">link</mat-icon>
          <div>
            <h2>Link Meeting to CRM</h2>
            <p class="subtitle">{{ data.meeting.title }}</p>
          </div>
        </div>
        <button mat-icon-button (click)="dialogRef.close()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content class="dialog-content">
        <!-- Meeting Info Snapshot -->
        <div class="meeting-snapshot">
          <div class="snapshot-row">
            <span class="label">Date & Time:</span>
            <span class="value">{{ data.meeting.start_time | date:'medium' }}</span>
          </div>
          @if (data.meeting.attendees?.length) {
            <div class="snapshot-row">
              <span class="label">Attendees:</span>
              <span class="value">
                @for (att of data.meeting.attendees; track att.email) {
                  <span class="attendee-chip">{{ att.displayName || att.email }}</span>
                }
              </span>
            </div>
          }
        </div>

        <form [formGroup]="form" class="edit-form">
          <!-- Company Autocomplete Field -->
          <div class="form-field-wrapper">
            <label class="input-label">Company / Account</label>
            <mat-form-field appearance="outline" class="full-width">
              <input
                matInput
                placeholder="Search company name..."
                formControlName="companySearch"
                [matAutocomplete]="autoCompany"
              />
              <mat-icon matSuffix class="search-suffix">business</mat-icon>
              <mat-autocomplete
                #autoCompany="matAutocomplete"
                [displayWith]="displayCompanyName"
                (optionSelected)="onCompanySelected($event)"
              >
                @for (comp of companyOptions(); track comp.id) {
                  <mat-option [value]="comp">
                    <div class="option-row">
                      <mat-icon class="option-icon">business</mat-icon>
                      <span class="option-name">{{ comp.name }}</span>
                    </div>
                  </mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          </div>

          <!-- Contact Autocomplete Field -->
          <div class="form-field-wrapper">
            <label class="input-label">Contact Person</label>
            <mat-form-field appearance="outline" class="full-width">
              <input
                matInput
                placeholder="Search contact name or email..."
                formControlName="contactSearch"
                [matAutocomplete]="autoContact"
              />
              <mat-icon matSuffix class="search-suffix">person</mat-icon>
              <mat-autocomplete
                #autoContact="matAutocomplete"
                [displayWith]="displayContactName"
                (optionSelected)="onContactSelected($event)"
              >
                @for (cont of contactOptions(); track cont.id) {
                  <mat-option [value]="cont">
                    <div class="option-row">
                      <mat-icon class="option-icon">person</mat-icon>
                      <div class="option-meta">
                        <span class="option-name">{{ cont.first_name }} {{ cont.last_name }}</span>
                        <span class="option-sub">{{ cont.email || cont.company_name }}</span>
                      </div>
                    </div>
                  </mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          </div>

          <!-- Action Hint & Unlink Option -->
          <div class="unlink-area">
            <button
              mat-button
              type="button"
              class="unlink-btn"
              (click)="unlinkAll()"
              [disabled]="!selectedCompanyId() && !selectedContactId()"
            >
              <mat-icon>link_off</mat-icon>
              <span>Detach CRM Entities (Set to Null)</span>
            </button>
            <span class="hint-text">If unlinked, this meeting remains in your calendar without attaching to any CRM timeline.</span>
          </div>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button (click)="dialogRef.close()" class="cancel-btn">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          (click)="saveAssociation()"
          [disabled]="saving()"
          class="save-btn"
        >
          @if (saving()) {
            <mat-spinner diameter="18"></mat-spinner>
          } @else {
            <mat-icon>check</mat-icon>
            Save Association
          }
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 85vh;
      overflow: hidden;
    }

    .edit-dialog-container {
      font-family: 'Inter', sans-serif;
      background-color: #0b1329;
      color: #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 85vh;
      box-sizing: border-box;
    }

    .dialog-header {
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.1rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }

    .header-icon {
      color: #3b82f6;
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .header-title h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .subtitle {
      margin: 0.2rem 0 0 0;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .close-btn {
      color: #94a3b8 !important;
    }

    .dialog-content {
      padding: 1.25rem 1.5rem !important;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto !important;
      margin: 0 !important;
    }

    .meeting-snapshot {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      font-size: 0.85rem;
    }

    .snapshot-row {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .snapshot-row .label {
      font-weight: 600;
      color: #64748b;
      min-width: 90px;
    }

    .snapshot-row .value {
      color: #cbd5e1;
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .attendee-chip {
      background: rgba(59, 130, 246, 0.12);
      color: #93c5fd;
      padding: 0.1rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      border: 1px solid rgba(59, 130, 246, 0.2);
    }

    .edit-form {
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
    }

    .form-field-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .input-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .full-width {
      width: 100%;
    }

    .search-suffix {
      color: #64748b;
    }

    .option-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .option-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #3b82f6;
    }

    .option-meta {
      display: flex;
      flex-direction: column;
    }

    .option-name {
      font-weight: 500;
      font-size: 0.9rem;
    }

    .option-sub {
      font-size: 0.75rem;
      color: #64748b;
    }

    .unlink-area {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding-top: 0.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .unlink-btn {
      align-self: flex-start;
      color: #f87171 !important;
      font-size: 0.8rem !important;
      padding: 0 0.5rem !important;
    }

    .unlink-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
    }

    .hint-text {
      font-size: 0.75rem;
      color: #64748b;
      margin-left: 0.5rem;
    }

    .dialog-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 0.85rem 1.5rem !important;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background-color: #0b1329;
      z-index: 10;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.25);
    }

    .cancel-btn {
      color: #94a3b8 !important;
    }

    .save-btn {
      font-weight: 600;
      border-radius: 8px;
    }

    /* ─── LIGHT THEME OVERRIDES ─── */
    :host-context(body.light-theme) .edit-dialog-container {
      background-color: #ffffff;
      color: #334155;
    }

    :host-context(body.light-theme) .dialog-header {
      background-color: #ffffff;
      border-bottom-color: #e2e8f0;
    }

    :host-context(body.light-theme) .header-title h2 {
      color: #0f172a;
    }

    :host-context(body.light-theme) .subtitle {
      color: #64748b;
    }

    :host-context(body.light-theme) .meeting-snapshot {
      background: #f8fafc;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .snapshot-row .value {
      color: #334155;
    }

    :host-context(body.light-theme) .attendee-chip {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }

    :host-context(body.light-theme) .input-label {
      color: #475569;
    }

    :host-context(body.light-theme) .unlink-area {
      border-top-color: #e2e8f0;
    }

    :host-context(body.light-theme) .dialog-actions {
      background-color: #ffffff;
      border-top-color: #e2e8f0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
    }

    :host-context(body.light-theme) .cancel-btn {
      color: #64748b !important;
    }
  `]
})
export class MeetingEditDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<MeetingEditDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly meetingService = inject(MeetingService);
  private readonly notification = inject(NotificationService);

  readonly data: MeetingEditDialogData = inject(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly companyOptions = signal<any[]>([]);
  readonly contactOptions = signal<any[]>([]);

  readonly selectedCompanyId = signal<string | null>(null);
  readonly selectedContactId = signal<string | null>(null);

  form!: FormGroup;

  ngOnInit(): void {
    const meeting = this.data.meeting;
    this.selectedCompanyId.set(meeting.company || null);
    this.selectedContactId.set(meeting.contact || null);

    this.form = this.fb.group({
      companySearch: [meeting.company_name ? { id: meeting.company, name: meeting.company_name } : ''],
      contactSearch: [meeting.contact_name ? { id: meeting.contact, first_name: meeting.contact_name, last_name: '' } : ''],
    });

    // Realtime company search
    this.form.get('companySearch')?.valueChanges.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((query) => {
        if (!query || typeof query === 'object') return of([]);
        return this.api.get<any[]>('/companies/', { search: query, page_size: 10 });
      })
    ).subscribe((res: any) => {
      this.companyOptions.set(res?.results || res || []);
    });

    // Realtime contact search
    this.form.get('contactSearch')?.valueChanges.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((query) => {
        if (!query || typeof query === 'object') return of([]);
        const params: any = { search: query, page_size: 10 };
        if (this.selectedCompanyId()) {
          params.company = this.selectedCompanyId();
        }
        return this.api.get<any[]>('/contacts/', params);
      })
    ).subscribe((res: any) => {
      this.contactOptions.set(res?.results || res || []);
    });
  }

  displayCompanyName(comp: any): string {
    return comp && comp.name ? comp.name : (typeof comp === 'string' ? comp : '');
  }

  displayContactName(cont: any): string {
    if (!cont) return '';
    if (typeof cont === 'string') return cont;
    return `${cont.first_name || ''} ${cont.last_name || ''}`.trim() || cont.email || '';
  }

  onCompanySelected(event: MatAutocompleteSelectedEvent): void {
    const comp = event.option.value;
    this.selectedCompanyId.set(comp.id);
  }

  onContactSelected(event: MatAutocompleteSelectedEvent): void {
    const cont = event.option.value;
    this.selectedContactId.set(cont.id);
    if (cont.company && !this.selectedCompanyId()) {
      this.selectedCompanyId.set(cont.company);
      this.form.patchValue({
        companySearch: { id: cont.company, name: cont.company_name },
      });
    }
  }

  unlinkAll(): void {
    this.selectedCompanyId.set(null);
    this.selectedContactId.set(null);
    this.form.patchValue({
      companySearch: '',
      contactSearch: '',
    });
  }

  saveAssociation(): void {
    this.saving.set(true);

    const payload: any = {
      company: this.selectedCompanyId(),
      contact: this.selectedContactId(),
    };

    this.meetingService.updateMeeting(this.data.meeting.id, payload).subscribe({
      next: (updatedMeeting) => {
        this.saving.set(false);
        this.notification.success('Meeting CRM associations updated successfully!');
        this.dialogRef.close(updatedMeeting);
      },
      error: (err: any) => {
        this.saving.set(false);
        this.notification.error(err?.error?.error || 'Failed to update meeting association.');
      },
    });
  }
}
