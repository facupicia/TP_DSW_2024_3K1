import { Request, Response, NextFunction } from "express";
import { User } from "../../user/user.entity";
import { getRoleNames } from "../../user/role.entity";
import { CustomRequest as AuthRequest } from "./authToken";

export interface IPayload {
    id: string;
    iat: number;
}

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
 * A user with a higher-level role can access resources requiring lower-level roles
 * 
 * Examples:
 * - admin (5) can access routes requiring organizer (4), scanner (3), rrpp (2), or user (1)
 * - organizer (4) can access routes requiring scanner (3), rrpp (2), or user (1)
 * - scanner (3) can access routes requiring rrpp (2) or user (1)
 */
export const checkRoleAuth = (requiredRoles: string | string[]) => async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        }

        // Get user with roles array
        const userData = await User.findOne({
            where: { id: req.user.id },
            relations: ['roles']
        });
        
        if (!userData) {
            return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
        }

        // Get user's role names (defaults to ['user'] if not set)
        let userRoles: string[] = getRoleNames(userData);
        if (userRoles.length === 0) {
            userRoles = ['user'];
        }
        
        const requiredRolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        
        // Get highest level from user's roles
        const userHighestLevel = getHighestRoleLevel(userRoles);
        
        // Get the minimum required level from required roles
        const requiredLevels = requiredRolesArray.map(role => ROLE_HIERARCHY[role] || 0);
        const minRequiredLevel = Math.min(...requiredLevels);

        // Check if user's highest level meets or exceeds the required level
        if (userHighestLevel >= minRequiredLevel) {
            // Attach user's roles to request for potential use in controllers
            (req as any).userRoles = userRoles;
            return next();
        }

        return res.status(403).json({ 
            code: "FORBIDDEN_ROLE", 
            message: "Insufficient role permissions",
            required: requiredRolesArray,
            current: userRoles
        });
    } catch (error) {
        console.error("Role check error:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Internal Server Error" });
    }
}

/**
 * Check if user has a specific role (exact match, no hierarchy)
 * Use this when you need an exact role, not hierarchy-based access
 */
export const checkExactRole = (requiredRoles: string | string[]) => async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        }

        const userData = await User.findOne({
            where: { id: req.user.id },
            relations: ['roles']
        });

        if (!userData) {
            return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
        }

        const userRoles = getRoleNames(userData).length > 0 ? getRoleNames(userData) : ['user'];
        const requiredRolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        
        // Check for exact role match
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
    } catch (error) {
        console.error("Role check error:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Internal Server Error" });
    }
}
