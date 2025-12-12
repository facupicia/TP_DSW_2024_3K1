import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    if (typeof window !== 'undefined' && window.localStorage) {
        const token = localStorage.getItem('token');
        if (token) {
            const cloned = req.clone({
                setHeaders: {
                    token: `${token}`
                }
            });
            return next(cloned);
        }
    }
    return next(req);
};
