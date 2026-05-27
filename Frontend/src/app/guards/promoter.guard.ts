import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';


/**
 * Guard that allows access only to users with 'rrpp' role (exact match).
 * Note: This uses exact role check, not hierarchy, because being admin
 * doesn't automatically make you a promoter for a specific organizer.
 * Must be used after authGuard to ensure user is authenticated first.
 */
export const promoterGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return authService.ensureCurrentUser().pipe(
        take(1),
        map(user => {
            const userRoles = user?.roles || [user?.rol] || ['user'];
            
            // Check if user has exact rrpp role
            if (user && userRoles.includes('rrpp')) {
                return true;
            }

            // Redirect non-promoters to events explorer
            router.navigate(['/events']);
            return false;
        })
    );
};
