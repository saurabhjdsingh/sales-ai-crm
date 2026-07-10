import { Injectable, inject, signal, computed } from '@angular/core';
import { CompanyService } from './company.service';
import { Company, CompanyResearch } from '../../../core/models/crm.model';
import { finalize, tap } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';

@Injectable({
  providedIn: 'root'
})
export class CompanyStore {
  private readonly companyService = inject(CompanyService);
  private readonly notification = inject(NotificationService);

  // State
  private readonly _companies = signal<Company[]>([]);
  private readonly _selectedCompany = signal<Company | null>(null);
  private readonly _research = signal<CompanyResearch | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _totalCount = signal<number>(0);
  private readonly _page = signal<number>(1);
  private readonly _filters = signal<Record<string, any>>({});

  // Selectors (Read-only signals)
  readonly companies = computed(() => this._companies());
  readonly selectedCompany = computed(() => this._selectedCompany());
  readonly research = computed(() => this._research());
  readonly loading = computed(() => this._loading());
  readonly totalCount = computed(() => this._totalCount());
  readonly page = computed(() => this._page());
  readonly filters = computed(() => this._filters());

  loadCompanies(page = 1, filters = this._filters()): void {
    this._loading.set(true);
    this._page.set(page);
    this._filters.set(filters);

    this.companyService.getCompanies({ page, ...filters }).pipe(
      tap((res) => {
        this._companies.set(res.results);
        this._totalCount.set(res.count);
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to load companies')
    });
  }

  loadCompany(id: string): void {
    this._loading.set(true);
    this._selectedCompany.set(null);
    this._research.set(null);

    this.companyService.getCompany(id).pipe(
      tap((company) => this._selectedCompany.set(company)),
      finalize(() => this._loading.set(false))
    ).subscribe({
      next: () => this.loadResearch(id),
      error: () => this.notification.error('Failed to load company details')
    });
  }

  loadResearch(id: string): void {
    this.companyService.getResearchResults(id).subscribe({
      next: (res) => this._research.set(res),
      error: () => {
        // Silent fail if no research exists yet
        this._research.set(null);
      }
    });
  }

  createCompany(company: Partial<Company>, callback?: () => void): void {
    this._loading.set(true);
    this.companyService.createCompany(company).pipe(
      tap((newCompany) => {
        this._companies.update((list) => [newCompany, ...list]);
        this.notification.success('Company created successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to create company';
        this.notification.error(msg);
      }
    });
  }

  updateCompany(id: string, updates: Partial<Company>, callback?: () => void): void {
    this._loading.set(true);
    this.companyService.updateCompany(id, updates).pipe(
      tap((updated) => {
        this._companies.update((list) => list.map((c) => (c.id === id ? updated : c)));
        if (this._selectedCompany()?.id === id) {
          this._selectedCompany.set(updated);
        }
        this.notification.success('Company updated successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to update company';
        this.notification.error(msg);
      }
    });
  }

  deleteCompany(id: string, callback?: () => void): void {
    this._loading.set(true);
    this.companyService.deleteCompany(id).pipe(
      tap(() => {
        this._companies.update((list) => list.filter((c) => c.id !== id));
        if (this._selectedCompany()?.id === id) {
          this._selectedCompany.set(null);
        }
        this.notification.success('Company deleted successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete company')
    });
  }

  bulkDeleteCompanies(ids: string[], callback?: () => void): void {
    this._loading.set(true);
    this.companyService.bulkDeleteCompanies(ids).pipe(
      tap(() => {
        this._companies.update((list) => list.filter((c) => !ids.includes(c.id)));
        if (this._selectedCompany() && ids.includes(this._selectedCompany()!.id)) {
          this._selectedCompany.set(null);
        }
        this.notification.success('Selected companies deleted successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete selected companies')
    });
  }

  triggerResearch(id: string): void {
    this.companyService.triggerResearch(id).subscribe({
      next: (res) => {
        this.notification.success(res.message);
        // Refresh selected company or research state after short delay
        setTimeout(() => this.loadCompany(id), 2000);
      },
      error: () => this.notification.error('Failed to trigger AI research')
    });
  }
}
