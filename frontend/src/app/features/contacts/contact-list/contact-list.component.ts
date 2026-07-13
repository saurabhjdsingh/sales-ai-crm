import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SelectionModel } from '@angular/cdk/collections';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ContactStore } from '../services/contact.store';
import { ContactFormComponent } from '../contact-form/contact-form.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-contact-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  template: `
    <div class="list-container">
      <div class="list-header">
        <div>
          <h1>Contacts</h1>
          <p class="subtitle">Manage company representatives and leads</p>
        </div>
        <button mat-flat-button color="primary" (click)="openCreateDialog()" class="create-btn">
          <mat-icon>add</mat-icon>
          <span>Add Contact</span>
        </button>
      </div>

      <!-- Filters Bar -->
      <div class="filters-bar" [formGroup]="filterForm">
        <div class="search-field">
          <mat-icon>search</mat-icon>
          <input type="text" formControlName="search" placeholder="Search contacts by name, email..." class="filter-input" />
        </div>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Stage</mat-label>
          <mat-select formControlName="stage">
            <mat-option value="">All Stages</mat-option>
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
            <mat-option value="won">Won</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-icon-button (click)="resetFilters()" matTooltip="Reset Filters" class="reset-btn">
          <mat-icon>filter_list_off</mat-icon>
        </button>
      </div>

      <!-- Data Table -->
      <div class="table-wrapper">
        @if (store.loading()) {
          <div class="loading-overlay">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        }

        <table mat-table [dataSource]="store.contacts()" class="dark-table">
          <!-- Checkbox Column -->
          <ng-container matColumnDef="select">
            <th mat-header-cell *matHeaderCellDef class="checkbox-header-cell">
              <mat-checkbox (change)="$event ? masterToggle() : null"
                            [checked]="selection.hasValue() && isAllSelected()"
                            [indeterminate]="selection.hasValue() && !isAllSelected()"
                            color="primary">
              </mat-checkbox>
            </th>
            <td mat-cell *matCellDef="let element" class="checkbox-cell">
              <mat-checkbox (click)="$event.stopPropagation()"
                            (change)="$event ? selection.toggle(element.id) : null"
                            [checked]="selection.isSelected(element.id)"
                            color="primary">
              </mat-checkbox>
            </td>
          </ng-container>

          <!-- Name Column -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let element" class="clickable" [routerLink]="['/contacts', element.id]">
              <div class="name-cell">
                <span class="contact-name">{{ element.full_name }}</span>
                @if (element.job_title) {
                  <span class="job-title">{{ element.job_title }}</span>
                }
              </div>
            </td>
          </ng-container>

          <!-- Company Column -->
          <ng-container matColumnDef="company">
            <th mat-header-cell *matHeaderCellDef>Company</th>
            <td mat-cell *matCellDef="let element">
              <a [routerLink]="['/companies', element.company]" class="company-link">
                {{ element.company_name }}
              </a>
            </td>
          </ng-container>

          <!-- Email Column -->
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let element">{{ element.email || '—' }}</td>
          </ng-container>

          <!-- Stage Column -->
          <ng-container matColumnDef="stage">
            <th mat-header-cell *matHeaderCellDef>Stage</th>
            <td mat-cell *matCellDef="let element">
              <span class="stage-badge" [ngClass]="element.stage">
                {{ getStageLabel(element.stage) }}
              </span>
            </td>
          </ng-container>

          <!-- Owner Column -->
          <ng-container matColumnDef="owner">
            <th mat-header-cell *matHeaderCellDef>Owner</th>
            <td mat-cell *matCellDef="let element">
              {{ element.owner_detail?.name || 'Unassigned' }}
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let element" class="action-cell">
              <button mat-icon-button [routerLink]="['/contacts', element.id]">
                <mat-icon>chevron_right</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        @if (!store.loading() && store.contacts().length === 0) {
          <div class="empty-state">
            <mat-icon class="empty-icon">people</mat-icon>
            <h3>No contacts found</h3>
            <p>Get started by creating a contact record.</p>
          </div>
        }
      </div>

      <mat-paginator
        [length]="store.totalCount()"
        [pageSize]="25"
        [pageIndex]="store.page() - 1"
        (page)="onPageChange($event)"
        class="dark-paginator"
      ></mat-paginator>

      <!-- Bulk Actions Floating Banner -->
      <div class="bulk-actions-banner" *ngIf="selection.selected.length > 0">
        <div class="selection-info">
          <mat-icon class="info-icon">check_circle</mat-icon>
          <span class="count">{{ selection.selected.length }}</span>
          <span>{{ selection.selected.length === 1 ? 'contact' : 'contacts' }} selected</span>
        </div>
        <div class="actions">
          <button mat-flat-button color="warn" (click)="bulkDelete()" class="bulk-delete-btn">
            <mat-icon>delete</mat-icon>
            <span>Delete Selected</span>
          </button>
          <button mat-button (click)="selection.clear()" class="clear-btn">
            Cancel
          </button>
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

    .create-btn {
      background-color: #3b82f6 !important;
      color: white !important;
      border-radius: 6px;
      font-weight: 600;
    }

    .filters-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .search-field {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 0.25rem 0.75rem;
      flex: 1;
      min-width: 200px;
      height: 42px;
    }

    .search-field mat-icon {
      color: #64748b;
      margin-right: 0.5rem;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .filter-input {
      background: transparent;
      border: none;
      color: #f8fafc;
      outline: none;
      width: 100%;
      font-size: 0.9rem;
    }

    .filter-input::placeholder {
      color: #475569;
    }

    .filter-select {
      width: 180px;
      height: 48px;
    }

    ::ng-deep .filter-select .mat-mdc-text-field-wrapper {
      background-color: rgba(255, 255, 255, 0.03) !important;
      height: 42px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }

    ::ng-deep .filter-select .mat-mdc-form-field-flex {
      height: 42px !important;
      align-items: center !important;
    }

    ::ng-deep .filter-select .mat-mdc-form-field-infix {
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }

    .reset-btn {
      color: #64748b !important;
    }

    .reset-btn:hover {
      color: #f8fafc !important;
    }

    .table-wrapper {
      position: relative;
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      overflow: hidden;
      flex: 1;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.8);
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dark-table {
      width: 100%;
      background: transparent !important;
    }

    ::ng-deep .dark-table th.mat-mdc-header-cell {
      background-color: #0b1329 !important;
      color: #64748b !important;
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    }

    ::ng-deep .dark-table td.mat-mdc-cell {
      color: #cbd5e1 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03) !important;
      padding-top: 0.75rem;
      padding-bottom: 0.75rem;
      font-size: 0.9rem;
    }

    .checkbox-header-cell {
      width: 48px;
      padding-left: 1.5rem !important;
    }

    .checkbox-cell {
      width: 48px;
      padding-left: 1.5rem !important;
    }

    .name-cell {
      display: flex;
      flex-direction: column;
    }

    .contact-name {
      color: #f8fafc;
      font-weight: 600;
    }

    .job-title {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .clickable {
      cursor: pointer;
    }

    .clickable:hover .contact-name {
      color: #3b82f6;
      text-decoration: underline;
    }

    .company-link {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 500;
    }

    .company-link:hover {
      text-decoration: underline;
    }

    .stage-badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    /* Contact stages styling */
    .stage-badge.cold { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .stage-badge.approaching { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .stage-badge.replied { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .stage-badge.follow_up { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .stage-badge.interested { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .stage-badge.not_icp { background: rgba(100, 116, 139, 0.15); color: #94a3b8; }
    .stage-badge.not_interested { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .stage-badge.unresponsive { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
    .stage-badge.do_not_contact { background: rgba(220, 38, 38, 0.2); color: #ef4444; }
    .stage-badge.bad_data { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .stage-badge.changed_job { background: rgba(156, 163, 175, 0.15); color: #d1d5db; }
    .stage-badge.won { background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 700; }

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

    .bulk-actions-banner {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 12px;
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 2rem;
      z-index: 1000;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideUp {
      from {
        transform: translate(-50%, 2rem);
        opacity: 0;
      }
      to {
        transform: translate(-50%, 0);
        opacity: 1;
      }
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.95rem;
      color: #f8fafc;
    }

    .selection-info .count {
      font-weight: 700;
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.15);
      padding: 0.1rem 0.5rem;
      border-radius: 4px;
    }

    .info-icon {
      color: #3b82f6;
    }

    .bulk-actions-banner .actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .bulk-delete-btn {
      background-color: #ef4444 !important;
      color: white !important;
      border-radius: 6px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .bulk-delete-btn:hover {
      background-color: #dc2626 !important;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
    }

    .clear-btn {
      color: #94a3b8 !important;
    }

    .clear-btn:hover {
      color: #f8fafc !important;
    }
  `]
})
export class ContactListComponent implements OnInit {
  readonly store = inject(ContactStore);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  readonly displayedColumns: string[] = ['select', 'name', 'company', 'email', 'stage', 'owner', 'actions'];
  selection = new SelectionModel<string>(true, []);

  readonly filterForm: FormGroup = this.fb.group({
    search: [''],
    stage: ['']
  });

  ngOnInit(): void {
    this.store.loadContacts();

    this.filterForm.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe((filters) => {
      this.selection.clear();
      this.store.loadContacts(1, filters);
    });
  }

  onPageChange(event: PageEvent): void {
    this.selection.clear();
    this.store.loadContacts(event.pageIndex + 1);
  }

  resetFilters(): void {
    this.filterForm.reset({
      search: '',
      stage: ''
    });
  }

  openCreateDialog(): void {
    this.dialog.open(ContactFormComponent, {
      width: '560px',
      panelClass: 'dark-dialog-panel'
    });
  }

  getStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      cold: 'Cold',
      approaching: 'Approaching',
      replied: 'Replied',
      follow_up: 'Follow Up',
      interested: 'Interested',
      not_icp: 'Not ICP',
      not_interested: 'Not Interested',
      unresponsive: 'Unresponsive',
      do_not_contact: 'DNC',
      bad_data: 'Bad Data',
      changed_job: 'Job Changed',
      won: 'Won'
    };
    return labels[stage] || stage;
  }

  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.store.contacts().length;
    return numSelected === numRows && numRows > 0;
  }

  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.store.contacts().forEach(row => this.selection.select(row.id));
    }
  }

  bulkDelete(): void {
    const selectedIds = this.selection.selected;
    if (selectedIds.length === 0) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Contacts',
        message: `Are you sure you want to delete the ${selectedIds.length} selected ${selectedIds.length === 1 ? 'contact' : 'contacts'}? This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.bulkDeleteContacts(selectedIds, () => {
          this.selection.clear();
          this.store.loadContacts(this.store.page(), this.filterForm.value);
        });
      }
    });
  }
}
