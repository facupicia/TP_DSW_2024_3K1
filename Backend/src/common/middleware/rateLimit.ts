import { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../services/redis";
import { env } from "../../config/env";

const rateLimitHandler = (_req: Request, res: Response, _next: unknown, options: any) => {
    const reset = res.getHeader("ratelimit-reset") || res.getHeader("x-ratelimit-reset");
    res.status(options.statusCode).json({
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes desde este cliente. Intenta de nuevo más tarde.",
        retryAfter: reset ?? null
    });
};

function createRedisStore(prefix: string) {
    if (!env.REDIS_URL) {
        if (env.NODE_ENV === "production") {
            throw new Error("REDIS_URL is required in production for rate limiting");
        }
        return undefined;
    }

    return new RedisStore({
        prefix,
        sendCommand: async (...args: string[]) => {
            const client = await getRedis();
            if (!client) {
                throw new Error("Redis rate-limit store unavailable");
            }
            return client.sendCommand(args);
        }
    });
}

const isProduction = env.NODE_ENV === "production";

export const globalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore("rl:global:"),
    handler: rateLimitHandler
});

const authWindowMs = isProduction ? 15 * 60 * 1000 : 60 * 1000;
const authMaxRequests = isProduction ? 10 : 100;
const refreshWindowMs = 15 * 60 * 1000;
const refreshMaxRequests = isProduction ? 60 : 300;

export const authRateLimiter = rateLimit({
    windowMs: authWindowMs,
    max: authMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    store: createRedisStore("rl:auth:"),
    handler: (_req, res, _next, options) => {
        const retryAfter = res.getHeader("ratelimit-reset") || res.getHeader("x-ratelimit-reset");
        const minutes = Math.max(1, Math.ceil(options.windowMs / 60000));
        res.status(options.statusCode).json({
            code: "AUTH_RATE_LIMITED",
            message: `Demasiados intentos de inicio de sesión. Intenta nuevamente en ${minutes} minuto${minutes === 1 ? "" : "s"}.`,
            retryAfter: retryAfter ?? null
        });
    }
});

export const refreshRateLimiter = rateLimit({
    windowMs: refreshWindowMs,
    max: refreshMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    store: createRedisStore("rl:auth-refresh:"),
    handler: (_req, res, _next, options) => {
        const retryAfter = res.getHeader("ratelimit-reset") || res.getHeader("x-ratelimit-reset");
        const minutes = Math.max(1, Math.ceil(options.windowMs / 60000));
        res.status(options.statusCode).json({
            code: "AUTH_REFRESH_RATE_LIMITED",
            message: `Demasiadas solicitudes de renovación de sesión. Intenta nuevamente en ${minutes} minuto${minutes === 1 ? "" : "s"}.`,
            retryAfter: retryAfter ?? null
        });
    }
});
