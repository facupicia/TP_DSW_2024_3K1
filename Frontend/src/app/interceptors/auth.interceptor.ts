import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, Observable, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { clearAccessToken, getAccessToken, setAccessToken } from '../services/access-token.store';

let refreshRequest$: Observable<{ token: string }> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const http = inject(HttpClient);

    if (req.url.startsWith('//')) {
        return throwError(() => new Error('Blocked protocol-relative HTTP request'));
    }

    const isApiRequest = req.url.startsWith(environment.apiUrl);
    const token = isApiRequest ? getAccessToken() : null;

    const isAuthEndpoint = isApiRequest && (req.url.includes('/user/login')
        || req.url.includes('/user/google')
        || req.url.includes('/user/refresh')
        || req.url.includes('/user/logout'));

    const cloned = isApiRequest ? req.clone({
        withCredentials: true,
        ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {})
    }) : req;

    return next(cloned).pipe(
        catchError((error: HttpErrorResponse) => {
            if (!isApiRequest || error.status !== 401 || isAuthEndpoint || typeof window === 'undefined') {
                return throwError(() => error);
            }

            if (!refreshRequest$) {
                refreshRequest$ = http.post<{ token: string }>(`${environment.apiUrl}/user/refresh`, {}, { withCredentials: true }).pipe(
                    tap((resp) => {
                        if (resp?.token) {
                            setAccessToken(resp.token);
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
                    clearAccessToken();
                    return throwError(() => refreshError);
                })
            );
        })
    );
};
