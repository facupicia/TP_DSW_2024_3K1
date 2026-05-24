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
    user?: IPayload;
    file?: Express.Multer.File;
}

const payloadSchema = z.object({
    id: z.number().int().positive(),
    roles: z.array(z.string()).optional().default([]),
    iat: z.number().optional(),
    jti: z.string().optional(),
    iss: z.string().optional(),
    aud: z.string().optional(),
}).passthrough();

// Simple in-memory cache for active user validation (5s TTL)
const userCache = new Map<number, { roles: string[]; expiresAt: number }>();
const USER_CACHE_TTL_MS = 5000;
const MAX_CACHE_SIZE = 1000;

function getCachedUser(userId: number) {
    const cached = userCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.roles;
    }
    return null;
}

function setCachedUser(userId: number, roles: string[]) {
    // Evict oldest entries if cache exceeds max size
    if (userCache.size >= MAX_CACHE_SIZE && !userCache.has(userId)) {
        const firstKey = userCache.keys().next().value;
        if (firstKey !== undefined) userCache.delete(firstKey);
    }
    userCache.set(userId, { roles, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

interface AuthOptions {
    required: boolean;
}

async function authenticateToken(req: CustomRequest, options: AuthOptions) {
    const tokenHeader = req.header("Authorization");
    let token: string | undefined;

    if (tokenHeader && tokenHeader.startsWith("Bearer ")) {
        token = tokenHeader.split(" ")[1];
    }

    if (!token) {
        if (options.required) {
            logger.warn('[AUTH] No token in request', { path: req.path, method: req.method });
            return { error: { status: 401, code: 'AUTH_NO_TOKEN', message: 'No token provided' } };
        }
        return { skipped: true };
    }

    const rawPayload = await verifyToken(token);
    if (!rawPayload) {
        if (options.required) {
            return { error: { status: 401, code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired token' } };
        }
        return { skipped: true };
    }

    const parseResult = payloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
        if (options.required) {
            logger.warn('AUTH_PAYLOAD_VALIDATION_FAILED', { errors: parseResult.error.errors });
            return { error: { status: 401, code: 'AUTH_INVALID_PAYLOAD', message: 'Invalid token payload' } };
        }
        return { skipped: true };
    }

    const tokenData = parseResult.data;

    // Check cache first
    let currentRoles = getCachedUser(tokenData.id);

    if (!currentRoles) {
        // Use QueryBuilder to avoid TypeORM select/relations quirks with @Column({ select: false })
        const user = await User.createQueryBuilder('user')
            .leftJoinAndSelect('user.roles', 'role')
            .select(['user.id', 'user.active', 'user.deletedAt', 'role.id', 'role.name'])
            .where('user.id = :id', { id: tokenData.id })
            .getOne();

        if (!user || !user.active || user.deletedAt) {
            if (options.required) {
                logger.warn('AUTH_USER_INACTIVE', { userId: tokenData.id, path: req.path });
                return { error: { status: 401, code: 'AUTH_USER_INACTIVE', message: 'User account is inactive or deleted' } };
            }
            return { skipped: true };
        }

        currentRoles = getRoleNames(user);
        setCachedUser(tokenData.id, currentRoles);
    }

    return {
        user: {
            ...tokenData,
            roles: currentRoles.length > 0 ? currentRoles : ['user']
        }
    };
}

export const checkAuthToken = async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        const result = await authenticateToken(req, { required: true });
        if ('error' in result) {
            return res.status(result.error.status).json({ code: result.error.code, message: result.error.message });
        }
        req.user = result.user;
        next();
    } catch (error) {
        logger.error('AUTH_MIDDLEWARE_ERROR', { error: (error as Error).message });
        return res.status(401).json({ code: 'AUTH_VALIDATION_ERROR', message: 'Invalid or expired token' });
    }
};

export const optionalAuthToken = async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        const result = await authenticateToken(req, { required: false });
        if ('user' in result && result.user) {
            req.user = result.user;
        }
        next();
    } catch (error) {
        // Silently continue as anonymous on any error
        next();
    }
};
