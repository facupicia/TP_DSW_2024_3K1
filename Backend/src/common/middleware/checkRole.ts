import { Response, NextFunction } from "express";
import { logger } from "../services/logger";
import { CustomRequest as AuthRequest } from "./authToken";
import { User } from "../../user/user.entity";
import { getRoleNames } from "../../user/role.entity";

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
 * Check if user has at least one of the required roles.
 * Refreshes roles from the database on every call to avoid stale JWT roles.
 */
export const checkRoleAuth = (requiredRoles: string | string[]) => async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        }

        // Fresh DB lookup for current roles to avoid stale JWT roles
        const user = await User.createQueryBuilder('user')
            .leftJoinAndSelect('user.roles', 'role')
            .select(['user.id', 'role.name'])
            .where('user.id = :id', { id: req.user.id })
            .getOne();

        let userRoles: string[] = user ? getRoleNames(user) : ['user'];
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
 * Refreshes roles from the database on every call to avoid stale JWT roles.
 */
export const checkExactRole = (requiredRoles: string | string[]) => async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        }

        // Fresh DB lookup for current roles to avoid stale JWT roles
        const user = await User.createQueryBuilder('user')
            .leftJoinAndSelect('user.roles', 'role')
            .select(['user.id', 'role.name'])
            .where('user.id = :id', { id: req.user.id })
            .getOne();

        let userRoles: string[] = user ? getRoleNames(user) : ['user'];
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
