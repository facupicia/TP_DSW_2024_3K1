import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    if (typeof window !== 'undefined' && window.localStorage) {
        const token = localStorage.getItem('token');
        if (token) {
            const cloned = req.clone({
                setHeaders: {
                    Authorization: `Bearer ${token}`
                }
            });
            return next(cloned);
        } else {
            console.warn('[AuthInterceptor] No token found in localStorage for request to:', req.url);
        }
    } else {
        console.warn('[AuthInterceptor] window or localStorage not available for request to:', req.url);
    }
    return next(req);
};
