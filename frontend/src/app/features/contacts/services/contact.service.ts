import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { Contact, PaginatedResult } from '../../../core/models/crm.model';

@Injectable({
  providedIn: 'root'
})
export class ContactService {
  private readonly api = inject(ApiService);

  getContacts(filters?: Record<string, any>): Observable<PaginatedResult<Contact>> {
    return this.api.get<PaginatedResult<Contact>>('/contacts/', filters);
  }

  getContact(id: string): Observable<Contact> {
    return this.api.get<Contact>(`/contacts/${id}/`);
  }

  createContact(contact: Partial<Contact>): Observable<Contact> {
    return this.api.post<Contact>('/contacts/', contact);
  }

  updateContact(id: string, contact: Partial<Contact>): Observable<Contact> {
    return this.api.patch<Contact>(`/contacts/${id}/`, contact);
  }

  deleteContact(id: string): Observable<void> {
    return this.api.delete<void>(`/contacts/${id}/`);
  }

  bulkDeleteContacts(ids: string[]): Observable<void> {
    return this.api.post<void>('/contacts/bulk-delete/', { ids });
  }
}
