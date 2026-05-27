import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';


/**
 * Guard that allows access only to users with 'organizer' or higher role (admin).
 * Uses role hierarchy: admin > organizer > scanner > rrpp > user
 * Must be used after authGuard to ensure user is authenticated first.
 *
 * NOTE: Relies exclusively on user.roles from the backend. No client-side
 * merging with legacy 'rol' — the backend is the single source of truth.
 */
export const organizerGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return authService.ensureCurrentUser().pipe(
        take(1),
        map(user => {
            const userRoles = user?.roles || ['user'];
            const hasAccess = user && (userRoles.includes('organizer') || userRoles.includes('admin'));

            if (hasAccess) {
                return true;
            }

            // Redirect non-organizers to events explorer
            router.navigate(['/events']);
            return false;
        })
    );
};
