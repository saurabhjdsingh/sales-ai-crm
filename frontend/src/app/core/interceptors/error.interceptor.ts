import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { TokenService } from '../auth/token.service';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';

const isRefreshing = new BehaviorSubject<boolean>(false);
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);
  const http = inject(HttpClient);

  return next(req).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // If the request was to login or refresh itself, fail immediately
        if (req.url.includes('/auth/login/') || req.url.includes('/auth/refresh/')) {
          tokenService.clearTokens();
          return throwError(() => error);
        }

        const refreshToken = tokenService.getRefreshToken();
        if (!refreshToken) {
          tokenService.clearTokens();
          router.navigate(['/login']);
          return throwError(() => error);
        }

        if (!isRefreshing.value) {
          isRefreshing.next(true);
          refreshTokenSubject.next(null);

          return http.post<{ access: string; refresh?: string }>(`${environment.apiUrl}/auth/refresh/`, {
            refresh: refreshToken
          }).pipe(
            switchMap((res) => {
              isRefreshing.next(false);
              const newAccess = res.access;
              const newRefresh = res.refresh || refreshToken; // fallback to existing refresh if not rotated
              tokenService.saveTokens(newAccess, newRefresh);
              refreshTokenSubject.next(newAccess);

              const cloned = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newAccess}`
                }
              });
              return next(cloned);
            }),
            catchError((refreshError) => {
              isRefreshing.next(false);
              tokenService.clearTokens();
              router.navigate(['/login']);
              return throwError(() => refreshError);
            })
          );
        } else {
          return refreshTokenSubject.pipe(
            filter((token) => token !== null),
            take(1),
            switchMap((token) => {
              const cloned = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${token}`
                }
              });
              return next(cloned);
            })
          );
        }
      }

      return throwError(() => error);
    })
  );
};
