import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { ImportJob, PaginatedResult } from '../../core/models/crm.model';

interface UploadResponse {
  import_job_id: string;
  file_name: string;
  total_rows: number;
  headers: string[];
  suggested_mapping: Record<string, string>;
  preview: Array<Record<string, any>>;
}

@Component({
  selector: 'app-import-center',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatButtonModule, MatSelectModule, MatProgressSpinnerModule],
  template: `
    <div class="imports-container">
      <div class="list-header">
        <div>
          <h1>Import Center</h1>
          <p class="subtitle">Upload and map CSV lists into companies and contacts</p>
        </div>
      </div>

      <div class="imports-grid">
        <!-- Upload Section -->
        <div class="card section-card">
          <div class="card-header">
            <mat-icon>cloud_upload</mat-icon>
            <h3>New CSV Import</h3>
          </div>
          <div class="card-body">
            @if (step() === 'upload') {
              <!-- Step 1: Upload File -->
              <form [formGroup]="uploadForm" (ngSubmit)="onUploadSubmit()">
                <div class="form-row">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Import Entity Type</mat-label>
                    <mat-select formControlName="entity_type">
                      <mat-option value="company">Companies Only</mat-option>
                      <mat-option value="contact">Contacts Only</mat-option>
                      <mat-option value="unified">Contacts & Companies (Unified)</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>

                <div class="file-drop-area" (click)="fileInput.click()">
                  <mat-icon class="upload-icon">upload_file</mat-icon>
                  <p *ngIf="!selectedFile()">Drag and drop CSV file here, or click to browse</p>
                  <p *ngIf="selectedFile()" class="file-name">{{ selectedFile()?.name }}</p>
                  <input #fileInput type="file" (change)="onFileSelected($event)" accept=".csv" style="display: none;" />
                </div>

                <button mat-flat-button color="primary" class="action-btn" type="submit" [disabled]="uploadForm.invalid || !selectedFile() || uploading()">
                  @if (uploading()) {
                    <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                    Upload CSV
                  }
                </button>
              </form>
            } @else if (step() === 'mapping' && uploadData()) {
              <!-- Step 2: Confirm Headers Mapping -->
              <div class="mapping-wizard">
                <h4>Map CSV Columns to CRM Fields</h4>
                <p class="preview-info">File: {{ uploadData()?.file_name }} ({{ uploadData()?.total_rows }} rows detected)</p>

                <div class="mapping-table-header">
                  <span>CRM Target Field</span>
                  <span>CSV Source Header</span>
                </div>

                <div class="mapping-rows">
                  @for (field of getTargetFields(); track field.key) {
                    <div class="mapping-row">
                      <div class="field-label">
                        {{ field.label }}
                        <span class="required-star" *ngIf="field.required">*</span>
                      </div>
                      <div class="mapping-select">
                        <select (change)="updateMapping(field.key, $event)" [value]="suggestedMapping()[field.key] || ''">
                          <option value="">-- Skip Field --</option>
                          @for (header of uploadData()?.headers; track header) {
                            <option [value]="header">{{ header }}</option>
                          }
                        </select>
                      </div>
                    </div>
                  }
                </div>

                <div class="mapping-actions">
                  <button mat-button (click)="cancelWizard()">Cancel</button>
                  <button mat-flat-button color="primary" (click)="confirmMapping()" [disabled]="processing()">
                    @if (processing()) {
                      <mat-spinner diameter="18"></mat-spinner>
                    } @else {
                      Confirm & Start Import
                    }
                  </button>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Import History Section -->
        <div class="card section-card">
          <div class="card-header">
            <mat-icon>history</mat-icon>
            <h3>Import Job History</h3>
            <button mat-icon-button (click)="loadHistory()" class="refresh-btn">
              <mat-icon>refresh</mat-icon>
            </button>
          </div>
          <div class="card-body scrollable-history">
            <div class="history-list">
              @for (job of jobs(); track job.id) {
                <div class="job-row-wrapper">
                  <div class="job-row" [class.clickable]="job.status === 'completed'" (click)="job.status === 'completed' && toggleJobDetails(job.id)">
                    <div class="job-info">
                      <div class="job-title">
                        {{ job.file_name }}
                        <mat-icon class="expand-chevron" *ngIf="job.status === 'completed'">
                          {{ expandedJobId() === job.id ? 'expand_less' : 'expand_more' }}
                        </mat-icon>
                      </div>
                      <div class="job-meta">
                        Type: {{ job.entity_type === 'unified' ? 'Contacts & Companies (Unified)' : (job.entity_type === 'contact' ? 'Contacts Only' : 'Companies Only') }} · {{ job.created_at | date:'short' }}
                      </div>
                    </div>
                    <div class="job-status-box">
                      <span class="status-badge" [ngClass]="job.status">
                        {{ job.status | uppercase }}
                      </span>
                      <div class="job-progress" *ngIf="job.status === 'processing'">
                        {{ job.progress_percent }}%
                      </div>
                      <div class="job-counts" *ngIf="job.status === 'completed'">
                        <span class="cnt green">S: {{ job.success_count }}</span>
                        <span class="cnt yellow">D: {{ job.duplicate_count }}</span>
                        <span class="cnt red">E: {{ job.error_count }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Collapsible records detail -->
                  <div class="job-details-panel" *ngIf="expandedJobId() === job.id" (click)="$event.stopPropagation()">
                    <div class="panel-header">
                      <h4>Import Warnings & Duplicates</h4>
                    </div>
                    @if (loadingRecords()) {
                      <div class="records-spinner">
                        <mat-spinner diameter="18"></mat-spinner>
                        <span>Loading records...</span>
                      </div>
                    } @else {
                      <div class="records-list">
                        @for (record of expandedJobRecords(); track record.id) {
                          <div class="record-detail-item" [ngClass]="record.status">
                            <span class="record-row-num">Row {{ record.row_number }}</span>
                            <span class="record-status-tag">{{ record.status | uppercase }}</span>
                            <span class="record-msg">{{ record.error_message || 'Duplicate item skipped.' }}</span>
                          </div>
                        }
                        @if (expandedJobRecords().length === 0) {
                          <div class="no-records-warn">
                            <mat-icon>check_circle</mat-icon>
                            <span>All rows imported successfully! No duplicates or errors.</span>
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
              @if (jobs().length === 0) {
                <div class="empty-feed">
                  <mat-icon>history</mat-icon>
                  <p>No past import sessions recorded.</p>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .imports-container {
      font-family: 'Inter', sans-serif;
      color: #cbd5e1;
    }

    .list-header {
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 0.25rem 0;
      color: #f8fafc;
      letter-spacing: -0.025em;
    }

    .subtitle {
      color: #64748b;
      margin: 0;
      font-size: 0.9rem;
    }

    .imports-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      align-items: start;
    }

    .card {
      background-color: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: center;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      background-color: #0b1329;
      color: #f8fafc;
    }

    .card-header mat-icon {
      color: #3b82f6;
      margin-right: 0.5rem;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .card-header h3 {
      font-size: 0.9rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }

    .refresh-btn {
      margin-left: auto;
      color: #64748b !important;
    }

    .card-body {
      padding: 1.5rem;
    }

    .full-width {
      width: 100%;
    }

    ::ng-deep .card-body .mat-mdc-text-field-wrapper {
      background-color: rgba(255, 255, 255, 0.02) !important;
    }

    .file-drop-area {
      border: 2px dashed rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 3rem 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #64748b;
      margin-bottom: 1.5rem;
      transition: all 0.2s;
    }

    .file-drop-area:hover {
      border-color: #3b82f6;
      background-color: rgba(59, 130, 246, 0.02);
      color: #94a3b8;
    }

    .upload-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      margin-bottom: 1rem;
    }

    .file-name {
      font-weight: 600;
      color: #34d399;
    }

    .action-btn {
      width: 100%;
      height: 42px !important;
      background-color: #3b82f6 !important;
      color: white !important;
      border-radius: 6px;
    }

    /* Mapping Wizard */
    .mapping-wizard h4 {
      margin: 0 0 0.5rem 0;
      color: #f8fafc;
    }

    .preview-info {
      font-size: 0.8rem;
      color: #64748b;
      margin-bottom: 1.5rem;
    }

    .mapping-table-header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .mapping-rows {
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 1.5rem;
    }

    .mapping-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding: 0.6rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      align-items: center;
    }

    .field-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: #cbd5e1;
    }

    .required-star {
      color: #ef4444;
      margin-left: 0.15rem;
    }

    .mapping-select select {
      background-color: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      color: #cbd5e1;
      font-size: 0.85rem;
      padding: 0.4rem 0.5rem;
      outline: none;
      width: 100%;
    }

    .mapping-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    /* History List */
    .scrollable-history {
      max-height: 480px;
      overflow-y: auto;
    }

    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .job-row-wrapper {
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      background-color: rgba(255, 255, 255, 0.01);
      overflow: hidden;
    }

    .job-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background-color: transparent;
      border: none;
      border-radius: 0;
    }

    .job-row.clickable {
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .job-row.clickable:hover {
      background-color: rgba(255, 255, 255, 0.02);
    }

    .expand-chevron {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-left: 0.25rem;
      vertical-align: middle;
      color: #64748b;
    }

    .job-details-panel {
      background-color: rgba(0, 0, 0, 0.15);
      border-top: 1px solid rgba(255, 255, 255, 0.03);
      padding: 0.75rem 1rem;
    }

    .panel-header h4 {
      font-size: 0.8rem;
      font-weight: 700;
      color: #94a3b8;
      margin: 0 0 0.5rem 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .records-spinner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      color: #64748b;
      font-size: 0.8rem;
    }

    .records-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      max-height: 200px;
      overflow-y: auto;
    }

    .record-detail-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.4rem 0.6rem;
      background-color: rgba(255, 255, 255, 0.02);
      border-radius: 4px;
      font-size: 0.8rem;
    }

    .record-detail-item.duplicate {
      border-left: 3px solid #fbbf24;
    }

    .record-detail-item.error {
      border-left: 3px solid #f87171;
    }

    .record-row-num {
      font-weight: 600;
      color: #94a3b8;
    }

    .record-status-tag {
      font-size: 0.6rem;
      font-weight: 800;
      padding: 0.1rem 0.25rem;
      border-radius: 3px;
    }

    .duplicate .record-status-tag {
      background-color: rgba(245, 158, 11, 0.1);
      color: #fbbf24;
    }

    .error .record-status-tag {
      background-color: rgba(239, 68, 68, 0.1);
      color: #f87171;
    }

    .record-msg {
      color: #cbd5e1;
      flex: 1;
    }

    .no-records-warn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      color: #34d399;
      font-size: 0.8rem;
    }

    .no-records-warn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #34d399;
    }

    .job-title {
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .job-meta {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .job-status-box {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
    }

    .status-badge {
      display: inline-block;
      font-size: 0.6rem;
      font-weight: 800;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }

    .status-badge.pending { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .status-badge.mapping { background: rgba(59, 130, 246, 0.1); color: #60a5fa; }
    .status-badge.processing { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .status-badge.completed { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .status-badge.failed { background: rgba(239, 68, 68, 0.15); color: #f87171; }

    .job-progress {
      font-size: 0.75rem;
      font-weight: 600;
      color: #fbbf24;
    }

    .job-counts {
      font-size: 0.7rem;
      display: flex;
      gap: 0.4rem;
    }

    .job-counts .cnt {
      font-weight: 700;
    }

    .job-counts .cnt.green { color: #34d399; }
    .job-counts .cnt.yellow { color: #fbbf24; }
    .job-counts .cnt.red { color: #f87171; }

    .empty-feed {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 3rem 1rem;
      color: #475569;
    }

    .empty-feed mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 0.5rem;
    }

    .empty-feed p {
      font-size: 0.85rem;
    }
  `]
})
export class ImportCenterComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);

  readonly step = signal<'upload' | 'mapping'>('upload');
  readonly selectedFile = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly processing = signal(false);
  
  readonly uploadData = signal<UploadResponse | null>(null);
  readonly suggestedMapping = signal<Record<string, string>>({});
  
  readonly jobs = signal<ImportJob[]>([]);
  readonly expandedJobId = signal<string | null>(null);
  readonly expandedJobRecords = signal<any[]>([]);
  readonly loadingRecords = signal(false);

  readonly uploadForm: FormGroup = this.fb.group({
    entity_type: ['company', [Validators.required]]
  });

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    this.apiService.get<PaginatedResult<ImportJob>>('/imports/').subscribe((res) => {
      this.jobs.set(res.results);
    });
  }

  toggleJobDetails(jobId: string): void {
    if (this.expandedJobId() === jobId) {
      this.expandedJobId.set(null);
      this.expandedJobRecords.set([]);
      return;
    }

    this.expandedJobId.set(jobId);
    this.loadingRecords.set(true);
    this.expandedJobRecords.set([]);

    this.apiService.get<any>(`/imports/${jobId}/records/`, { page_size: 100 }).subscribe({
      next: (res) => {
        const filtered = res.results.filter((r: any) => r.status === 'duplicate' || r.status === 'error');
        this.expandedJobRecords.set(filtered);
        this.loadingRecords.set(false);
      },
      error: () => {
        this.loadingRecords.set(false);
        this.notification.error('Failed to load import records');
      }
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile.set(file);
    }
  }

  onUploadSubmit(): void {
    const fileObj = this.selectedFile();
    if (this.uploadForm.invalid || !fileObj) return;

    this.uploading.set(true);
    const formData = new FormData();
    formData.append('file', fileObj);
    formData.append('entity_type', this.uploadForm.value.entity_type);

    this.apiService.post<UploadResponse>('/imports/upload/', formData).subscribe({
      next: (res) => {
        this.uploadData.set(res);
        this.suggestedMapping.set(res.suggested_mapping);
        this.step.set('mapping');
        this.uploading.set(false);
      },
      error: () => {
        this.uploading.set(false);
        this.notification.error('Failed to parse CSV file');
      }
    });
  }

  getTargetFields(): Array<{ key: string; label: string; required: boolean }> {
    const type = this.uploadForm.value.entity_type;
    if (type === 'company') {
      return [
        { key: 'name', label: 'Company Name', required: true },
        { key: 'website', label: 'Website URL', required: false },
        { key: 'industry', label: 'Industry', required: false },
        { key: 'company_size', label: 'Company Size (Size class)', required: false },
        { key: 'country', label: 'HQ Country', required: false },
        { key: 'linkedin_url', label: 'LinkedIn Company URL', required: false },
        { key: 'apollo_id', label: 'Apollo Organization ID', required: false },
        { key: 'description', label: 'Description', required: false }
      ];
    } else if (type === 'contact') {
      return [
        { key: 'first_name', label: 'First Name', required: true },
        { key: 'last_name', label: 'Last Name', required: true },
        { key: 'company_name', label: 'Company Name (Optional Link)', required: false },
        { key: 'email', label: 'Email Address', required: false },
        { key: 'phone', label: 'Phone Number', required: false },
        { key: 'job_title', label: 'Job Title', required: false },
        { key: 'department', label: 'Department', required: false },
        { key: 'timezone', label: 'Timezone', required: false },
        { key: 'country', label: 'Country', required: false },
        { key: 'linkedin_url', label: 'LinkedIn Profile URL', required: false },
        { key: 'apollo_id', label: 'Apollo Contact ID', required: false },
        { key: 'stage', label: 'Contact Stage', required: false }
      ];
    } else {
      return [
        { key: 'first_name', label: 'First Name', required: true },
        { key: 'last_name', label: 'Last Name', required: true },
        { key: 'company_name', label: 'Company Name', required: true },
        { key: 'company_website', label: 'Company Website URL', required: false },
        { key: 'company_industry', label: 'Company Industry', required: false },
        { key: 'company_size', label: 'Company Size (Size class)', required: false },
        { key: 'company_linkedin_url', label: 'Company LinkedIn URL', required: false },
        { key: 'company_description', label: 'Company Description', required: false },
        { key: 'email', label: 'Email Address', required: false },
        { key: 'phone', label: 'Phone Number', required: false },
        { key: 'job_title', label: 'Job Title', required: false },
        { key: 'department', label: 'Department', required: false },
        { key: 'timezone', label: 'Timezone', required: false },
        { key: 'country', label: 'Country', required: false },
        { key: 'linkedin_url', label: 'LinkedIn Profile URL', required: false },
        { key: 'apollo_id', label: 'Apollo Contact ID', required: false },
        { key: 'stage', label: 'Contact Stage', required: false }
      ];
    }
  }

  updateMapping(fieldKey: string, event: any): void {
    const val = event.target.value;
    this.suggestedMapping.update((mapping) => ({
      ...mapping,
      [fieldKey]: val
    }));
  }

  cancelWizard(): void {
    this.step.set('upload');
    this.selectedFile.set(null);
    this.uploadData.set(null);
  }

  confirmMapping(): void {
    const data = this.uploadData();
    if (!data) return;

    this.processing.set(true);
    this.apiService.post<{ message: string }>('/imports/process/', {
      import_job_id: data.import_job_id,
      column_mapping: this.suggestedMapping()
    }).subscribe({
      next: () => {
        this.processing.set(false);
        this.notification.success('Import started in the background.');
        this.cancelWizard();
        this.loadHistory();
      },
      error: (err) => {
        this.processing.set(false);
        const msg = err.error?.error?.message || 'Failed to start import';
        this.notification.error(msg);
      }
    });
  }
}
