import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SelectionModel } from '@angular/cdk/collections';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CompanyStore } from '../services/company.store';
import { CompanyFormComponent } from '../company-form/company-form.component';
import { Company } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-company-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  template: `
    <div class="list-container">
      <div class="list-header">
        <div>
          <h1>Companies</h1>
          <p class="subtitle">Manage prospect and client accounts</p>
        </div>
        <button mat-flat-button color="primary" (click)="openCreateDialog()" class="create-btn">
          <mat-icon>add</mat-icon>
          <span>Add Company</span>
        </button>
      </div>

      <!-- Filters Bar -->
      <div class="filters-bar" [formGroup]="filterForm">
        <div class="search-field">
          <mat-icon>search</mat-icon>
          <input type="text" formControlName="search" placeholder="Search companies..." class="filter-input" />
        </div>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Stage</mat-label>
          <mat-select formControlName="stage">
            <mat-option value="">All Stages</mat-option>
            <mat-option value="cold">Cold</mat-option>
            <mat-option value="active_opportunity">Active Opportunity</mat-option>
            <mat-option value="current_client">Current Client</mat-option>
            <mat-option value="dead_opportunity">Dead Opportunity</mat-option>
            <mat-option value="do_not_prospect">Do Not Prospect</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Company Size</mat-label>
          <mat-select formControlName="company_size">
            <mat-option value="">All Sizes</mat-option>
            <mat-option value="1-10">1-10</mat-option>
            <mat-option value="11-50">11-50</mat-option>
            <mat-option value="51-100">51-100</mat-option>
            <mat-option value="101-200">101-200</mat-option>
            <mat-option value="201-500">201-500</mat-option>
            <mat-option value="500+">500+</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Sort by ICP Score</mat-label>
          <mat-select formControlName="ordering">
            <mat-option value="">Default Sort</mat-option>
            <mat-option value="icp_score">Score: Low to High</mat-option>
            <mat-option value="-icp_score">Score: High to Low</mat-option>
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

        <table mat-table [dataSource]="store.companies()" class="dark-table">
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
            <th mat-header-cell *matHeaderCellDef>Company Name</th>
            <td mat-cell *matCellDef="let element" class="clickable" [routerLink]="['/companies', element.id]">
              <div class="name-cell">
                <span class="company-name">{{ element.name }}</span>
                @if (element.website) {
                  <span class="website">{{ element.website }}</span>
                }
              </div>
            </td>
          </ng-container>

          <!-- Industry Column -->
          <ng-container matColumnDef="industry">
            <th mat-header-cell *matHeaderCellDef>Industry</th>
            <td mat-cell *matCellDef="let element">{{ element.industry || '—' }}</td>
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

          <!-- ICP Score Column -->
          <ng-container matColumnDef="icp_score">
            <th mat-header-cell *matHeaderCellDef>ICP Score</th>
            <td mat-cell *matCellDef="let element">
              @if (element.icp_score !== undefined && element.icp_score !== null) {
                <div class="icp-badge" [ngClass]="getIcpClass(element.icp_score)">
                  {{ element.icp_score }}
                </div>
              } @else {
                <span class="no-score">Not Scored</span>
              }
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
              <button mat-icon-button [routerLink]="['/companies', element.id]">
                <mat-icon>chevron_right</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        @if (!store.loading() && store.companies().length === 0) {
          <div class="empty-state">
            <mat-icon class="empty-icon">business</mat-icon>
            <h3>No companies found</h3>
            <p>Get started by creating a company or importing a CSV file.</p>
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
          <span>{{ selection.selected.length === 1 ? 'company' : 'companies' }} selected</span>
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

    .company-name {
      color: #f8fafc;
      font-weight: 600;
    }

    .website {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .clickable {
      cursor: pointer;
    }

    .clickable:hover .company-name {
      color: #3b82f6;
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

    .stage-badge.cold { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .stage-badge.active_opportunity { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .stage-badge.current_client { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .stage-badge.dead_opportunity { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .stage-badge.do_not_prospect { background: rgba(220, 38, 38, 0.2); color: #ef4444; }

    .icp-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.8rem;
    }

    .icp-badge.high { background-color: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .icp-badge.medium { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .icp-badge.low { background-color: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

    .no-score {
      font-size: 0.8rem;
      color: #475569;
      font-style: italic;
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
export class CompanyListComponent implements OnInit {
  readonly store = inject(CompanyStore);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly displayedColumns: string[] = ['select', 'name', 'industry', 'stage', 'icp_score', 'owner', 'actions'];
  selection = new SelectionModel<string>(true, []);

  readonly filterForm: FormGroup = this.fb.group({
    search: [''],
    stage: [''],
    company_size: [''],
    ordering: ['']
  });

  ngOnInit(): void {
    this.store.loadCompanies();

    // Listen to filter changes with debounce
    this.filterForm.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe((filters) => {
      this.selection.clear();
      this.store.loadCompanies(1, filters);
    });
  }

  onPageChange(event: PageEvent): void {
    this.selection.clear();
    this.store.loadCompanies(event.pageIndex + 1);
  }

  resetFilters(): void {
    this.filterForm.reset({
      search: '',
      stage: '',
      company_size: '',
      ordering: ''
    });
  }

  openCreateDialog(): void {
    this.dialog.open(CompanyFormComponent, {
      width: '560px',
      panelClass: 'dark-dialog-panel'
    });
  }

  getStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      cold: 'Cold',
      active_opportunity: 'Opportunity',
      current_client: 'Client',
      dead_opportunity: 'Dead',
      do_not_prospect: 'DNP'
    };
    return labels[stage] || stage;
  }

  getIcpClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.store.companies().length;
    return numSelected === numRows && numRows > 0;
  }

  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.store.companies().forEach(row => this.selection.select(row.id));
    }
  }

  bulkDelete(): void {
    const selectedIds = this.selection.selected;
    if (selectedIds.length === 0) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Companies',
        message: `Are you sure you want to delete the ${selectedIds.length} selected ${selectedIds.length === 1 ? 'company' : 'companies'}? This will also delete all associated contacts, deals, tasks, and notes. This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.bulkDeleteCompanies(selectedIds, () => {
          this.selection.clear();
          this.store.loadCompanies(this.store.page(), this.filterForm.value);
        });
      }
    });
  }
}
