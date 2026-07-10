import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ACCESS_TOKEN_KEY = 'radar36_access_token';
  private readonly REFRESH_TOKEN_KEY = 'radar36_refresh_token';

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  getAccessToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  saveTokens(access: string, refresh: string): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, access);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refresh);
  }

  clearTokens(): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }
}
