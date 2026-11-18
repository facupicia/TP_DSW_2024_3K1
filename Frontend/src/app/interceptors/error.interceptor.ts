import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { clearAccessToken } from '../services/access-token.store';
import { LOCAL_ERROR_FEEDBACK } from './error-context';

// Timestamp-based dedup for 401->login navigation (self-healing vs module-level mutable flag)
let lastNavigationToLoginAt = 0;
const LOGIN_NAVIGATION_COOLDOWN_MS = 3000;

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const toastService = inject(ToastService);
    const router = inject(Router);
    const injector = inject(Injector);
    const isSilentAuthRequest = req.url.includes('/user/refresh')
        || req.url.includes('/user/logout');
    const localFeedback = req.context.get(LOCAL_ERROR_FEEDBACK);
    const isCredentialRequest = req.url.includes('/user/login') || req.url.includes('/user/google') || req.url.includes('/user/register');

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            if (typeof window === 'undefined' || (localFeedback && (error.status !== 401 || isCredentialRequest))) {
                return throwError(() => error);
            }
            if (error.status === 401 && isSilentAuthRequest) {
                return throwError(() => error);
            }

            const authService = injector.get(AuthService);
            let errorMessage = 'Ocurrió un error inesperado';

            if (typeof ErrorEvent !== 'undefined' && error.error instanceof ErrorEvent) {
                // Error del lado del cliente
                errorMessage = `Error: ${error.error.message}`;
            } else {
                // Error del lado del servidor
                switch (error.status) {
                    case 400:
                        errorMessage = error.error?.message || 'Solicitud incorrecta.';
                        break;
                    case 401:
                        errorMessage = 'Sesión expirada o credenciales inválidas.';
                        const now = Date.now();
                        if (now - lastNavigationToLoginAt > LOGIN_NAVIGATION_COOLDOWN_MS) {
                            lastNavigationToLoginAt = now;
                            clearAccessToken();
                            authService.logout();
                            router.navigate(['/login']);
                        }
                        break;
                    case 403:
                        errorMessage = error.error?.message || 'No tienes permisos para realizar esta acción.';
                        break;
                    case 429:
                        errorMessage = 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.';
                        break;
                    case 404:
                        errorMessage = 'Recurso no encontrado.';
                        break;
                    case 500:
                        errorMessage = 'Error interno del servidor. Por favor, intenta más tarde.';
                        break;
                    default:
                        errorMessage = error.status === 0
                            ? 'No se pudo conectar. Revisá tu conexión e intentá nuevamente.'
                            : `Error ${error.status}: ${error.error?.message || error.message}`;
                }
            }

            if (!localFeedback) toastService.error(errorMessage);
            return throwError(() => error);
        })
    );
};
