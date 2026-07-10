import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BrandingData {
  organization_name: string;
  logo_url: string | null;
  has_logo: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BrandingService {
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);

  private readonly defaultName = 'Sales AI CRM';

  readonly organizationName = signal<string>(this.defaultName);
  readonly logoUrl = signal<string | null>(null);
  readonly hasLogo = signal<boolean>(false);

  constructor() {
    this.loadBranding();
  }

  loadBranding(): void {
    this.http.get<BrandingData>(`${environment.apiUrl}/auth/organization/branding/`).subscribe({
      next: (data) => {
        this.updateState(data);
      },
      error: (err) => {
        console.error('Failed to load branding data:', err);
        this.titleService.setTitle(this.defaultName);
      }
    });
  }

  updateBranding(name: string, logo: File | null, removeLogo: boolean): Observable<BrandingData> {
    const formData = new FormData();
    if (name) {
      formData.append('organization_name', name);
    }
    if (logo) {
      formData.append('logo', logo);
    }
    if (removeLogo) {
      formData.append('remove_logo', 'true');
    }

    return this.http.put<BrandingData>(`${environment.apiUrl}/auth/organization/branding/`, formData).pipe(
      tap((data) => {
        this.updateState(data);
      })
    );
  }

  private updateState(data: BrandingData): void {
    // Fallback to DEFAULT platform name if name is empty or default backend name "Sales AI CRM"
    // (since prompt says "By default make the platform name as Sales AI CRM")
    const name = (data.organization_name === 'Sales AI CRM' || !data.organization_name)
      ? this.defaultName
      : data.organization_name;

    this.organizationName.set(name);
    this.logoUrl.set(data.logo_url);
    this.hasLogo.set(data.has_logo);
    this.titleService.setTitle(name);

    // Update favicon dynamically
    const favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (favicon) {
      favicon.href = data.logo_url || 'favicon.ico';
    }
  }
}
