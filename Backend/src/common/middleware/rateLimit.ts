import { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../services/redis";

const rateLimitHandler = (_req: Request, res: Response, _next: unknown, options: any) => {
    const reset = res.getHeader("ratelimit-reset") || res.getHeader("x-ratelimit-reset");
    res.status(options.statusCode).json({
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes desde este cliente. Intenta de nuevo más tarde.",
        retryAfter: reset ?? null
    });
};

function createRedisStore(prefix: string) {
    if (!process.env.REDIS_URL) {
        if (process.env.NODE_ENV === "production") {
            console.warn("[RateLimit] REDIS_URL is not configured; falling back to in-memory limits.");
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

export const globalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore("rl:global:"),
    handler: rateLimitHandler
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    store: createRedisStore("rl:auth:"),
    handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json({
            code: "AUTH_RATE_LIMITED",
            message: "Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos."
        });
    }
});
