import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { clearAccessToken } from '../services/access-token.store';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const toastService = inject(ToastService);
    const router = inject(Router);
    const injector = inject(Injector);
    const isSilentAuthRequest = req.url.includes('/user/refresh')
        || req.url.includes('/user/logout');

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
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
                        errorMessage = error.error.message || 'Solicitud incorrecta.';
                        break;
                    case 401:
                        errorMessage = 'Sesión expirada o credenciales inválidas.';
                        clearAccessToken();
                        authService.logout();
                        router.navigate(['/login']);
                        break;
                    case 403:
                        // Check if this is a plan limit or MP connection error (should NOT logout)
                        const errorCode = error.error?.code;
                        const noLogoutCodes = [
                            'PLAN_LIMIT_', 'MP_NOT_LINKED', 'PLAN_LIMIT_EVENTS', 'PLAN_LIMIT_TICKET_TYPES',
                            'FORBIDDEN_ROLE', 'FORBIDDEN_USER_LOOKUP' // Don't logout on role/user permission errors
                        ];
                        const shouldNotLogout = noLogoutCodes.some(code => 
                            errorCode?.startsWith(code) || errorCode === code
                        );
                        
                        if (shouldNotLogout) {
                            // Business logic error - show message but don't logout
                            errorMessage = error.error?.message || 'Acción no permitida. Verifica los requisitos.';
                        } else {
                            // Actual permission error - logout
                            errorMessage = 'No tienes permisos para realizar esta acción.';
                            clearAccessToken();
                            authService.logout();
                            router.navigate(['/login']);
                        }
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
                        errorMessage = `Error ${error.status}: ${error.error.message || error.message}`;
                }
            }

            toastService.error(errorMessage);
            return throwError(() => error);
        })
    );
};
