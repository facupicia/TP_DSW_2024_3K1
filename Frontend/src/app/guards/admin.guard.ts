import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';
import { hasExactRole } from '../interfaces/Usuario';

/**
 * Guard that allows access only to users with 'admin' role (exact match).
 * Admin has full system access but we check exact match for admin-only routes.
 * Must be used after authGuard to ensure user is authenticated first.
 */
export const adminGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return authService.currentUser$.pipe(
        take(1),
        map(user => {
            const userRoles = user?.roles || [user?.rol] || ['user'];
            
            // Check if user has exact admin role
            if (user && hasExactRole(userRoles, 'admin')) {
                return true;
            }

            // Redirect non-admins to events explorer
            router.navigate(['/events']);
            return false;
        })
    );
};
