import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { User } from "../../user/user.entity";
import { getRoleNames } from "../../user/role.entity";
import { env } from "../../config/env";
import { logger } from "../services/logger";

export const verifyToken = async (token: string) => {
    try {
        return jwt.verify(token, env.SECRET_KEY, {
            algorithms: ['HS256'],
            issuer: 'eventlife-api',
            audience: env.CLIENT_URL || 'eventlife-app'
        });
    } catch (error) {
        if (error instanceof Error) {
            const name = error.name;
            if (name === 'TokenExpiredError') {
                logger.warn('JWT_VERIFY_EXPIRED');
            } else if (name === 'JsonWebTokenError') {
                logger.warn('JWT_VERIFY_MALFORMED');
            } else {
                logger.error('JWT_VERIFY_ERROR', { name });
            }
        }
        return null;
    }
};

export const tokenSing = async (user: User) => {
    if (!env.SECRET_KEY) {
        throw new Error("SECRET_KEY is missing in environment variables");
    }
    let roleNames = getRoleNames(user);
    // If roles weren't loaded (eager removed), fetch them explicitly
    if (roleNames.length === 0 && user.id) {
        const refreshed = await User.findOne({ where: { id: user.id }, relations: ['roles'] });
        if (refreshed) {
            roleNames = getRoleNames(refreshed);
        }
    }
    return jwt.sign(
        {
            id: user.id,
            roles: roleNames.length > 0 ? roleNames : ['user'],
            jti: crypto.randomUUID(),
            iss: 'eventlife-api',
            aud: env.CLIENT_URL || 'eventlife-app'
        },
        env.SECRET_KEY,
        {
            expiresIn: env.JWT_ACCESS_EXPIRES_IN
        }
    );
}
