import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ProspectListService } from '../services/prospect-list.service';
import { ProspectList } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SequenceEnrollDialogComponent } from '../../sequences/sequence-enroll-dialog/sequence-enroll-dialog.component';

@Component({
  selector: 'app-prospect-list-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatMenuModule,
    MatTooltipModule
  ],
  template: `
    <div class="list-container">
      <!-- Top Header -->
      <div class="list-header">
        <div>
          <h1>Prospect Lists</h1>
          <p class="subtitle">Manage, segment and organize lead lists for targeted sales outreach</p>
        </div>
        <button mat-flat-button color="primary" (click)="openCreateModal()" class="create-btn">
          <mat-icon>add</mat-icon>
          <span>Create Prospect List</span>
        </button>
      </div>

      <!-- Filters Bar -->
      <div class="filters-bar" [formGroup]="filterForm">
        <div class="search-field">
          <mat-icon>search</mat-icon>
          <input
            type="text"
            formControlName="search"
            placeholder="Search prospect lists by name or description..."
            class="filter-input"
          />
        </div>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Source</mat-label>
          <mat-select formControlName="source">
            <mat-option value="">All Sources</mat-option>
            <mat-option value="APOLLO">Apollo Export</mat-option>
            <mat-option value="CSV_IMPORT">CSV Import</mat-option>
            <mat-option value="MANUAL">Manual Creation</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-icon-button (click)="resetFilters()" matTooltip="Reset Filters" class="reset-btn">
          <mat-icon>filter_list_off</mat-icon>
        </button>
      </div>

      <!-- Data Table -->
      <div class="table-wrapper">
        <div *ngIf="loading" class="loading-overlay">
          <mat-spinner diameter="40"></mat-spinner>
        </div>

        <table mat-table [dataSource]="lists" class="dark-table">
          <!-- Name Column -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>List Name</th>
            <td mat-cell *matCellDef="let element" class="clickable" [routerLink]="['/lists', element.id]">
              <div class="name-cell">
                <span class="list-name-title">{{ element.name }}</span>
                <span *ngIf="element.description" class="list-desc">{{ element.description }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Source Column -->
          <ng-container matColumnDef="source">
            <th mat-header-cell *matHeaderCellDef>Source</th>
            <td mat-cell *matCellDef="let element">
              <span
                class="source-badge"
                [ngClass]="{
                  'apollo': element.source === 'APOLLO',
                  'csv': element.source === 'CSV_IMPORT',
                  'manual': element.source === 'MANUAL'
                }"
              >
                {{ element.source }}
              </span>
            </td>
          </ng-container>

          <!-- Companies Count -->
          <ng-container matColumnDef="company_count">
            <th mat-header-cell *matHeaderCellDef>Companies</th>
            <td mat-cell *matCellDef="let element">
              <span class="count-pill company-pill">
                <mat-icon class="pill-icon">business</mat-icon>
                {{ element.company_count }}
              </span>
            </td>
          </ng-container>

          <!-- Contacts Count -->
          <ng-container matColumnDef="contact_count">
            <th mat-header-cell *matHeaderCellDef>Contacts</th>
            <td mat-cell *matCellDef="let element">
              <span class="count-pill contact-pill">
                <mat-icon class="pill-icon">people</mat-icon>
                {{ element.contact_count }}
              </span>
            </td>
          </ng-container>

          <!-- Created At Column -->
          <ng-container matColumnDef="created_at">
            <th mat-header-cell *matHeaderCellDef>Created Date</th>
            <td mat-cell *matCellDef="let element" class="date-cell">
              {{ element.created_at | date:'mediumDate' }}
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let element" class="action-cell" (click)="$event.stopPropagation()">
              <button mat-icon-button (click)="openEnrollDialog(element)" matTooltip="Enroll Contacts in Sequence" style="color: #3b82f6;">
                <mat-icon>play_circle</mat-icon>
              </button>
              <button mat-icon-button [routerLink]="['/lists', element.id]" matTooltip="View List Details">
                <mat-icon>visibility</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="confirmDelete(element)" matTooltip="Delete List">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;" class="table-row"></tr>
        </table>

        <div *ngIf="!loading && lists.length === 0" class="empty-state">
          <mat-icon class="empty-icon">format_list_bulleted</mat-icon>
          <h3>No Prospect Lists Found</h3>
          <p>Create a list or import an Apollo CSV to start organizing target prospects.</p>
          <button mat-flat-button color="primary" (click)="openCreateModal()" class="create-btn" style="margin-top: 1rem;">
            <mat-icon>add</mat-icon>
            <span>Create First List</span>
          </button>
        </div>
      </div>

      <!-- Paginator -->
      <mat-paginator
        [length]="totalCount"
        [pageSize]="pageSize"
        [pageIndex]="pageIndex"
        (page)="onPageChange($event)"
        class="dark-paginator"
      ></mat-paginator>

      <!-- Create List Modal Dialog -->
      <div *ngIf="showCreateModal" class="modal-overlay" (click)="closeCreateModal()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>New Prospect List</h3>
            <button mat-icon-button (click)="closeCreateModal()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label>List Name *</label>
              <input
                type="text"
                [(ngModel)]="newList.name"
                placeholder="e.g. US Fintech Founders Q3"
                class="modal-input"
              />
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea
                [(ngModel)]="newList.description"
                rows="3"
                placeholder="Optional list target notes or summary..."
                class="modal-input"
              ></textarea>
            </div>

            <div class="form-group">
              <label>Source</label>
              <select [(ngModel)]="newList.source" class="modal-select">
                <option value="MANUAL">Manual Creation</option>
                <option value="APOLLO">Apollo Export</option>
                <option value="CSV_IMPORT">CSV Import</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div class="modal-footer">
            <button mat-button (click)="closeCreateModal()" class="cancel-btn">Cancel</button>
            <button
              mat-flat-button
              color="primary"
              (click)="saveNewList()"
              [disabled]="!newList.name.trim()"
              class="create-btn"
            >
              Create List
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .list-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
    }

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding: 0 0.5rem;
    }

    .list-header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
      letter-spacing: -0.025em;
    }

    .subtitle {
      color: #94a3b8;
      font-size: 0.875rem;
      margin: 0.25rem 0 0 0;
    }

    .create-btn {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border-radius: 8px;
      font-weight: 600;
      height: 40px;
    }

    .filters-bar {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      background-color: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
    }

    .search-field {
      display: flex;
      align-items: center;
      background-color: #141f38;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 0 0.75rem;
      flex: 1;
      height: 40px;
    }

    .search-field mat-icon {
      color: #64748b;
      margin-right: 0.5rem;
    }

    .filter-input {
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 0.875rem;
      outline: none;
      width: 100%;
    }

    .filter-input::placeholder {
      color: #64748b;
    }

    .filter-select {
      width: 180px;
      margin-bottom: -1.25em;
    }

    ::ng-deep .filter-select .mat-mdc-text-field-wrapper {
      background-color: #141f38 !important;
      height: 40px !important;
      border-radius: 8px !important;
    }

    ::ng-deep .filter-select .mat-mdc-form-field-flex {
      height: 40px !important;
      align-items: center !important;
    }

    .reset-btn {
      color: #64748b;
    }

    .reset-btn:hover {
      color: #f8fafc;
    }

    .table-wrapper {
      position: relative;
      flex: 1;
      overflow: auto;
      background-color: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px 12px 0 0;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(11, 19, 41, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10;
      backdrop-filter: blur(2px);
    }

    .dark-table {
      width: 100%;
      background: transparent;
    }

    ::ng-deep .dark-table th.mat-mdc-header-cell {
      background-color: #0b1329;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 1rem;
    }

    ::ng-deep .dark-table td.mat-mdc-cell {
      color: #cbd5e1;
      font-size: 0.875rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding: 1rem;
    }

    .table-row:hover {
      background-color: rgba(255, 255, 255, 0.02) !important;
    }

    .clickable {
      cursor: pointer;
    }

    .name-cell {
      display: flex;
      flex-direction: column;
    }

    .list-name-title {
      color: #f8fafc;
      font-weight: 600;
      font-size: 0.95rem;
    }

    .list-name-title:hover {
      color: #3b82f6;
    }

    .list-desc {
      color: #64748b;
      font-size: 0.75rem;
      margin-top: 0.15rem;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .source-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.025em;
    }

    .source-badge.apollo {
      background-color: rgba(14, 165, 233, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(14, 165, 233, 0.3);
    }

    .source-badge.csv {
      background-color: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .source-badge.manual {
      background-color: rgba(148, 163, 184, 0.15);
      color: #cbd5e1;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }

    .count-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .company-pill {
      background-color: rgba(99, 102, 241, 0.12);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }

    .contact-pill {
      background-color: rgba(16, 185, 129, 0.12);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .pill-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .date-cell {
      color: #64748b;
      font-size: 0.8rem;
    }

    .action-cell {
      text-align: right;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 5rem 1.5rem;
      color: #64748b;
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 1rem;
    }

    .empty-state h3 {
      color: #e2e8f0;
      margin: 0 0 0.5rem 0;
      font-size: 1.1rem;
    }

    .empty-state p {
      margin: 0;
      font-size: 0.9rem;
    }

    .dark-paginator {
      background-color: #0b1329 !important;
      color: #94a3b8 !important;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    /* Modal Overlay & Dialog */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .modal-card {
      background-color: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #1e293b;
    }

    .modal-header h3 {
      margin: 0;
      color: #f8fafc;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .modal-body {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-group label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }

    .modal-input, .modal-select {
      background-color: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      color: #f8fafc;
      font-size: 0.875rem;
      outline: none;
      width: 100%;
      font-family: inherit;
    }

    .modal-input:focus, .modal-select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid #1e293b;
      background-color: rgba(15, 23, 42, 0.5);
    }

    /* Light Mode Overrides */
    :host-context(body.light-theme) .list-container { color: #1e293b; }
    :host-context(body.light-theme) .list-header h1 { color: #0f172a; }
    :host-context(body.light-theme) .subtitle { color: #64748b; }
    :host-context(body.light-theme) .filters-bar { background-color: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) .search-field { background-color: #f8fafc; border-color: #cbd5e1; }
    :host-context(body.light-theme) .filter-input { color: #0f172a; }
    :host-context(body.light-theme) .table-wrapper { background-color: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) ::ng-deep .dark-table th.mat-mdc-header-cell { background-color: #f8fafc; color: #64748b; border-bottom-color: #e2e8f0; }
    :host-context(body.light-theme) ::ng-deep .dark-table td.mat-mdc-cell { color: #1e293b; border-bottom-color: #f1f5f9; }
    :host-context(body.light-theme) .list-name-title { color: #0f172a; }
    :host-context(body.light-theme) .dark-paginator { background-color: #ffffff !important; color: #64748b !important; border-top-color: #e2e8f0; }
    :host-context(body.light-theme) .modal-card { background-color: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) .modal-header h3 { color: #0f172a; }
    :host-context(body.light-theme) .modal-input, :host-context(body.light-theme) .modal-select { background-color: #f8fafc; border-color: #cbd5e1; color: #0f172a; }
  `]
})
export class ProspectListListComponent implements OnInit {
  private readonly prospectListService = inject(ProspectListService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  displayedColumns: string[] = ['name', 'source', 'company_count', 'contact_count', 'created_at', 'actions'];
  lists: ProspectList[] = [];
  loading = true;

  totalCount = 0;
  pageSize = 25;
  pageIndex = 0;

  showCreateModal = false;
  newList: {
    name: string;
    description: string;
    source: 'MANUAL' | 'APOLLO' | 'CSV_IMPORT' | 'OTHER';
  } = {
    name: '',
    description: '',
    source: 'MANUAL'
  };

  filterForm: FormGroup = this.fb.group({
    search: [''],
    source: ['']
  });

  ngOnInit(): void {
    this.loadLists();

    this.filterForm.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.pageIndex = 0;
        this.loadLists();
      });
  }

  loadLists(): void {
    this.loading = true;
    const formVals = this.filterForm.value;
    this.prospectListService.getProspectLists({
      search: formVals.search || undefined,
      source: formVals.source || undefined,
      page: this.pageIndex + 1,
      page_size: this.pageSize
    }).subscribe({
      next: (res: any) => {
        this.lists = res.results || [];
        this.totalCount = res.count || 0;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load prospect lists', err);
        this.loading = false;
      }
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLists();
  }

  resetFilters(): void {
    this.filterForm.reset({ search: '', source: '' });
  }

  openCreateModal(): void {
    this.newList = { name: '', description: '', source: 'MANUAL' };
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  saveNewList(): void {
    if (!this.newList.name.trim()) return;
    this.prospectListService.createProspectList(this.newList).subscribe({
      next: () => {
        this.closeCreateModal();
        this.loadLists();
      },
      error: (err: any) => alert(err.error?.detail || err.error?.name?.[0] || 'Failed to create list.')
    });
  }

  openEnrollDialog(list: ProspectList): void {
    this.dialog.open(SequenceEnrollDialogComponent, {
      width: '480px',
      data: {
        listId: list.id,
        listName: list.name
      }
    });
  }

  confirmDelete(list: ProspectList): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Prospect List',
        message: `Are you sure you want to delete prospect list '${list.name}'?`,
        confirmText: 'Delete',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.prospectListService.deleteProspectList(list.id).subscribe({
          next: () => this.loadLists(),
          error: () => alert('Failed to delete prospect list.')
        });
      }
    });
  }
}
