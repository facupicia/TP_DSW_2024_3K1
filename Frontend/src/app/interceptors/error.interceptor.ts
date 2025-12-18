import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const toastService = inject(ToastService);
    const router = inject(Router);
    const authService = inject(AuthService);

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
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
                        if (typeof window !== 'undefined') {
                            localStorage.removeItem('token');
                        }
                        authService.logout();
                        router.navigate(['/login']);
                        break;
                    case 403:
                        errorMessage = 'No tienes permisos para realizar esta acción.';
                        if (typeof window !== 'undefined') {
                            localStorage.removeItem('token');
                        }
                        authService.logout();
                        router.navigate(['/login']);
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
