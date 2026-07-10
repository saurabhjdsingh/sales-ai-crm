import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { Deal, DealContact, PaginatedResult } from '../../../core/models/crm.model';

@Injectable({
  providedIn: 'root'
})
export class DealService {
  private readonly api = inject(ApiService);

  getDeals(filters?: Record<string, any>): Observable<PaginatedResult<Deal>> {
    return this.api.get<PaginatedResult<Deal>>('/deals/', filters);
  }

  getDeal(id: string): Observable<Deal> {
    return this.api.get<Deal>(`/deals/${id}/`);
  }

  createDeal(deal: Partial<Deal>): Observable<Deal> {
    return this.api.post<Deal>('/deals/', deal);
  }

  updateDeal(id: string, deal: Partial<Deal>): Observable<Deal> {
    return this.api.patch<Deal>(`/deals/${id}/`, deal);
  }

  deleteDeal(id: string): Observable<void> {
    return this.api.delete<void>(`/deals/${id}/`);
  }

  bulkDeleteDeals(ids: string[]): Observable<void> {
    return this.api.post<void>('/deals/bulk-delete/', { ids });
  }

  getPipeline(): Observable<Record<string, Deal[]>> {
    return this.api.get<Record<string, Deal[]>>('/deals/pipeline/');
  }

  getDealContacts(dealId: string): Observable<DealContact[]> {
    return this.api.get<DealContact[]>(`/deals/${dealId}/contacts/`);
  }

  addDealContact(dealId: string, contactId: string, role: string, isPrimary: boolean): Observable<DealContact> {
    return this.api.post<DealContact>(`/deals/${dealId}/contacts/`, {
      contact: contactId,
      role,
      is_primary: isPrimary
    });
  }

  removeDealContact(dealId: string, contactId: string): Observable<void> {
    return this.api.delete<void>(`/deals/${dealId}/contacts/${contactId}/`);
  }
}
