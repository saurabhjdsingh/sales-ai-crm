import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SelectionModel } from '@angular/cdk/collections';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { DealStore } from '../services/deal.store';
import { DealFormComponent } from '../deal-form/deal-form.component';
import { Deal, DealStage } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface KanbanColumn {
  id: string;
  label: string;
  colorClass: string;
}

@Component({
  selector: 'app-deal-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTableModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    DragDropModule,
    MatCheckboxModule
  ],
  template: `
    <div class="list-container">
      <div class="list-header">
        <div>
          <h1>Deals</h1>
          <p class="subtitle">Track sales opportunities and revenue pipelines</p>
        </div>
        <div class="header-actions">
          <mat-button-toggle-group [value]="currentView()" (change)="onViewChange($event.value)" class="view-toggle">
            <mat-button-toggle value="board">
              <mat-icon>dashboard</mat-icon>
              <span>Board</span>
            </mat-button-toggle>
            <mat-button-toggle value="list">
              <mat-icon>list</mat-icon>
              <span>List</span>
            </mat-button-toggle>
          </mat-button-toggle-group>

          <button mat-flat-button color="primary" (click)="openCreateDialog()" class="create-btn">
            <mat-icon>add</mat-icon>
            <span>Add Deal</span>
          </button>
        </div>
      </div>

      <!-- Filters Bar -->
      <div class="filters-bar" [formGroup]="filterForm">
        <div class="search-field">
          <mat-icon>search</mat-icon>
          <input type="text" formControlName="search" placeholder="Search deals by name..." class="filter-input" />
        </div>

        <mat-form-field appearance="outline" class="filter-select" *ngIf="currentView() === 'list'">
          <mat-label>Stage</mat-label>
          <mat-select formControlName="stage">
            <mat-option value="">All Stages</mat-option>
            <mat-option value="lead">Lead</mat-option>
            <mat-option value="sales_qualified">Sales Qualified</mat-option>
            <mat-option value="meeting_booked">Meeting Booked</mat-option>
            <mat-option value="negotiation">Negotiation</mat-option>
            <mat-option value="poc">POC</mat-option>
            <mat-option value="contract_sent">Contract Sent</mat-option>
            <mat-option value="closed_won">Closed Won</mat-option>
            <mat-option value="closed_lost">Closed Lost</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-select">
          <mat-label>Priority</mat-label>
          <mat-select formControlName="priority">
            <mat-option value="">All Priorities</mat-option>
            <mat-option value="low">Low</mat-option>
            <mat-option value="medium">Medium</mat-option>
            <mat-option value="high">High</mat-option>
            <mat-option value="critical">Critical</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-icon-button (click)="resetFilters()" matTooltip="Reset Filters" class="reset-btn">
          <mat-icon>filter_list_off</mat-icon>
        </button>
      </div>

      <!-- Pipeline Kanban Board View -->
      @if (currentView() === 'board') {
        <div class="board-wrapper">
          @if (store.loading()) {
            <div class="loading-overlay">
              <mat-spinner diameter="40"></mat-spinner>
            </div>
          }

          <div class="kanban-board" cdkDropListGroup>
            @for (col of kanbanColumns; track col.id) {
              <div class="kanban-col">
                <div class="col-header" [ngClass]="col.colorClass">
                  <div class="col-title">{{ col.label }}</div>
                  <div class="col-meta">
                    <span class="col-count">{{ getDealsInStage(col.id).length }}</span>
                    <span class="col-revenue" *ngIf="calculateStageRevenue(col.id) > 0">
                      · \${{ calculateStageRevenue(col.id) | number:'1.0-0' }}
                    </span>
                  </div>
                </div>

                <div class="col-cards"
                     cdkDropList
                     [cdkDropListData]="getDealsInStage(col.id)"
                     (cdkDropListDropped)="onDrop($event, col.id)">
                  @for (deal of getDealsInStage(col.id); track deal.id) {
                    <div class="deal-card"
                         cdkDrag
                         [cdkDragData]="deal"
                         [routerLink]="['/deals', deal.id]">
                      <div class="card-top">
                        <div class="deal-card-company">{{ deal.company_name }}</div>
                        <span class="prio-tag" [ngClass]="deal.priority">{{ deal.priority }}</span>
                      </div>
                      <div class="deal-card-name">{{ deal.name }}</div>
                      <div class="card-bottom">
                        <div class="deal-card-revenue" *ngIf="deal.expected_revenue">
                          \${{ deal.expected_revenue | number:'1.0-0' }}
                        </div>
                        <div class="deal-card-date" *ngIf="deal.expected_close_date">
                          {{ deal.expected_close_date | date:'dd/MM/yyyy' }}
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Table List View -->
      @if (currentView() === 'list') {
        <div class="table-wrapper">
          @if (store.loading()) {
            <div class="loading-overlay">
              <mat-spinner diameter="40"></mat-spinner>
            </div>
          }

          <table mat-table [dataSource]="store.deals()" class="dark-table">
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
              <th mat-header-cell *matHeaderCellDef>Deal Name</th>
              <td mat-cell *matCellDef="let element" class="clickable" [routerLink]="['/deals', element.id]">
                <div class="name-cell">
                  <span class="deal-name">{{ element.name }}</span>
                  <span class="company-name">{{ element.company_name }}</span>
                </div>
              </td>
            </ng-container>

            <!-- Revenue Column -->
            <ng-container matColumnDef="revenue">
              <th mat-header-cell *matHeaderCellDef>Revenue</th>
              <td mat-cell *matCellDef="let element">
                {{ element.expected_revenue ? ('$' + (element.expected_revenue | number:'1.2-2')) : '—' }}
              </td>
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

            <!-- Priority Column -->
            <ng-container matColumnDef="priority">
              <th mat-header-cell *matHeaderCellDef>Priority</th>
              <td mat-cell *matCellDef="let element">
                <span class="priority-badge" [ngClass]="element.priority">
                  {{ element.priority | uppercase }}
                </span>
              </td>
            </ng-container>

            <!-- Close Date Column -->
             <ng-container matColumnDef="expected_close_date">
               <th mat-header-cell *matHeaderCellDef>Expected Close</th>
               <td mat-cell *matCellDef="let element">
                 {{ element.expected_close_date ? (element.expected_close_date | date:'dd/MM/yyyy') : '—' }}
               </td>
             </ng-container>

            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let element" class="action-cell">
                <button mat-icon-button [routerLink]="['/deals', element.id]">
                  <mat-icon>chevron_right</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>

          @if (!store.loading() && store.deals().length === 0) {
            <div class="empty-state">
              <mat-icon class="empty-icon">monetization_on</mat-icon>
              <h3>No deals found</h3>
              <p>Get started by creating a deal record.</p>
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
      }

      <!-- Bulk Actions Floating Banner -->
      <div class="bulk-actions-banner" *ngIf="currentView() === 'list' && selection.selected.length > 0">
        <div class="selection-info">
          <mat-icon class="info-icon">check_circle</mat-icon>
          <span class="count">{{ selection.selected.length }}</span>
          <span>{{ selection.selected.length === 1 ? 'deal' : 'deals' }} selected</span>
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

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .view-toggle {
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      background-color: rgba(255, 255, 255, 0.02);
      border-radius: 6px;
      overflow: hidden;
    }

    ::ng-deep .view-toggle mat-button-toggle {
      background-color: transparent !important;
      color: #64748b !important;
    }

    ::ng-deep .view-toggle .mat-button-toggle-checked {
      background-color: rgba(59, 130, 246, 0.15) !important;
      color: #60a5fa !important;
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

    /* Kanban Board Layout */
    .board-wrapper {
      position: relative;
      flex: 1;
      overflow-x: auto;
      min-height: 480px;
    }

    .kanban-board {
      display: flex;
      gap: 1rem;
      align-items: start;
      height: 100%;
      padding-bottom: 1rem;
    }

    .kanban-col {
      width: 280px;
      flex-shrink: 0;
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 260px);
    }

    .col-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      border-top: 3px solid #64748b;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
    }

    .col-header.lead { border-top-color: #64748b; }
    .col-header.sales_qualified { border-top-color: #3b82f6; }
    .col-header.meeting_booked { border-top-color: #a78bfa; }
    .col-header.negotiation { border-top-color: #f59e0b; }
    .col-header.poc { border-top-color: #14b8a6; }
    .col-header.contract_sent { border-top-color: #ec4899; }

    .col-title {
      font-weight: 700;
      font-size: 0.85rem;
      color: #f8fafc;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .col-meta {
      font-size: 0.75rem;
      color: #64748b;
    }

    .col-revenue {
      font-weight: 600;
      color: #cbd5e1;
    }

    .col-cards {
      padding: 0.75rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      flex: 1;
      min-height: 100px;
    }

    /* Drag & Drop CDK Styles */
    .cdk-drag-preview {
      box-sizing: border-box;
      border-radius: 6px;
      box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2),
                  0 8px 10px 1px rgba(0, 0, 0, 0.14),
                  0 3px 14px 2px rgba(0, 0, 0, 0.12);
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      backdrop-filter: blur(8px);
      padding: 0.85rem;
      pointer-events: none;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
    }

    .cdk-drag-placeholder {
      opacity: 0.25;
      border: 2px dashed rgba(255, 255, 255, 0.15) !important;
      background: rgba(255, 255, 255, 0.01) !important;
      min-height: 80px;
    }

    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .col-cards.cdk-drop-list-receiving {
      background: rgba(255, 255, 255, 0.02);
      border-radius: 4px;
    }

    .col-cards.cdk-drop-list-dragging .deal-card:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .deal-card {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 0.85rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: all 0.2s;
    }

    .deal-card:hover {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      transform: translateY(-2px);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .deal-card-company {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 500;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .prio-tag {
      font-size: 0.6rem;
      text-transform: uppercase;
      font-weight: 700;
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
    }

    .prio-tag.high { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .prio-tag.critical { background: rgba(239, 68, 68, 0.15); color: #f87171; }

    .deal-card-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: #f8fafc;
      line-height: 1.4;
    }

    .card-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      margin-top: 0.25rem;
    }

    .deal-card-revenue {
      font-weight: 700;
      color: #cbd5e1;
    }

    .deal-card-date {
      color: #475569;
    }

    /* List View Layout */
    .table-wrapper {
      position: relative;
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      overflow: hidden;
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

    .name-cell {
      display: flex;
      flex-direction: column;
    }

    .deal-name {
      color: #f8fafc;
      font-weight: 600;
    }

    .company-name {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .clickable {
      cursor: pointer;
    }

    .clickable:hover .deal-name {
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

    .stage-badge.lead { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .stage-badge.sales_qualified { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .stage-badge.meeting_booked { background: rgba(139, 92, 246, 0.15); color: #c084fc; }
    .stage-badge.negotiation { background: rgba(245, 158, 11, 0.15); color: #fbbd23; }
    .stage-badge.poc { background: rgba(20, 184, 166, 0.15); color: #2dd4bf; }
    .stage-badge.contract_sent { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .stage-badge.closed_won { background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 700; }
    .stage-badge.closed_lost { background: rgba(239, 68, 68, 0.15); color: #f87171; }

    .priority-badge {
      display: inline-block;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 700;
    }

    .priority-badge.low { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .priority-badge.medium { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .priority-badge.high { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .priority-badge.critical { background: rgba(239, 68, 68, 0.2); color: #f87171; }

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

    .checkbox-header-cell {
      width: 48px;
      padding-left: 1.5rem !important;
    }

    .checkbox-cell {
      width: 48px;
      padding-left: 1.5rem !important;
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
export class DealListComponent implements OnInit {
  readonly store = inject(DealStore);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  readonly currentView = signal<'board' | 'list'>('board');
  readonly displayedColumns: string[] = ['select', 'name', 'revenue', 'stage', 'priority', 'expected_close_date', 'actions'];
  selection = new SelectionModel<string>(true, []);

  readonly kanbanColumns: KanbanColumn[] = [
    { id: 'lead', label: 'Lead', colorClass: 'lead' },
    { id: 'sales_qualified', label: 'Qualified', colorClass: 'sales_qualified' },
    { id: 'meeting_booked', label: 'Meeting Booked', colorClass: 'meeting_booked' },
    { id: 'negotiation', label: 'Negotiation', colorClass: 'negotiation' },
    { id: 'poc', label: 'POC', colorClass: 'poc' },
    { id: 'contract_sent', label: 'Contract Sent', colorClass: 'contract_sent' }
  ];

  readonly filterForm: FormGroup = this.fb.group({
    search: [''],
    stage: [''],
    priority: ['']
  });

  ngOnInit(): void {
    this.loadData();

    this.filterForm.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe((filters) => {
      this.selection.clear();
      if (this.currentView() === 'list') {
        this.store.loadDeals(1, filters);
      } else {
        // For board view, we just fetch the pipeline (which already groups by stage, client-side filtering can occur)
        this.store.loadPipeline();
      }
    });
  }

  loadData(): void {
    if (this.currentView() === 'board') {
      this.store.loadPipeline();
    } else {
      this.store.loadDeals(1, this.filterForm.value);
    }
  }

  onViewChange(view: 'board' | 'list'): void {
    this.selection.clear();
    this.currentView.set(view);
    this.loadData();
  }

  onPageChange(event: PageEvent): void {
    this.selection.clear();
    this.store.loadDeals(event.pageIndex + 1);
  }

  resetFilters(): void {
    this.filterForm.reset({
      search: '',
      stage: '',
      priority: ''
    });
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(DealFormComponent, {
      width: '560px',
      panelClass: 'dark-dialog-panel'
    });
    ref.afterClosed().subscribe(() => {
      this.loadData();
    });
  }

  getDealsInStage(stageId: string): Deal[] {
    const pipe = this.store.pipeline();
    const deals = pipe[stageId] || [];
    
    // Client-side search and priority filters for Kanban
    const search = this.filterForm.get('search')?.value?.toLowerCase();
    const priority = this.filterForm.get('priority')?.value;

    return deals.filter((d) => {
      const matchSearch = !search || d.name.toLowerCase().includes(search) || d.company_name?.toLowerCase().includes(search);
      const matchPrio = !priority || d.priority === priority;
      return matchSearch && matchPrio;
    });
  }

  calculateStageRevenue(stageId: string): number {
    return this.getDealsInStage(stageId).reduce((acc, d) => acc + (d.expected_revenue || 0), 0);
  }

  onDrop(event: any, targetStage: string): void {
    if (event.previousContainer === event.container) {
      return;
    }

    const deal = event.item.data as Deal;
    // Update stage silently (no toast, instant UI update)
    this.store.updateDeal(deal.id, { stage: targetStage as DealStage }, undefined, true);
  }

  getStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      lead: 'Lead',
      sales_qualified: 'Qualified',
      meeting_booked: 'Meeting Booked',
      negotiation: 'Negotiation',
      poc: 'POC',
      contract_sent: 'Contract Sent',
      closed_won: 'Won',
      closed_lost: 'Lost',
      on_hold: 'On Hold'
    };
    return labels[stage] || stage;
  }

  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.store.deals().length;
    return numSelected === numRows && numRows > 0;
  }

  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.store.deals().forEach(row => this.selection.select(row.id));
    }
  }

  bulkDelete(): void {
    const selectedIds = this.selection.selected;
    if (selectedIds.length === 0) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Deals',
        message: `Are you sure you want to delete the ${selectedIds.length} selected ${selectedIds.length === 1 ? 'deal' : 'deals'}? This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.bulkDeleteDeals(selectedIds, () => {
          this.selection.clear();
          this.loadData();
        });
      }
    });
  }
}
