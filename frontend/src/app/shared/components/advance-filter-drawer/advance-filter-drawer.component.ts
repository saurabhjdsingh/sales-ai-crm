import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ProspectListService } from '../../../features/prospect-lists/services/prospect-list.service';
import { CountryOption, CountryService } from '../../../core/services/country.service';
import { ProspectList } from '../../../core/models/crm.model';

export interface AdvanceFilterState {
  list?: string;
  country?: string;
  stage?: string;
  company_size?: string;
  icp_score_min?: number;
  icp_score_max?: number;
  search?: string;
}

@Component({
  selector: 'app-advance-filter-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule],
  template: `
    <!-- Backdrop Overlay -->
    <div
      *ngIf="isOpen"
      class="drawer-backdrop"
      (click)="closeDrawer()"
    ></div>

    <!-- Right Slide-Over Panel -->
    <div class="drawer-panel" [class.open]="isOpen">
      <!-- Header -->
      <div class="drawer-header">
        <div class="header-info">
          <div class="header-icon-box">
            <mat-icon>tune</mat-icon>
          </div>
          <div>
            <h3 class="drawer-title">Advance Filters</h3>
            <p class="drawer-subtitle">Refine prospects by list, country & criteria</p>
          </div>
        </div>
        <button mat-icon-button (click)="closeDrawer()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- Body Form -->
      <div class="drawer-body">
        <!-- Prospect List Filter -->
        <div class="filter-group">
          <label class="filter-label">Prospect List</label>
          <select [(ngModel)]="filterState.list" class="filter-select-input">
            <option value="">All Lists (Any)</option>
            <option value="no_list">-- No List (Unassigned) --</option>
            <option *ngFor="let pl of prospectLists" [value]="pl.id">
              {{ pl.name }} ({{ entityType === 'company' ? pl.company_count : pl.contact_count }})
            </option>
          </select>
        </div>

        <!-- Country Filter -->
        <div class="filter-group">
          <label class="filter-label">Country Segment</label>
          <select [(ngModel)]="filterState.country" class="filter-select-input">
            <option value="">All Countries (Any)</option>
            <option value="no_country">-- No Country (Unassigned) --</option>
            <option *ngFor="let c of countries" [value]="c.code">
              {{ c.name }} ({{ c.code }})
            </option>
          </select>
        </div>

        <!-- Stage Filter -->
        <div class="filter-group">
          <label class="filter-label">Stage</label>
          <select [(ngModel)]="filterState.stage" class="filter-select-input">
            <option value="">All Stages</option>
            <ng-container *ngIf="entityType === 'company'">
              <option value="cold">Cold</option>
              <option value="active_opportunity">Active Opportunity</option>
              <option value="current_client">Current Client</option>
              <option value="dead_opportunity">Dead Opportunity</option>
              <option value="do_not_prospect">Do Not Prospect</option>
            </ng-container>
            <ng-container *ngIf="entityType === 'contact'">
              <option value="cold">Cold</option>
              <option value="approaching">Approaching</option>
              <option value="replied">Replied</option>
              <option value="follow_up">Follow Up</option>
              <option value="interested">Interested</option>
              <option value="not_icp">Not ICP</option>
              <option value="not_interested">Not Interested</option>
              <option value="unresponsive">Unresponsive</option>
              <option value="do_not_contact">Do Not Contact</option>
              <option value="bad_data">Bad Data</option>
              <option value="changed_job">Changed Job</option>
              <option value="on_hold">On-Hold</option>
              <option value="won">Won</option>
            </ng-container>
          </select>
        </div>

        <!-- Company Size Filter -->
        <div class="filter-group">
          <label class="filter-label">Company Size</label>
          <select [(ngModel)]="filterState.company_size" class="filter-select-input">
            <option value="">Any Size</option>
            <option value="1-10">1-10 Employees</option>
            <option value="11-50">11-50 Employees</option>
            <option value="51-200">51-200 Employees</option>
            <option value="201-500">201-500 Employees</option>
            <option value="501-1000">501-1000 Employees</option>
            <option value="1001+">1001+ Employees</option>
          </select>
        </div>

        <!-- ICP Score Range (Company specific) -->
        <div *ngIf="entityType === 'company'" class="grid-two">
          <div class="filter-group">
            <label class="filter-label">Min ICP Score</label>
            <input
              type="number"
              min="0"
              max="100"
              [(ngModel)]="filterState.icp_score_min"
              placeholder="e.g. 70"
              class="filter-text-input"
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">Max ICP Score</label>
            <input
              type="number"
              min="0"
              max="100"
              [(ngModel)]="filterState.icp_score_max"
              placeholder="e.g. 100"
              class="filter-text-input"
            />
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="drawer-footer">
        <button mat-button (click)="clearFilters()" class="reset-btn">
          Reset All
        </button>
        <button mat-flat-button color="primary" (click)="applyFilters()" class="apply-btn">
          Apply Filters
        </button>
      </div>
    </div>
  `,
  styles: [`
    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 999;
    }

    .drawer-panel {
      position: fixed;
      top: 0;
      bottom: 0;
      right: 0;
      width: 100%;
      max-width: 420px;
      background-color: #0f172a;
      border-left: 1px solid #1e293b;
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .drawer-panel.open {
      transform: translateX(0);
    }

    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #1e293b;
      background-color: rgba(15, 23, 42, 0.8);
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .header-icon-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background-color: rgba(99, 102, 241, 0.12);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }

    .drawer-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
    }

    .drawer-subtitle {
      font-size: 0.75rem;
      color: #94a3b8;
      margin: 0.15rem 0 0 0;
    }

    .close-btn {
      color: #64748b;
    }

    .close-btn:hover {
      color: #f8fafc;
    }

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .filter-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }

    .filter-select-input, .filter-text-input {
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

    .filter-select-input:focus, .filter-text-input:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }

    .grid-two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .drawer-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid #1e293b;
      background-color: rgba(15, 23, 42, 0.5);
    }

    .reset-btn {
      color: #94a3b8 !important;
    }

    .apply-btn {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      font-weight: 600;
      border-radius: 8px;
      height: 40px;
    }

    /* Light Mode Overrides */
    :host-context(body.light-theme) .drawer-panel { background-color: #ffffff; border-left-color: #e2e8f0; }
    :host-context(body.light-theme) .drawer-header { background-color: #f8fafc; border-bottom-color: #e2e8f0; }
    :host-context(body.light-theme) .drawer-title { color: #0f172a; }
    :host-context(body.light-theme) .drawer-subtitle { color: #64748b; }
    :host-context(body.light-theme) .filter-label { color: #64748b; }
    :host-context(body.light-theme) .filter-select-input, :host-context(body.light-theme) .filter-text-input { background-color: #f8fafc; border-color: #cbd5e1; color: #0f172a; }
    :host-context(body.light-theme) .drawer-footer { background-color: #f8fafc; border-top-color: #e2e8f0; }
    :host-context(body.light-theme) .reset-btn { color: #64748b !important; }
  `]
})
export class AdvanceFilterDrawerComponent implements OnInit {
  @Input() isOpen = false;
  @Input() entityType: 'company' | 'contact' = 'company';
  @Input() initialFilters: AdvanceFilterState = {};
  @Output() isOpenChange = new EventEmitter<boolean>();
  @Output() filtersApplied = new EventEmitter<AdvanceFilterState>();

