import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged, filter, switchMap, tap } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

interface SearchResultItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  url: string;
}

interface SearchResults {
  companies: SearchResultItem[];
  contacts: SearchResultItem[];
  deals: SearchResultItem[];
  notes: SearchResultItem[];
  tasks: SearchResultItem[];
}

@Component({
  selector: 'app-search-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="search-container">
      <div class="search-input-wrapper">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          #searchInput
          [formControl]="searchControl"
          type="text"
          placeholder="Search companies, contacts, deals, tasks..."
          class="search-input"
          autofocus
        />
        <button mat-icon-button (click)="dialogRef.close()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="search-results-wrapper">
        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        } @else if (hasResults()) {
          <div class="results-list">
            <!-- Companies -->
            @if (results().companies.length > 0) {
              <div class="category-section">
                <div class="category-header">Companies</div>
                @for (item of results().companies; track item.id) {
                  <div class="result-item" (click)="navigate(item.url)">
                    <mat-icon class="type-icon company-icon">business</mat-icon>
                    <div class="item-info">
                      <div class="item-title">{{ item.title }}</div>
                      <div class="item-subtitle">{{ item.subtitle }}</div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Contacts -->
            @if (results().contacts.length > 0) {
              <div class="category-section">
                <div class="category-header">Contacts</div>
                @for (item of results().contacts; track item.id) {
                  <div class="result-item" (click)="navigate(item.url)">
                    <mat-icon class="type-icon contact-icon">person</mat-icon>
                    <div class="item-info">
                      <div class="item-title">{{ item.title }}</div>
                      <div class="item-subtitle">{{ item.subtitle }}</div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Deals -->
            @if (results().deals.length > 0) {
              <div class="category-section">
                <div class="category-header">Deals</div>
                @for (item of results().deals; track item.id) {
                  <div class="result-item" (click)="navigate(item.url)">
                    <mat-icon class="type-icon deal-icon">monetization_on</mat-icon>
                    <div class="item-info">
                      <div class="item-title">{{ item.title }}</div>
                      <div class="item-subtitle">{{ item.subtitle }}</div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Tasks -->
            @if (results().tasks.length > 0) {
              <div class="category-section">
                <div class="category-header">Tasks</div>
                @for (item of results().tasks; track item.id) {
                  <div class="result-item" (click)="navigate(item.url)">
                    <mat-icon class="type-icon task-icon">assignment</mat-icon>
                    <div class="item-info">
                      <div class="item-title">{{ item.title }}</div>
                      <div class="item-subtitle">{{ item.subtitle }}</div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Notes -->
            @if (results().notes.length > 0) {
              <div class="category-section">
                <div class="category-header">Notes</div>
                @for (item of results().notes; track item.id) {
                  <div class="result-item" (click)="navigate(item.url)">
                    <mat-icon class="type-icon note-icon">note</mat-icon>
                    <div class="item-info">
                      <div class="item-title">{{ item.title }}</div>
                      <div class="item-subtitle">{{ item.subtitle }}</div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        } @else if (searchControl.value && searchControl.value.length >= 2) {
          <div class="empty-state">
            <mat-icon class="empty-icon">search_off</mat-icon>
            <div class="empty-text">No results found for "{{ searchControl.value }}"</div>
          </div>
        } @else {
          <div class="instruction-state">
            <mat-icon class="instruction-icon">keyboard</mat-icon>
            <div class="instruction-text">Type at least 2 characters to search global records...</div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .search-container {
      background-color: #0b1329;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }

    .search-input-wrapper {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .search-icon {
      color: #3b82f6;
      margin-right: 0.75rem;
    }

    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 1.1rem;
      outline: none;
      padding: 0.5rem 0;
    }

    .search-input::placeholder {
      color: #475569;
    }

    .close-btn {
      color: #64748b !important;
    }

    .search-results-wrapper {
      max-height: 480px;
      overflow-y: auto;
      min-height: 120px;
      display: flex;
      flex-direction: column;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem;
    }

    .results-list {
      padding: 0.75rem;
    }

    .category-section {
      margin-bottom: 1rem;
    }

    .category-header {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.5rem;
      margin-bottom: 0.25rem;
    }

    .result-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.75rem;
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .result-item:hover {
      background-color: rgba(255, 255, 255, 0.03);
    }

    .type-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .company-icon { color: #3b82f6; }
    .contact-icon { color: #10b981; }
    .deal-icon { color: #f59e0b; }
    .task-icon { color: #ec4899; }
    .note-icon { color: #8b5cf6; }

    .item-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .item-title {
      font-weight: 500;
      font-size: 0.9rem;
      color: #f8fafc;
    }

    .item-subtitle {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .empty-state, .instruction-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      color: #475569;
      text-align: center;
    }

    .empty-icon, .instruction-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      margin-bottom: 0.75rem;
    }

    .empty-text, .instruction-text {
      font-size: 0.9rem;
    }
  `]
})
export class SearchDialogComponent {
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  readonly dialogRef = inject(MatDialogRef<SearchDialogComponent>);

  @ViewChild('searchInput') readonly searchInput!: ElementRef<HTMLInputElement>;

  readonly searchControl = new FormControl('');
  readonly loading = signal(false);
  readonly results = signal<SearchResults>({
    companies: [],
    contacts: [],
    deals: [],
    notes: [],
    tasks: []
  });
  readonly hasResults = signal(false);

  constructor() {
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap((val) => {
        if (!val || val.length < 2) {
          this.results.set({ companies: [], contacts: [], deals: [], notes: [], tasks: [] });
          this.hasResults.set(false);
          this.loading.set(false);
        } else {
          this.loading.set(true);
        }
      }),
      filter((val): val is string => !!val && val.length >= 2),
      switchMap((val) => this.apiService.get<SearchResults>('/search/', { q: val })),
      tap((res) => {
        this.results.set(res);
        const count =
          res.companies.length +
          res.contacts.length +
          res.deals.length +
          res.notes.length +
          res.tasks.length;
        this.hasResults.set(count > 0);
        this.loading.set(false);
      })
    ).subscribe();
  }

  navigate(url: string): void {
    this.router.navigateByUrl(url);
    this.dialogRef.close();
  }
}
