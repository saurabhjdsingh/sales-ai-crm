import { Component, OnInit, inject, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProspectListService } from '../services/prospect-list.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ProspectList } from '../../../core/models/crm.model';

export interface ProspectListAddDialogData {
  contactIds: string[];
}

@Component({
  selector: 'app-prospect-list-add-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon class="title-icon">playlist_add</mat-icon>
      Add to Prospect List
    </h2>

    <div mat-dialog-content class="dialog-content">
      <p class="subtitle">
        Select a prospect list for
        <strong>{{ data.contactIds.length }} {{ data.contactIds.length === 1 ? 'contact' : 'contacts' }}</strong>:
      </p>

      <div *ngIf="loading" class="loading-box">
        <mat-spinner diameter="36"></mat-spinner>
        <span>Loading prospect lists...</span>
      </div>

      <div *ngIf="!loading && lists.length === 0" class="no-list-card">
        <mat-icon class="warning-icon">warning</mat-icon>
        <div class="no-list-content">
          <h4>No Prospect Lists Found</h4>
          <p>Create a prospect list first to organize your contacts.</p>
        </div>
      </div>

      <div *ngIf="!loading && lists.length > 0" class="search-wrapper">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          type="text"
          [(ngModel)]="searchQuery"
          placeholder="Search lists..."
          class="search-input"
        />
      </div>

      <div *ngIf="!loading && filteredLists.length > 0" class="list-items">
        <div
          *ngFor="let list of filteredLists"
          class="list-item-card"
          [class.selected]="selectedListId === list.id"
          (click)="selectedListId = list.id"
        >
          <div class="list-radio">
            <div class="radio-outer" [class.checked]="selectedListId === list.id">
              <div class="radio-inner" *ngIf="selectedListId === list.id"></div>
            </div>
          </div>
          <div class="list-info">
            <div class="list-header">
              <span class="list-name">{{ list.name }}</span>
              <span class="list-badge">{{ list.contact_count }} Contacts</span>
            </div>
            <p class="list-desc">{{ list.description || 'No description' }}</p>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && lists.length > 0 && filteredLists.length === 0" class="no-results">
        <span>No lists match "{{ searchQuery }}"</span>
      </div>
    </div>

    <div mat-dialog-actions align="end" class="dialog-actions">
      <button mat-button (click)="onCancel()" class="cancel-btn">Cancel</button>
      <button
        *ngIf="lists.length > 0"
        mat-raised-button
        color="primary"
        (click)="onSubmit()"
        [disabled]="!selectedListId || submitting"
        class="submit-btn"
      >
        {{ submitting ? 'Adding...' : 'Add ' + data.contactIds.length + (data.contactIds.length === 1 ? ' Contact' : ' Contacts') }}
      </button>
    </div>
  `,
  styles: [`
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f8fafc;
      font-size: 1.25rem;
      margin: 0;
    }

    .title-icon { color: #a78bfa; }

    .dialog-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 420px;
      max-width: 540px;
      padding-top: 0.75rem !important;
    }

    .subtitle {
      color: #94a3b8;
      font-size: 0.9rem;
      margin: 0;
    }

    .loading-box {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: #94a3b8;
    }

    .no-list-card {
      display: flex;
      gap: 1rem;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 10px;
      padding: 1.25rem;
    }

    .warning-icon {
      color: #f59e0b;
      font-size: 28px;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
    }

    .no-list-content h4 {
      color: #fbbf24;
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
    }

    .no-list-content p {
      color: #cbd5e1;
      font-size: 0.85rem;
      margin: 0;
      line-height: 1.4;
    }

    .search-wrapper {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0 0.75rem;
      height: 40px;
    }

    .search-icon {
      color: #64748b;
      margin-right: 0.5rem;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .search-input {
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 0.875rem;
      outline: none;
      width: 100%;
    }

    .search-input::placeholder { color: #64748b; }

    .list-items {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      max-height: 320px;
      overflow-y: auto;
    }

    .list-item-card {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .list-item-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .list-item-card.selected {
      background: rgba(167, 139, 250, 0.12);
      border-color: #a78bfa;
    }

    .radio-outer {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    }

    .radio-outer.checked { border-color: #a78bfa; }

    .radio-inner {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #a78bfa;
    }

    .list-info { flex: 1; }

    .list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .list-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: #f8fafc;
    }

    .list-badge {
      font-size: 0.725rem;
      font-weight: 600;
      background: rgba(167, 139, 250, 0.2);
      color: #c4b5fd;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      white-space: nowrap;
    }

    .list-desc {
      font-size: 0.8rem;
      color: #94a3b8;
      margin: 0.25rem 0 0 0;
    }

    .no-results {
      text-align: center;
      padding: 1.5rem;
      color: #64748b;
      font-size: 0.875rem;
    }

    .dialog-actions { padding: 1rem; }
    .cancel-btn { color: #94a3b8 !important; }
    .submit-btn { background: #7c3aed !important; }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .dialog-title { color: #0f172a; }
    :host-context(body.light-theme) .subtitle { color: #475569; }
    :host-context(body.light-theme) .search-wrapper {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    :host-context(body.light-theme) .search-input { color: #0f172a; }
    :host-context(body.light-theme) .list-item-card {
      background: #ffffff;
      border-color: #cbd5e1;
    }
    :host-context(body.light-theme) .list-item-card:hover {
      background: #f8fafc;
      border-color: #94a3b8;
    }
    :host-context(body.light-theme) .list-item-card.selected {
      background: #f5f3ff;
      border-color: #a78bfa;
    }
    :host-context(body.light-theme) .list-name { color: #0f172a; }
    :host-context(body.light-theme) .list-desc { color: #475569; }
    :host-context(body.light-theme) .cancel-btn { color: #475569 !important; }
  `]
})
export class ProspectListAddDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<ProspectListAddDialogComponent>);
  private readonly prospectListService = inject(ProspectListService);
  private readonly notification = inject(NotificationService);

  lists: ProspectList[] = [];
  selectedListId: string | null = null;
  loading = true;
  submitting = false;
  searchQuery = '';

  constructor(@Inject(MAT_DIALOG_DATA) public data: ProspectListAddDialogData) {}

  get filteredLists(): ProspectList[] {
    if (!this.searchQuery.trim()) return this.lists;
    const q = this.searchQuery.toLowerCase();
    return this.lists.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
    );
  }

  ngOnInit(): void {
    this.prospectListService.getProspectLists({ is_active: true, page_size: 100 }).subscribe({
      next: (res) => {
        this.lists = res.results || [];
        if (this.lists.length > 0) {
          this.selectedListId = this.lists[0].id;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.notification.error('Failed to load prospect lists.');
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onSubmit(): void {
    if (!this.selectedListId) return;

    const targetList = this.lists.find(l => l.id === this.selectedListId);
    this.submitting = true;

    this.prospectListService.bulkAddContacts(this.selectedListId, this.data.contactIds).subscribe({
      next: (res) => {
        this.submitting = false;
        this.notification.success(
          `Added ${res.added_count} contacts to '${targetList?.name || 'Prospect List'}'.`
        );
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.submitting = false;
        const msg = err.error?.error || err.message || 'Failed to add contacts to list.';
        this.notification.error(msg);
      }
    });
  }
}
