import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { Company, CompanyResearch, PaginatedResult } from '../../../core/models/crm.model';

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private readonly api = inject(ApiService);

  getCompanies(filters?: Record<string, any>): Observable<PaginatedResult<Company>> {
    return this.api.get<PaginatedResult<Company>>('/companies/', filters);
  }

  getCompany(id: string): Observable<Company> {
    return this.api.get<Company>(`/companies/${id}/`);
  }

  createCompany(company: Partial<Company>): Observable<Company> {
    return this.api.post<Company>('/companies/', company);
  }

  updateCompany(id: string, company: Partial<Company>): Observable<Company> {
    return this.api.patch<Company>(`/companies/${id}/`, company);
  }

  deleteCompany(id: string): Observable<void> {
    return this.api.delete<void>(`/companies/${id}/`);
  }

  bulkDeleteCompanies(ids: string[]): Observable<void> {
    return this.api.post<void>('/companies/bulk-delete/', { ids });
  }

  triggerResearch(id: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/companies/${id}/research/`, {});
  }

  getResearchResults(id: string): Observable<CompanyResearch> {
    return this.api.get<CompanyResearch>(`/companies/${id}/research-results/`);
  }
}
