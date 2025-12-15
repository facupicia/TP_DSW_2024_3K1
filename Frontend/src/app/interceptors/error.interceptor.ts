import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const toastService = inject(ToastService);

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
                        break;
                    case 403:
                        errorMessage = 'No tienes permisos para realizar esta acción.';
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
