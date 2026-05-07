import { verifyToken } from "../services/generateToken";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logger } from "../services/logger";
import { User } from "../../user/user.entity";
import { getRoleNames } from "../../user/role.entity";

export interface IPayload {
    id?: number;
    roles?: string[];
    iat?: number;
}

// Extender la interfaz Request para incluir la propiedad id
export interface CustomRequest extends Request {
    id?: number;
    user?: IPayload
}

const payloadSchema = z.object({
    id: z.number().int().positive(),
    roles: z.array(z.string()).optional().default([]),
    iat: z.number().optional(),
    jti: z.string().optional(),
    iss: z.string().optional(),
    aud: z.string().optional(),
}).passthrough();

export const checkAuthToken = async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        const tokenHeader = req.header("Authorization");
        let token: string | undefined;

        if (tokenHeader && tokenHeader.startsWith("Bearer ")) {
            token = tokenHeader.split(" ")[1];
        }

        if (!token) {
            logger.warn('[AUTH] No token in request', { path: req.path, method: req.method });
            return res.status(401).json({ code: 'AUTH_NO_TOKEN', message: 'No token provided' });
        }

        const rawPayload = await verifyToken(token);
        if (!rawPayload) {
            return res.status(401).json({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired token' });
        }

        const parseResult = payloadSchema.safeParse(rawPayload);
        if (!parseResult.success) {
            logger.warn('AUTH_PAYLOAD_VALIDATION_FAILED', { errors: parseResult.error.errors });
            return res.status(401).json({ code: 'AUTH_INVALID_PAYLOAD', message: 'Invalid token payload' });
        }

        const tokenData = parseResult.data;

        // Verify user is still active in database
        const user = await User.findOne({
            where: { id: tokenData.id },
            relations: ['roles'],
            select: {
                id: true,
                active: true,
                deletedAt: true,
                roles: {
                    id: true,
                    name: true
                }
            }
        });

        if (!user || !user.active || user.deletedAt) {
            logger.warn('AUTH_USER_INACTIVE', { userId: tokenData.id, path: req.path });
            return res.status(401).json({ code: 'AUTH_USER_INACTIVE', message: 'User account is inactive or deleted' });
        }

        const currentRoles = getRoleNames(user);
        req.user = {
            ...tokenData,
            roles: currentRoles.length > 0 ? currentRoles : ['user']
        };
        next();

    } catch (error) {
        logger.error('AUTH_MIDDLEWARE_ERROR', { error: (error as Error).message });
        return res.status(401).json({ code: 'AUTH_VALIDATION_ERROR', message: 'Invalid or expired token' });
    }
};

export const optionalAuthToken = async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        const tokenHeader = req.header("Authorization");
        let token: string | undefined;

        if (tokenHeader && tokenHeader.startsWith("Bearer ")) {
            token = tokenHeader.split(" ")[1];
        }

        if (!token) {
            return next();
        }

        const rawPayload = await verifyToken(token);
        if (!rawPayload) {
            return next();
        }

        const parseResult = payloadSchema.safeParse(rawPayload);
        if (!parseResult.success) {
            return next();
        }

        const tokenData = parseResult.data;

        // For optional auth, silently skip if user is inactive
        const user = await User.findOne({
            where: { id: tokenData.id },
            relations: ['roles'],
            select: {
                id: true,
                active: true,
                deletedAt: true,
                roles: {
                    id: true,
                    name: true
                }
            }
        });

        if (user && user.active && !user.deletedAt) {
            const currentRoles = getRoleNames(user);
            req.user = {
                ...tokenData,
                roles: currentRoles.length > 0 ? currentRoles : ['user']
            };
        }

        return next();
    } catch (error) {
        // Silently continue as anonymous on any error
        return next();
    }
};
