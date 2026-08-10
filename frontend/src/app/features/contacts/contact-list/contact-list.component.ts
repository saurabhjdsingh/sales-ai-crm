import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
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

import { MatTooltipModule } from '@angular/material/tooltip';
import { SequenceEnrollDialogComponent } from '../../sequences/sequence-enroll-dialog/sequence-enroll-dialog.component';
import { ProspectListAddDialogComponent } from '../../prospect-lists/prospect-list-add-dialog/prospect-list-add-dialog.component';
import { AdvanceFilterDrawerComponent, AdvanceFilterState } from '../../../shared/components/advance-filter-drawer/advance-filter-drawer.component';

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
    MatOptionModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatTooltipModule,
    AdvanceFilterDrawerComponent
  ],
  template: `
    <div class="list-container">
      <div class="list-header">
        <div>
          <h1>Contacts</h1>
          <p class="subtitle">Manage company representatives and leads</p>
        </div>
        <div class="header-actions">
          <button mat-stroked-button (click)="isDrawerOpen = true" class="adv-filter-btn">
            <mat-icon class="btn-icon">tune</mat-icon>
            <span>Advance Filters</span>
            <span *ngIf="activeAdvanceFilterCount > 0" class="filter-count-badge">
              {{ activeAdvanceFilterCount }}
            </span>
          </button>

          <button mat-flat-button color="primary" (click)="openCreateDialog()" class="create-btn">
            <mat-icon>add</mat-icon>
            <span>Add Contact</span>
          </button>
        </div>
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
            <mat-option value="on_hold">On-Hold</mat-option>
            <mat-option value="won">Won</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Company Size</mat-label>
          <mat-select formControlName="company_size">
            <mat-option value="">All Sizes</mat-option>
            <mat-option value="1-10">1-10 employees</mat-option>
            <mat-option value="11-50">11-50 employees</mat-option>
            <mat-option value="51-100">51-100 employees</mat-option>
            <mat-option value="101-200">101-200 employees</mat-option>
            <mat-option value="201-500">201-500 employees</mat-option>
            <mat-option value="500+">500+ employees</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Sort Contacts</mat-label>
          <mat-select formControlName="ordering">
            <mat-option value="">Newest First</mat-option>
            <mat-option value="last_name">Last Name (A-Z)</mat-option>
            <mat-option value="-last_name">Last Name (Z-A)</mat-option>
            <mat-option value="-created_at">Creation Date</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-icon-button (click)="resetFilters()" matTooltip="Reset Filters" class="reset-btn">
          <mat-icon>filter_list_off</mat-icon>
        </button>
      </div>

      <!-- Active Filter Badges -->
      <div *ngIf="activeAdvanceFilterCount > 0" class="flex flex-wrap gap-2 px-2 pb-2">
        <span *ngIf="advanceFilters.list" class="inline-flex items-center text-xs px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
          📋 List: {{ advanceFilters.list === 'no_list' ? 'Unassigned' : advanceFilters.list }}
        </span>
        <span *ngIf="advanceFilters.country" class="inline-flex items-center text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
          🌐 Country: {{ advanceFilters.country === 'no_country' ? 'Unassigned' : advanceFilters.country }}
        </span>
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

          <!-- Country Column -->
          <ng-container matColumnDef="country">
            <th mat-header-cell *matHeaderCellDef>Country</th>
            <td mat-cell *matCellDef="let element">
              <span *ngIf="element.country" class="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                🌐 {{ element.country_display || element.country }}
              </span>
              <span *ngIf="!element.country" class="text-slate-500">—</span>
            </td>
          </ng-container>

          <!-- Lists Column -->
          <ng-container matColumnDef="lists">
            <th mat-header-cell *matHeaderCellDef>Prospect Lists</th>
            <td mat-cell *matCellDef="let element">
              <div class="flex flex-wrap gap-1">
                <span *ngFor="let list of (element.lists || [])" class="inline-flex items-center text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  📋 {{ list.name }}
                </span>
                <span *ngIf="!element.lists || element.lists.length === 0" class="text-slate-500">—</span>
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

          <!-- Company Size Column -->
          <ng-container matColumnDef="company_size">
            <th mat-header-cell *matHeaderCellDef>Size</th>
            <td mat-cell *matCellDef="let element">
              <span style="font-size: 0.825rem; color: #94a3b8;">{{ element.company_size || '—' }}</span>
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

          <!-- Sequence Status Column -->
          <ng-container matColumnDef="sequence_status">
            <th mat-header-cell *matHeaderCellDef>Sequence</th>
            <td mat-cell *matCellDef="let element">
              <span
                class="seq-status-pill"
                [ngClass]="element.sequence_status || 'not_enrolled'"
                [matTooltip]="element.sequence_name ? ('Sequence: ' + element.sequence_name) : getSeqStatusTooltip(element.sequence_status)"
                [routerLink]="element.sequence_id ? ['/sequences', element.sequence_id] : null"
                [class.clickable]="!!element.sequence_id"
                (click)="element.sequence_id ? $event.stopPropagation() : null"
              >
                <span class="pill-dot"></span>
                <span class="pill-label">{{ getSeqStatusLabel(element.sequence_status) }}</span>
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
            <p>Add a contact or change filters.</p>
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
          <button mat-flat-button color="primary" (click)="openBulkEnrollDialog()" class="bulk-enroll-btn">
            <mat-icon>play_circle</mat-icon>
            <span>Enroll in Sequence</span>
          </button>
          <button mat-flat-button (click)="openBulkAddToListDialog()" class="bulk-list-btn">
            <mat-icon>playlist_add</mat-icon>
            <span>Add to List</span>
          </button>
          <button mat-flat-button color="warn" (click)="bulkDelete()" class="bulk-delete-btn">
            <mat-icon>delete</mat-icon>
            <span>Delete Selected</span>
          </button>
          <button mat-button (click)="selection.clear()" class="clear-btn">
            Cancel
          </button>
        </div>
      </div>

      <!-- Advance Filter Drawer -->
      <app-advance-filter-drawer
        [(isOpen)]="isDrawerOpen"
        entityType="contact"
        [initialFilters]="advanceFilters"
        (filtersApplied)="onAdvanceFiltersApplied($event)"
      ></app-advance-filter-drawer>
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
      width: 170px;
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

    .clickable {
      cursor: pointer;
    }

    .name-cell {
      display: flex;
      flex-direction: column;
    }

    .contact-name {
      color: #f8fafc;
      font-weight: 600;
    }

    .contact-name:hover {
      color: #3b82f6;
    }

    .job-title {
      color: #64748b;
      font-size: 0.75rem;
    }

    .company-link {
      color: #cbd5e1;
      text-decoration: none;
    }

    .company-link:hover {
      color: #3b82f6;
      text-decoration: underline;
    }

    .stage-badge {
      display: inline-block;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: capitalize;
    }

    .stage-badge.cold { background-color: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); }
    .stage-badge.approaching { background-color: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
    .stage-badge.replied { background-color: rgba(168, 85, 247, 0.1); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.2); }
    .stage-badge.interested { background-color: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); }
    .stage-badge.won { background-color: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700; }
    .stage-badge.not_interested, .stage-badge.unresponsive { background-color: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }

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
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 16px;
      padding: 0.625rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      z-index: 1000;
      box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.04);
      animation: bannerSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
    }

    @keyframes bannerSlideUp {
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #e2e8f0;
      padding-right: 0.5rem;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      margin-right: 0.25rem;
    }

    .selection-info .count {
      font-weight: 700;
      color: #60a5fa;
      background: rgba(59, 130, 246, 0.15);
      padding: 0.15rem 0.55rem;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .info-icon {
      color: #60a5fa;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .bulk-enroll-btn,
    .bulk-list-btn,
    .bulk-delete-btn {
      display: inline-flex !important;
      align-items: center !important;
      gap: 0.375rem !important;
      height: 34px !important;
      padding: 0 0.875rem !important;
      border-radius: 8px !important;
      font-weight: 600 !important;
      font-size: 0.8rem !important;
      letter-spacing: 0.01em !important;
      border: none !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      white-space: nowrap !important;
    }

    .bulk-enroll-btn ::ng-deep .mat-icon,
    .bulk-list-btn ::ng-deep .mat-icon,
    .bulk-delete-btn ::ng-deep .mat-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      margin: 0 !important;
    }

    .bulk-enroll-btn {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
      color: #ffffff !important;
      box-shadow: 0 2px 8px -2px rgba(59, 130, 246, 0.4) !important;
    }
    .bulk-enroll-btn:hover {
      background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%) !important;
      box-shadow: 0 4px 12px -2px rgba(59, 130, 246, 0.5) !important;
    }

    .bulk-list-btn {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%) !important;
      color: #ffffff !important;
      box-shadow: 0 2px 8px -2px rgba(124, 58, 237, 0.4) !important;
    }
    .bulk-list-btn:hover {
      background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%) !important;
      box-shadow: 0 4px 12px -2px rgba(124, 58, 237, 0.5) !important;
    }

    .bulk-delete-btn {
      background: rgba(239, 68, 68, 0.12) !important;
      color: #f87171 !important;
      border: 1px solid rgba(239, 68, 68, 0.25) !important;
      box-shadow: none !important;
    }
    .bulk-delete-btn:hover {
      background: rgba(239, 68, 68, 0.2) !important;
      color: #fca5a5 !important;
      border-color: rgba(239, 68, 68, 0.4) !important;
    }

    .clear-btn {
      color: #64748b !important;
      font-size: 0.8rem !important;
      font-weight: 500 !important;
      min-width: auto !important;
      padding: 0 0.5rem !important;
    }
    .clear-btn:hover {
      color: #94a3b8 !important;
    }

    .seq-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .seq-status-pill .pill-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .seq-status-pill.completed { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .seq-status-pill.completed .pill-dot { background-color: #34d399; }
    .seq-status-pill.active { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .seq-status-pill.active .pill-dot { background-color: #60a5fa; }
    .seq-status-pill.action_required { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .seq-status-pill.action_required .pill-dot { background-color: #fbbf24; }
    .seq-status-pill.not_enrolled { background: rgba(100, 116, 139, 0.1); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.2); }
    .seq-status-pill.not_enrolled .pill-dot { background-color: #64748b; }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .adv-filter-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.5rem !important;
      height: 40px !important;
      padding: 0 1rem !important;
      border-radius: 8px !important;
      font-weight: 600 !important;
      font-size: 0.875rem !important;
      background-color: #1e293b !important;
      color: #f8fafc !important;
      border: 1px solid #334155 !important;
      transition: all 0.2s ease-in-out !important;
    }

    .adv-filter-btn:hover {
      background-color: #334155 !important;
      border-color: #475569 !important;
    }

    .adv-filter-btn .btn-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      margin: 0 !important;
      color: #3b82f6 !important;
    }

    .filter-count-badge {
      background-color: #3b82f6;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.1rem 0.45rem;
      border-radius: 9999px;
      margin-left: 0.25rem;
    }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .list-container { color: #1e293b; }
    :host-context(body.light-theme) .list-header h1 { color: #0f172a; }
    :host-context(body.light-theme) .subtitle { color: #64748b; }
    :host-context(body.light-theme) .adv-filter-btn {
      background-color: #ffffff !important;
      color: #0f172a !important;
      border: 1px solid #cbd5e1 !important;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
    }
    :host-context(body.light-theme) .adv-filter-btn:hover {
      background-color: #f8fafc !important;
      border-color: #94a3b8 !important;
    }
    :host-context(body.light-theme) .adv-filter-btn .btn-icon {
      color: #2563eb !important;
    }
    :host-context(body.light-theme) .filters-bar { background-color: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) .search-field { background-color: #f8fafc; border-color: #cbd5e1; }
    :host-context(body.light-theme) .filter-input { color: #0f172a; }
    :host-context(body.light-theme) ::ng-deep .filter-select .mat-mdc-text-field-wrapper { background-color: #f8fafc !important; }
    :host-context(body.light-theme) .table-wrapper { background-color: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) ::ng-deep .dark-table th.mat-mdc-header-cell { background-color: #f8fafc; color: #64748b; border-bottom-color: #e2e8f0; }
    :host-context(body.light-theme) ::ng-deep .dark-table td.mat-mdc-cell { color: #1e293b; border-bottom-color: #f1f5f9; }
    :host-context(body.light-theme) .contact-name { color: #0f172a; }
    :host-context(body.light-theme) .dark-paginator { background-color: #ffffff !important; color: #64748b !important; border-top-color: #e2e8f0; }

    :host-context(body.light-theme) .bulk-actions-banner {
      background: rgba(255, 255, 255, 0.95);
      border-color: #e2e8f0;
      box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
    }
    :host-context(body.light-theme) .selection-info {
      color: #1e293b;
      border-right-color: #e2e8f0;
    }
    :host-context(body.light-theme) .selection-info .count {
      color: #2563eb;
      background: rgba(37, 99, 235, 0.1);
    }
    :host-context(body.light-theme) .info-icon { color: #2563eb; }
    :host-context(body.light-theme) .bulk-enroll-btn {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
      color: #ffffff !important;
      box-shadow: 0 2px 8px -2px rgba(37, 99, 235, 0.35) !important;
    }
    :host-context(body.light-theme) .bulk-enroll-btn:hover {
      background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%) !important;
    }
    :host-context(body.light-theme) .bulk-list-btn {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%) !important;
      color: #ffffff !important;
      box-shadow: 0 2px 8px -2px rgba(109, 40, 217, 0.35) !important;
    }
    :host-context(body.light-theme) .bulk-list-btn:hover {
      background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%) !important;
    }
    :host-context(body.light-theme) .bulk-delete-btn {
      background: rgba(239, 68, 68, 0.08) !important;
      color: #dc2626 !important;
      border: 1px solid rgba(239, 68, 68, 0.2) !important;
    }
    :host-context(body.light-theme) .bulk-delete-btn:hover {
      background: rgba(239, 68, 68, 0.15) !important;
      color: #b91c1c !important;
    }
    :host-context(body.light-theme) .clear-btn { color: #64748b !important; }
    :host-context(body.light-theme) .clear-btn:hover { color: #475569 !important; }
  `]
})
export class ContactListComponent implements OnInit {
  readonly store = inject(ContactStore);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  readonly displayedColumns: string[] = ['select', 'name', 'country', 'lists', 'company', 'company_size', 'email', 'stage', 'sequence_status', 'owner', 'actions'];
  selection = new SelectionModel<string>(true, []);

