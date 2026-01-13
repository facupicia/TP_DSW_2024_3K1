import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * Guard that allows access only to users with 'organizer' or 'admin' roles.
 * Must be used after authGuard to ensure user is authenticated first.
 */
export const organizerGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return authService.currentUser$.pipe(
        take(1),
        map(user => {
            if (user && (user.rol === 'organizer' || user.rol === 'admin')) {
                return true;
            }

            // Redirect non-organizers to events explorer
            router.navigate(['/events']);
            return false;
        })
    );
};
