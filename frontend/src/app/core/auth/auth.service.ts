import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/crm.model';
import { TokenService } from './token.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);

  // Signals
  readonly currentUser = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly userRole = computed(() => this.currentUser()?.role || null);

  constructor() {
    // If we have an access token, try to load current user profile
    const token = this.tokenService.getAccessToken();
    if (token) {
      this.loadCurrentUser().subscribe();
    }
  }

  login(credentials: { email: string; password_confirm?: string; password?: string }): Observable<any> {
    return this.http.post<{ access: string; refresh: string; user: User }>(
      `${environment.apiUrl}/auth/login/`,
      credentials
    ).pipe(
      tap((res) => {
        this.tokenService.saveTokens(res.access, res.refresh);
        this.currentUser.set(res.user);
      })
    );
  }

  logout(): void {
    this.tokenService.clearTokens();
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  loadCurrentUser(): Observable<User | null> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me/`).pipe(
      tap((user) => this.currentUser.set(user)),
      catchError(() => {
        this.tokenService.clearTokens();
        this.currentUser.set(null);
        return of(null);
      })
    );
  }

  updateProfile(data: Partial<User>): Observable<User> {
    return this.http.patch<User>(`${environment.apiUrl}/auth/me/`, data).pipe(
      tap((user) => this.currentUser.set(user))
    );
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/auth/password-reset/`, { email });
  }

  confirmPasswordReset(data: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/auth/password-reset-confirm/`, data);
  }
}