  filterState: AdvanceFilterState = {
    list: '',
    country: '',
    stage: '',
    company_size: '',
  };

  prospectLists: ProspectList[] = [];
  countries: CountryOption[] = [];

  private readonly prospectListService: ProspectListService = inject(ProspectListService);
  private readonly countryService: CountryService = inject(CountryService);

  ngOnInit(): void {
    this.filterState = { ...this.initialFilters };
    this.loadProspectLists();
    this.loadCountries();
  }

  loadProspectLists(): void {
    this.prospectListService.getProspectLists({ page_size: 100, is_active: true }).subscribe({
      next: (res: any) => (this.prospectLists = res.results || []),
      error: (err: any) => console.error('Failed to load prospect lists for filter', err)
    });
  }

  loadCountries(): void {
    this.countryService.getCountries().subscribe({
      next: (data: CountryOption[]) => (this.countries = data || []),
      error: (err: any) => console.error('Failed to load country list for filter', err)
    });
  }

  closeDrawer(): void {
    this.isOpen = false;
    this.isOpenChange.emit(false);
  }

  clearFilters(): void {
    this.filterState = {
      list: '',
      country: '',
      stage: '',
      company_size: '',
      icp_score_min: undefined,
      icp_score_max: undefined,
      search: ''
    };
    this.applyFilters();
  }

  applyFilters(): void {
    this.filtersApplied.emit({ ...this.filterState });
    this.closeDrawer();
  }
}