  isDrawerOpen = false;
  advanceFilters: AdvanceFilterState = {};

  readonly filterForm: FormGroup = this.fb.group({
    search: [''],
    stage: [''],
    company_size: [''],
    ordering: ['']
  });

  get activeAdvanceFilterCount(): number {
    let count = 0;
    if (this.advanceFilters.list) count++;
    if (this.advanceFilters.country) count++;
    if (this.advanceFilters.stage) count++;
    if (this.advanceFilters.company_size) count++;
    return count;
  }

  ngOnInit(): void {
    this.store.loadContacts();

    this.filterForm.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe((formValues) => {
      this.applyAllFilters(formValues);
    });
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
      this.store.contacts().forEach((row) => this.selection.select(row.id));
    }
  }

  onAdvanceFiltersApplied(filters: AdvanceFilterState): void {
    this.advanceFilters = filters;
    this.applyAllFilters(this.filterForm.value);
  }

  private applyAllFilters(formValues: any): void {
    this.selection.clear();
    const combinedParams: any = {
      search: formValues.search || undefined,
      stage: this.advanceFilters.stage || formValues.stage || undefined,
      company_size: this.advanceFilters.company_size || formValues.company_size || undefined,
      ordering: formValues.ordering || undefined,
      list: this.advanceFilters.list || undefined,
      country: this.advanceFilters.country || undefined,
    };
    this.store.loadContacts(1, combinedParams);
  }

  onPageChange(event: PageEvent): void {
    this.selection.clear();
    this.store.loadContacts(event.pageIndex + 1);
  }

  resetFilters(): void {
    this.filterForm.reset({
      search: '',
      stage: '',
      company_size: '',
      ordering: ''
    });
    this.advanceFilters = {};
    this.store.loadContacts(1);
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
      do_not_contact: 'Do Not Contact',
      bad_data: 'Bad Data',
      changed_job: 'Changed Job',
      on_hold: 'On-Hold',
      won: 'Won'
    };
    return labels[stage] || stage;
  }

  getSeqStatusLabel(status?: string): string {
    switch (status) {
      case 'completed': return 'Completed';
      case 'active': return 'Enrolled';
      case 'action_required': return 'Action Req.';
      default: return 'Not Enrolled';
    }
  }

  getSeqStatusTooltip(status?: string): string {
    switch (status) {
      case 'completed': return 'Completed or finished all steps';
      case 'active': return 'Actively running sequence';
      case 'action_required': return 'Waiting for rep task or AI approval';
      default: return 'Not enrolled in any sequence';
    }
  }

  openBulkEnrollDialog(): void {
    const contactIds = [...this.selection.selected];
    if (!contactIds.length) return;

    const dialogRef = this.dialog.open(SequenceEnrollDialogComponent, {
      width: '640px',
      panelClass: 'dark-dialog-panel',
      data: { contactIds }
    });

    dialogRef.afterClosed().subscribe((enrolled) => {
      if (enrolled) {
        this.selection.clear();
        this.store.loadContacts();
      }
    });
  }

  openBulkAddToListDialog(): void {
    const contactIds = [...this.selection.selected];
    if (!contactIds.length) return;

    const dialogRef = this.dialog.open(ProspectListAddDialogComponent, {
      width: '640px',
      panelClass: 'dark-dialog-panel',
      data: { contactIds }
    });

    dialogRef.afterClosed().subscribe((added) => {
      if (added) {
        this.selection.clear();
        this.store.loadContacts();
      }
    });
  }

  bulkDelete(): void {
    const count = this.selection.selected.length;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Bulk Delete Contacts',
        message: `Are you sure you want to delete ${count} selected contacts?`,
        confirmText: 'Delete All',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        const ids = [...this.selection.selected];
        this.store.bulkDeleteContacts(ids);
        this.selection.clear();
      }
    });
  }
}
