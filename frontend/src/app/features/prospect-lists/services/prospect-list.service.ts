import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Company, Contact, ProspectList } from '../../../core/models/crm.model';

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

@Injectable({
  providedIn: 'root'
})
export class ProspectListService {
  private http = inject(HttpClient);
  private apiUrl = '/api/v1/prospect-lists/';

  getProspectLists(params?: {
    search?: string;
    source?: string;
    is_active?: boolean;
    page?: number;
    page_size?: number;
  }): Observable<PaginatedResponse<ProspectList>> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.source) httpParams = httpParams.set('source', params.source);
      if (params.is_active !== undefined) httpParams = httpParams.set('is_active', params.is_active);
      if (params.page) httpParams = httpParams.set('page', params.page);
      if (params.page_size) httpParams = httpParams.set('page_size', params.page_size);
    }
    return this.http.get<PaginatedResponse<ProspectList>>(this.apiUrl, { params: httpParams });
  }

  getProspectList(id: string): Observable<ProspectList> {
    return this.http.get<ProspectList>(`${this.apiUrl}${id}/`);
  }

  createProspectList(data: Partial<ProspectList>): Observable<ProspectList> {
    return this.http.post<ProspectList>(this.apiUrl, data);
  }

  updateProspectList(id: string, data: Partial<ProspectList>): Observable<ProspectList> {
    return this.http.patch<ProspectList>(`${this.apiUrl}${id}/`, data);
  }

  deleteProspectList(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}${id}/`);
  }

  getProspectListCompanies(id: string, params?: { page?: number; page_size?: number }): Observable<PaginatedResponse<Company>> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.page_size) httpParams = httpParams.set('page_size', params.page_size);
    return this.http.get<PaginatedResponse<Company>>(`${this.apiUrl}${id}/companies/`, { params: httpParams });
  }

  getProspectListContacts(id: string, params?: { page?: number; page_size?: number }): Observable<PaginatedResponse<Contact>> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.page_size) httpParams = httpParams.set('page_size', params.page_size);
    return this.http.get<PaginatedResponse<Contact>>(`${this.apiUrl}${id}/contacts/`, { params: httpParams });
  }

  addCompanyToList(listId: string, companyId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}${listId}/add-company/`, { company_id: companyId });
  }

  removeCompanyFromList(listId: string, companyId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}${listId}/remove-company/`, { company_id: companyId });
  }

  addContactToList(listId: string, contactId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}${listId}/add-contact/`, { contact_id: contactId });
  }

  removeContactFromList(listId: string, contactId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}${listId}/remove-contact/`, { contact_id: contactId });
  }

  bulkAddContacts(listId: string, contactIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}${listId}/bulk-add-contacts/`, { contact_ids: contactIds });
  }
}
