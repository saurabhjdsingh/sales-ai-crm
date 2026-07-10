import { Injectable, inject, signal, computed } from '@angular/core';
import { DealService } from './deal.service';
import { Deal, DealContact } from '../../../core/models/crm.model';
import { finalize, tap } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';

@Injectable({
  providedIn: 'root'
})
export class DealStore {
  private readonly dealService = inject(DealService);
  private readonly notification = inject(NotificationService);

  // State
  private readonly _deals = signal<Deal[]>([]);
  private readonly _pipeline = signal<Record<string, Deal[]>>({});
  private readonly _selectedDeal = signal<Deal | null>(null);
  private readonly _dealContacts = signal<DealContact[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _totalCount = signal<number>(0);
  private readonly _page = signal<number>(1);
  private readonly _filters = signal<Record<string, any>>({});

  // Selectors
  readonly deals = computed(() => this._deals());
  readonly pipeline = computed(() => this._pipeline());
  readonly selectedDeal = computed(() => this._selectedDeal());
  readonly dealContacts = computed(() => this._dealContacts());
  readonly loading = computed(() => this._loading());
  readonly totalCount = computed(() => this._totalCount());
  readonly page = computed(() => this._page());
  readonly filters = computed(() => this._filters());

  loadDeals(page = 1, filters = this._filters()): void {
    this._loading.set(true);
    this._page.set(page);
    this._filters.set(filters);

    this.dealService.getDeals({ page, ...filters }).pipe(
      tap((res) => {
        this._deals.set(res.results);
        this._totalCount.set(res.count);
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to load deals')
    });
  }

  loadPipeline(): void {
    this._loading.set(true);
    this.dealService.getPipeline().pipe(
      tap((res) => this._pipeline.set(res)),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to load deal pipeline')
    });
  }

  loadDeal(id: string): void {
    this._loading.set(true);
    this._selectedDeal.set(null);
    this._dealContacts.set([]);

    this.dealService.getDeal(id).pipe(
      tap((deal) => this._selectedDeal.set(deal)),
      finalize(() => this._loading.set(false))
    ).subscribe({
      next: () => this.loadDealContacts(id),
      error: () => this.notification.error('Failed to load deal details')
    });
  }

  loadDealContacts(dealId: string): void {
    this.dealService.getDealContacts(dealId).subscribe({
      next: (res) => this._dealContacts.set(res),
      error: () => this.notification.error('Failed to load contacts for this deal')
    });
  }

  createDeal(deal: Partial<Deal>, callback?: () => void): void {
    this._loading.set(true);
    this.dealService.createDeal(deal).pipe(
      tap((newDeal) => {
        this._deals.update((list) => [newDeal, ...list]);
        this.notification.success('Deal created successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to create deal';
        this.notification.error(msg);
      }
    });
  }

  updateDeal(id: string, updates: Partial<Deal>, callback?: () => void, silent = false): void {
    // 1. Save original states for rollback in case of error
    const originalDeals = [...this._deals()];
    const originalPipeline = { ...this._pipeline() };

    // 2. Perform optimistic update synchronously!
    this._deals.update((list) =>
      list.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );

    const pipe = { ...this._pipeline() };
    if (Object.keys(pipe).length > 0) {
      let found = false;
      let foundDeal: Deal | null = null;
      for (const stage in pipe) {
        const idx = pipe[stage].findIndex((d) => d.id === id);
        if (idx !== -1) {
          foundDeal = { ...pipe[stage][idx], ...updates };
          pipe[stage] = pipe[stage].filter((d) => d.id !== id);
          found = true;
          break;
        }
      }
      if (found && foundDeal && foundDeal.stage) {
        pipe[foundDeal.stage] = [foundDeal, ...(pipe[foundDeal.stage] || [])];
      }
      this._pipeline.set(pipe);
    }

    if (!silent) {
      this._loading.set(true);
    }

    this.dealService.updateDeal(id, updates).pipe(
      tap((updated) => {
        // 3. Overwrite optimistic update with actual server response
        this._deals.update((list) => list.map((d) => (d.id === id ? updated : d)));
        if (this._selectedDeal()?.id === id) {
          this._selectedDeal.set(updated);
        }
        // Sync pipeline with server response
        const syncPipe = { ...this._pipeline() };
        if (Object.keys(syncPipe).length > 0) {
          for (const stage in syncPipe) {
            syncPipe[stage] = syncPipe[stage].map((d) => (d.id === id ? updated : d));
          }
          this._pipeline.set(syncPipe);
        }

        if (!silent) {
          this.notification.success('Deal updated successfully');
        }
        if (callback) callback();
      }),
      finalize(() => {
        if (!silent) {
          this._loading.set(false);
        }
      })
    ).subscribe({
      error: (err) => {
        // 4. Rollback to original state on error
        this._deals.set(originalDeals);
        this._pipeline.set(originalPipeline);

        const msg = err.error?.error?.message || 'Failed to update deal';
        this.notification.error(msg);
      }
    });
  }

  deleteDeal(id: string, callback?: () => void): void {
    this._loading.set(true);
    this.dealService.deleteDeal(id).pipe(
      tap(() => {
        this._deals.update((list) => list.filter((d) => d.id !== id));
        if (this._selectedDeal()?.id === id) {
          this._selectedDeal.set(null);
        }
        this.notification.success('Deal deleted successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete deal')
    });
  }

  bulkDeleteDeals(ids: string[], callback?: () => void): void {
    this._loading.set(true);
    this.dealService.bulkDeleteDeals(ids).pipe(
      tap(() => {
        this._deals.update((list) => list.filter((d) => !ids.includes(d.id)));
        if (this._selectedDeal() && ids.includes(this._selectedDeal()!.id)) {
          this._selectedDeal.set(null);
        }
        this._pipeline.update((pipe) => {
          const newPipe = { ...pipe };
          for (const stage in newPipe) {
            newPipe[stage] = newPipe[stage].filter((d) => !ids.includes(d.id));
          }
          return newPipe;
        });
        this.notification.success('Selected deals deleted successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete selected deals')
    });
  }

  addDealContact(dealId: string, contactId: string, role: string, isPrimary: boolean): void {
    this.dealService.addDealContact(dealId, contactId, role, isPrimary).subscribe({
      next: () => {
        this.notification.success('Contact added to deal');
        this.loadDealContacts(dealId);
      },
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to add contact to deal';
        this.notification.error(msg);
      }
    });
  }

  removeDealContact(dealId: string, contactId: string): void {
    this.dealService.removeDealContact(dealId, contactId).subscribe({
      next: () => {
        this.notification.success('Contact removed from deal');
        this.loadDealContacts(dealId);
      },
      error: () => this.notification.error('Failed to remove contact from deal')
    });
  }
}
