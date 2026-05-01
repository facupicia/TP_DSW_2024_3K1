import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return authService.ensureCurrentUser().pipe(
        take(1),
        map(user => {
            if (user) {
                return true;
            }

            router.navigate(['/login'], {
                queryParams: state.url ? { returnUrl: state.url } : undefined
            });
            return false;
        })
    );
};
