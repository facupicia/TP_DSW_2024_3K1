import { Response, NextFunction } from "express";
import { logger } from "../services/logger";
import { CustomRequest as AuthRequest } from "./authToken";

export interface CustomRequest extends AuthRequest { }

/**
 * Role hierarchy levels (higher number = more permissions)
 * admin > organizer > scanner > rrpp > user
 */
const ROLE_HIERARCHY: Record<string, number> = {
    'user': 1,
    'rrpp': 2,
    'scanner': 3,
    'organizer': 4,
    'admin': 5
};

/**
 * Get the highest role level from a list of roles
 */
const getHighestRoleLevel = (roles: string[]): number => {
    return Math.max(...roles.map(role => ROLE_HIERARCHY[role] || 0));
};

/**
 * Check if user has sufficient role level based on hierarchy
 * Uses roles embedded in JWT (req.user.roles) to avoid DB round-trip.
 */
export const checkRoleAuth = (requiredRoles: string | string[]) => async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        }

        // Roles are already verified and attached by authToken middleware
        let userRoles: string[] = req.user.roles || ['user'];
        if (typeof userRoles === 'string') {
            userRoles = (userRoles as any).split(',');
        }
        if (!Array.isArray(userRoles) || userRoles.length === 0) {
            userRoles = ['user'];
        }

        const requiredRolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

        const userHighestLevel = getHighestRoleLevel(userRoles);
        const requiredLevels = requiredRolesArray.map(role => ROLE_HIERARCHY[role] || 0);
        // Use Math.max so that passing multiple required roles enforces the *strongest* one.
        // This prevents accidental privilege reduction (e.g. ['admin','user'] -> user).
        const minRequiredLevel = Math.max(...requiredLevels);

        if (userHighestLevel >= minRequiredLevel) {
            (req as any).userRoles = userRoles;
            return next();
        }

        return res.status(403).json({
            code: "FORBIDDEN_ROLE",
            message: "Insufficient role permissions",
            required: requiredRolesArray,
            current: userRoles
        });
    } catch (error: any) {
        logger.error("ROLE_CHECK_ERROR", { error: error?.message });
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Internal Server Error" });
    }
}

/**
 * Check if user has a specific role (exact match, no hierarchy)
 * Uses roles embedded in JWT (req.user.roles) to avoid DB round-trip.
 */
export const checkExactRole = (requiredRoles: string | string[]) => async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        }

        let userRoles: string[] = req.user.roles || ['user'];
        if (typeof userRoles === 'string') {
            userRoles = (userRoles as any).split(',');
        }
        if (!Array.isArray(userRoles) || userRoles.length === 0) {
            userRoles = ['user'];
        }

        const requiredRolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        const hasRole = requiredRolesArray.some(role => userRoles.includes(role));

        if (hasRole) {
            (req as any).userRoles = userRoles;
            return next();
        }

        return res.status(403).json({
            code: "FORBIDDEN_ROLE",
            message: "Role not assigned",
            required: requiredRolesArray,
            current: userRoles
        });
    } catch (error: any) {
        logger.error("ROLE_CHECK_ERROR", { error: error?.message });
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Internal Server Error" });
    }
}
