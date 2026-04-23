import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';
import { hasExactRole, hasRoleLevel } from '../interfaces/Usuario';

/**
 * Guard that allows access to scanner functionality.
 * Uses exact role match: only users with 'scanner' or 'admin' roles can access.
 * Note: We use exact match (not hierarchy) because scanning is a specific permission.
 * Must be used after authGuard to ensure user is authenticated first.
 */
export const scannerGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return authService.ensureCurrentUser().pipe(
        take(1),
        map(user => {
            const userRoles = user?.roles || [user?.rol] || ['user'];
            
            // Scanner, admin, and organizers can access the scanner UI.
            // Backend still enforces event ownership for organizers.
            if (user && (hasExactRole(userRoles, 'scanner') || hasExactRole(userRoles, 'admin') || hasExactRole(userRoles, 'organizer'))) {
                return true;
            }

            // Redirect non-scanners to events explorer
            router.navigate(['/events']);
            return false;
        })
    );
};
