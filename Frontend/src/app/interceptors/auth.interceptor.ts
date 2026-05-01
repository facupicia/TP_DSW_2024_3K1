import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, Observable, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

let refreshRequest$: Observable<{ token: string }> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const http = inject(HttpClient);
    const token = typeof window !== 'undefined' && window.localStorage
        ? localStorage.getItem('token')
        : null;

    const isAuthEndpoint = req.url.includes('/user/login')
        || req.url.includes('/user/google')
        || req.url.includes('/user/refresh')
        || req.url.includes('/user/logout');

    const cloned = req.clone({
        withCredentials: true,
        ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {})
    });

    return next(cloned).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status !== 401 || isAuthEndpoint || typeof window === 'undefined') {
                return throwError(() => error);
            }

            if (!refreshRequest$) {
                refreshRequest$ = http.post<{ token: string }>(`${environment.apiUrl}/user/refresh`, {}, { withCredentials: true }).pipe(
                    tap((resp) => {
                        if (resp?.token) {
                            localStorage.setItem('token', resp.token);
                        }
                    }),
                    finalize(() => {
                        refreshRequest$ = null;
                    }),
                    shareReplay({ bufferSize: 1, refCount: false })
                );
            }

            return refreshRequest$.pipe(
                switchMap((resp) => next(req.clone({
                    withCredentials: true,
                    ...(resp?.token ? { setHeaders: { Authorization: `Bearer ${resp.token}` } } : {})
                }))),
                catchError((refreshError) => {
                    localStorage.removeItem('token');
                    return throwError(() => refreshError);
                })
            );
        })
    );
};
