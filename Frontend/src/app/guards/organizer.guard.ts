import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';
import { hasRoleLevel, getHighestRole, ROLE_HIERARCHY } from '../interfaces/Usuario';

/**
 * Guard that allows access only to users with 'organizer' or higher role (admin).
 * Uses role hierarchy: admin > organizer > scanner > rrpp > user
 * Must be used after authGuard to ensure user is authenticated first.
 */
export const organizerGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return authService.currentUser$.pipe(
        take(1),
        map(user => {
            console.log('[organizerGuard] User:', user);
            
            // Handle both new 'roles' array and legacy 'rol' field
            // If roles is just ['user'] but rol is higher, use rol
            let userRoles = user?.roles || ['user'];
            const legacyRol = user?.rol;
            
            // If we have a legacy rol with higher privilege than current roles, add it
            if (legacyRol && legacyRol !== 'user') {
                const currentHighest = getHighestRole(userRoles);
                const legacyLevel = (ROLE_HIERARCHY as any)[legacyRol] || 0;
                const currentLevel = (ROLE_HIERARCHY as any)[currentHighest] || 0;
                
                if (legacyLevel > currentLevel && !userRoles.includes(legacyRol)) {
                    userRoles = [...userRoles, legacyRol];
                    console.log('[organizerGuard] Added legacy role:', legacyRol);
                }
            }
            
            console.log('[organizerGuard] User roles:', userRoles);
            
            // Check if user has organizer level or higher (admin also passes)
            const hasAccess = user && hasRoleLevel(userRoles, 'organizer');
            console.log('[organizerGuard] Has organizer access:', hasAccess);
            
            if (hasAccess) {
                return true;
            }

            // Redirect non-organizers to events explorer
            router.navigate(['/events']);
            return false;
        })
    );
};
