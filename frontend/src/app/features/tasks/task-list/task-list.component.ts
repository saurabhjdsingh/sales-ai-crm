import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SelectionModel } from '@angular/cdk/collections';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TaskStore } from '../services/task.store';
import { TaskFormComponent } from '../task-form/task-form.component';
import { Task } from '../../../core/models/crm.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TaskOutcomeDialogComponent } from '../../sequences/task-outcome-dialog/task-outcome-dialog.component';

@Component({
  selector: 'app-task-list',
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
    MatTabsModule,
    MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  template: `
    <div class="list-container">
      <div class="list-header">
        <div>
          <h1>Tasks</h1>
          <p class="subtitle">Stay on top of your daily sales activities</p>
        </div>
        <button mat-flat-button color="primary" (click)="openCreateDialog()" class="create-btn">
          <mat-icon>add</mat-icon>
          <span>Add Task</span>
        </button>
      </div>

      <mat-tab-group class="dark-tabs" (selectedTabChange)="onTabChange($event.index)">
        <!-- Today's Tasks Tab -->
        <mat-tab label="Today's Tasks">
          <div class="tab-content">
            <div class="tasks-feed">
              @for (t of store.todayTasks(); track t.id) {
                <div class="task-row">
                  <button class="checkbox-btn" (click)="completeTask(t)">
                    <mat-icon>check_box_outline_blank</mat-icon>
                  </button>
                  <div class="task-details">
                    <div class="task-title">{{ t.title }}</div>
                    <div class="task-meta">
                      <span class="type-badge" [ngClass]="t.task_type">{{ (t.task_type || 'other') | uppercase }}</span>
                      <span class="divider">·</span>
                      <span class="prio-tag" [ngClass]="t.priority">Priority: {{ t.priority }}</span>
                      <span class="divider" *ngIf="t.contact_name">·</span>
                      <a class="entity-link" *ngIf="t.contact_name" [routerLink]="['/contacts', t.contact]">Contact: {{ t.contact_name }}</a>
                      <span class="divider" *ngIf="t.company_name">·</span>
                      <a class="entity-link" *ngIf="t.company_name" [routerLink]="['/companies', t.company]">Account: {{ t.company_name }}</a>
                      <span class="divider" *ngIf="t.deal_name">·</span>
                      <a class="entity-link" *ngIf="t.deal_name" [routerLink]="['/deals', t.deal]">Deal: {{ t.deal_name }}</a>
                    </div>
                  </div>
                  <div class="task-time" *ngIf="t.due_date">{{ t.due_date | date:'shortTime' }}</div>
                  <button mat-icon-button (click)="openEditDialog(t)" class="row-action">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button mat-icon-button (click)="deleteTask(t)" class="row-action delete">
                    <mat-icon style="color: #f87171;">delete</mat-icon>
                  </button>
                </div>
              }
              @if (store.todayTasks().length === 0) {
                <div class="empty-state">
                  <mat-icon class="empty-icon">task_alt</mat-icon>
                  <h3>All tasks completed!</h3>
                  <p>You have no pending tasks scheduled for today.</p>
                </div>
              }
            </div>
          </div>
        </mat-tab>

        <!-- Overdue Tab -->
        <mat-tab label="Overdue">
          <div class="tab-content">
            <div class="tasks-feed">
              @for (t of store.overdueTasks(); track t.id) {
                <div class="task-row overdue">
                  <button class="checkbox-btn" (click)="completeTask(t)">
                    <mat-icon>check_box_outline_blank</mat-icon>
                  </button>
                  <div class="task-details">
                    <div class="task-title" [innerHTML]="formatTextWithLinks(t.title)"></div>
                    <div class="task-meta">
                      <span class="type-badge" [ngClass]="t.task_type">{{ (t.task_type || 'other') | uppercase }}</span>
                      <span class="divider">·</span>
                      <span class="prio-tag" [ngClass]="t.priority">Priority: {{ t.priority }}</span>
                      <span class="divider" *ngIf="t.contact_name">·</span>
                      <a class="entity-link" *ngIf="t.contact_name" [routerLink]="['/contacts', t.contact]">Contact: {{ t.contact_name }}</a>
                      <span class="divider" *ngIf="t.company_name">·</span>
                      <a class="entity-link" *ngIf="t.company_name" [routerLink]="['/companies', t.company]">Account: {{ t.company_name }}</a>
                      <span class="divider" *ngIf="t.deal_name">·</span>
                      <a class="entity-link" *ngIf="t.deal_name" [routerLink]="['/deals', t.deal]">Deal: {{ t.deal_name }}</a>
                    </div>
                  </div>
                  <div class="task-days-overdue" *ngIf="t.due_date">
                    Overdue: {{ t.due_date | date:'dd/MM/yyyy' }}
                  </div>
                  <button mat-icon-button (click)="openEditDialog(t)" class="row-action">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button mat-icon-button (click)="deleteTask(t)" class="row-action delete">
                    <mat-icon style="color: #f87171;">delete</mat-icon>
                  </button>
                </div>
              }
              @if (store.overdueTasks().length === 0) {
                <div class="empty-state">
                  <mat-icon class="empty-icon">verified</mat-icon>
                  <h3>No overdue tasks</h3>
                  <p>Awesome work keeping up with your schedule!</p>
                </div>
              }
            </div>
          </div>
        </mat-tab>

        <!-- All Tasks Tab (with filters & table) -->
        <mat-tab label="All Tasks">
          <div class="tab-content">
            <!-- Filters Bar -->
            <div class="filters-bar" [formGroup]="filterForm">
              <div class="search-field">
                <mat-icon>search</mat-icon>
                <input type="text" formControlName="search" placeholder="Search tasks..." class="filter-input" />
              </div>

              <mat-form-field appearance="outline" class="filter-select">
                <mat-label>Status</mat-label>
                <mat-select formControlName="status">
                  <mat-option value="">All Statuses</mat-option>
                  <mat-option value="pending">Pending</mat-option>
                  <mat-option value="in_progress">In Progress</mat-option>
                  <mat-option value="completed">Completed</mat-option>
                  <mat-option value="cancelled">Cancelled</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-select">
                <mat-label>Priority</mat-label>
                <mat-select formControlName="priority">
                  <mat-option value="">All Priorities</mat-option>
                  <mat-option value="low">Low</mat-option>
                  <mat-option value="medium">Medium</mat-option>
                  <mat-option value="high">High</mat-option>
                  <mat-option value="urgent">Urgent</mat-option>
                </mat-select>
              </mat-form-field>

              <button mat-icon-button (click)="resetFilters()" matTooltip="Reset Filters" class="reset-btn">
                <mat-icon>filter_list_off</mat-icon>
              </button>
            </div>

            <!-- Table -->
            <div class="table-wrapper">
              @if (store.loading()) {
                <div class="loading-overlay">
                  <mat-spinner diameter="40"></mat-spinner>
                </div>
              }

              <table mat-table [dataSource]="store.tasks()" class="dark-table">
                <!-- Select Checkbox Column -->
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

                <!-- Checkbox Column -->
                <ng-container matColumnDef="checkbox">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let element" class="action-cell">
                    <button class="checkbox-btn" (click)="completeTask(element)" [disabled]="element.status === 'completed'">
                      <mat-icon>{{ element.status === 'completed' ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
                    </button>
                  </td>
                </ng-container>

                <!-- Title Column -->
                <ng-container matColumnDef="title">
                  <th mat-header-cell *matHeaderCellDef>Task Title</th>
                  <td mat-cell *matCellDef="let element">
                    <div class="name-cell">
                      <span class="task-title-text" [ngClass]="{ 'line-through': element.status === 'completed' }" [innerHTML]="formatTextWithLinks(element.title)"></span>
                      <span class="association-sub" *ngIf="element.contact_name || element.company_name || element.deal_name">
                        <a *ngIf="element.contact_name" [routerLink]="['/contacts', element.contact]" class="entity-link">Contact: {{ element.contact_name }}</a>
                        <span *ngIf="element.contact_name && element.company_name"> · </span>
                        <a *ngIf="element.company_name" [routerLink]="['/companies', element.company]" class="entity-link">Account: {{ element.company_name }}</a>
                        <span *ngIf="(element.contact_name || element.company_name) && element.deal_name"> · </span>
                        <a *ngIf="element.deal_name" [routerLink]="['/deals', element.deal]" class="entity-link">Deal: {{ element.deal_name }}</a>
                      </span>
                    </div>
                  </td>
                </ng-container>

                <!-- Type Column -->
                <ng-container matColumnDef="task_type">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let element">
                    <span class="type-badge" [ngClass]="element.task_type">{{ element.task_type | uppercase }}</span>
                  </td>
                </ng-container>

                <!-- Priority Column -->
                <ng-container matColumnDef="priority">
                  <th mat-header-cell *matHeaderCellDef>Priority</th>
                  <td mat-cell *matCellDef="let element">
                    <span class="prio-tag" [ngClass]="element.priority">{{ element.priority | uppercase }}</span>
                  </td>
                </ng-container>

                <!-- Due Date Column -->
                <ng-container matColumnDef="due_date">
                  <th mat-header-cell *matHeaderCellDef>Due Date</th>
                  <td mat-cell *matCellDef="let element" [ngClass]="{ 'overdue': element.is_overdue }">
                    {{ element.due_date ? (element.due_date | date:'dd/MM/yyyy') : '—' }}
                  </td>
                </ng-container>

                <!-- Actions Column -->
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let element" class="action-cell">
                    <button mat-icon-button (click)="openEditDialog(element)">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button (click)="deleteTask(element)">
                      <mat-icon style="color: #f87171;">delete</mat-icon>
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>

              @if (!store.loading() && store.tasks().length === 0) {
                <div class="empty-state">
                  <mat-icon class="empty-icon">assignment</mat-icon>
                  <h3>No tasks found</h3>
                  <p>Create a task to track your to-do items.</p>
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
          </div>
        </mat-tab>
      </mat-tab-group>

      <!-- Bulk Actions Floating Banner -->
      <div class="bulk-actions-banner" *ngIf="activeTab() === 2 && selection.selected.length > 0">
        <div class="selection-info">
          <mat-icon class="info-icon">check_circle</mat-icon>
          <span class="count">{{ selection.selected.length }}</span>
          <span>{{ selection.selected.length === 1 ? 'task' : 'tasks' }} selected</span>
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

    /* Dark tabs */
    .dark-tabs {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
    }

    ::ng-deep .dark-tabs .mat-mdc-tab-header {
      background-color: #0b1329 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    }

    ::ng-deep .dark-tabs .mat-mdc-tab {
      color: #64748b !important;
      font-weight: 600 !important;
    }

    ::ng-deep .dark-tabs .mat-mdc-tab.mdc-tab--active {
      color: #3b82f6 !important;
    }

    ::ng-deep .dark-tabs .mdc-tab-indicator__active-indicator {
      border-color: #3b82f6 !important;
    }

    .tab-content {
      padding: 1.5rem;
    }

    /* Tasks Feed (Today's / Overdue List) */
    .tasks-feed {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .task-row {
      display: flex;
      align-items: center;
      padding: 0.85rem 1rem;
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
    }

    .task-row.overdue {
      border-left: 3px solid #ef4444;
    }

    .checkbox-btn {
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      padding: 0;
      margin-right: 1rem;
      display: flex;
      align-items: center;
    }

    .checkbox-btn:hover {
      color: #3b82f6;
    }

    .task-details {
      flex: 1;
      overflow: hidden;
    }

    .task-title {
      font-weight: 600;
      font-size: 0.9rem;
      color: #f8fafc;
    }

    .task-title-text.line-through {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .task-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.2rem;
    }

    .type-badge {
      display: inline-block;
      padding: 0.05rem 0.35rem;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.6rem;
      background: rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
    }

    .type-badge.call { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .type-badge.email { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .type-badge.linkedin { background: rgba(14, 165, 233, 0.15); color: #38bdf8; }
    .type-badge.follow_up { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    .type-badge.meeting { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .type-badge.review_proposal { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .type-badge.other { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; }

    .entity-link { color: #60a5fa; text-decoration: none; font-weight: 500; }
    .entity-link:hover { text-decoration: underline; color: #93c5fd; }

    .prio-tag {
      font-weight: 600;
      color: #cbd5e1;
    }

    .prio-tag.low { color: #94a3b8; }
    .prio-tag.medium { color: #60a5fa; }
    .prio-tag.high { color: #fbbf24; }
    .prio-tag.urgent { color: #f87171; font-weight: 700; }

    .divider {
      color: #334155;
    }

    .entity-link {
      color: #60a5fa;
      text-decoration: none;
      cursor: pointer;
    }

    .entity-link:hover {
      text-decoration: underline;
    }

    .task-time {
      font-size: 0.8rem;
      color: #64748b;
      margin-right: 1.5rem;
    }

    .task-days-overdue {
      font-size: 0.8rem;
      color: #f87171;
      font-weight: 600;
      margin-right: 1.5rem;
    }

    .row-action {
      color: #475569 !important;
    }

    .row-action:hover {
      color: #cbd5e1 !important;
    }

    /* All Tasks Tab Filters & Table */
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

    .association-sub {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.15rem;
    }

    .due-date.overdue {
      color: #f87171 !important;
      font-weight: 600;
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
export class TaskListComponent implements OnInit {
  readonly store = inject(TaskStore);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  activeTab = signal<number>(0);
  readonly displayedColumns: string[] = ['select', 'checkbox', 'title', 'task_type', 'priority', 'due_date', 'actions'];
  selection = new SelectionModel<string>(true, []);

  readonly filterForm: FormGroup = this.fb.group({
    search: [''],
    status: ['pending'],
    priority: ['']
  });

  ngOnInit(): void {
    this.store.loadTodayTasks();
    this.store.loadOverdueTasks();

    this.filterForm.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe((filters) => {
      this.selection.clear();
      this.store.loadTasks(1, filters);
    });
  }

  onTabChange(tabIndex: number): void {
    this.selection.clear();
    this.activeTab.set(tabIndex);
    if (tabIndex === 0) {
      this.store.loadTodayTasks();
    } else if (tabIndex === 1) {
      this.store.loadOverdueTasks();
    } else if (tabIndex === 2) {
      this.store.loadTasks(1, this.filterForm.value);
    }
  }

  onPageChange(event: PageEvent): void {
    this.selection.clear();
    this.store.loadTasks(event.pageIndex + 1);
  }

  resetFilters(): void {
    this.filterForm.reset({
      search: '',
      status: 'pending',
      priority: ''
    });
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(TaskFormComponent, {
      width: '560px',
      panelClass: 'dark-dialog-panel'
    });
    ref.afterClosed().subscribe(() => {
      this.store.loadTodayTasks();
      this.store.loadOverdueTasks();
      this.store.loadTasks(1, this.filterForm.value);
    });
  }

  openEditDialog(task: Task): void {
    const ref = this.dialog.open(TaskFormComponent, {
      width: '560px',
      data: task,
      panelClass: 'dark-dialog-panel'
    });
    ref.afterClosed().subscribe(() => {
      this.store.loadTodayTasks();
      this.store.loadOverdueTasks();
      this.store.loadTasks(1, this.filterForm.value);
    });
  }

  completeTask(taskOrId: any): void {
    const task: Task = typeof taskOrId === 'string'
      ? (this.store.tasks().find(t => t.id === taskOrId) ||
         this.store.todayTasks().find(t => t.id === taskOrId) ||
         this.store.overdueTasks().find(t => t.id === taskOrId) ||
         { id: taskOrId, title: 'Task' } as any)
      : taskOrId;

    const dialogRef = this.dialog.open(TaskOutcomeDialogComponent, {
      width: '480px',
      data: { task },
      panelClass: 'dark-dialog-panel'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.store.loadTodayTasks();
        this.store.loadOverdueTasks();
        this.store.loadTasks(this.store.page(), this.filterForm.value);
      }
    });
  }

  deleteTask(task: Task): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Task',
        message: `Are you sure you want to delete the task "${task.title}"? This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.deleteTask(task.id, () => {
          this.store.loadTodayTasks();
          this.store.loadOverdueTasks();
          this.store.loadTasks(1, this.filterForm.value);
        });
      }
    });
  }

  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.store.tasks().length;
    return numSelected === numRows && numRows > 0;
  }

  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.store.tasks().forEach(row => this.selection.select(row.id));
    }
  }

  bulkDelete(): void {
    const selectedIds = this.selection.selected;
    if (selectedIds.length === 0) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Tasks',
        message: `Are you sure you want to delete the ${selectedIds.length} selected ${selectedIds.length === 1 ? 'task' : 'tasks'}? This action cannot be undone.`,
        confirmText: 'Delete'
      }
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.store.bulkDeleteTasks(selectedIds, () => {
          this.selection.clear();
          this.store.loadTodayTasks();
          this.store.loadOverdueTasks();
          this.store.loadTasks(this.store.page(), this.filterForm.value);
        });
      }
    });
  }

  formatTextWithLinks(text: string | undefined): string {
    if (!text) return '';
    const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
    let html = text.replace(urlPattern, (url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline;">${url}</a>`;
    });
    return html.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]+)"([^>]*)>/gi, (match, href, rest) => {
      if (!rest.includes('target=')) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`;
      }
      return match.replace(/target="[^"]*"/gi, 'target="_blank" rel="noopener noreferrer"');
    });
  }
}
