import { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import crypto from "crypto";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../services/redis";
import { env } from "../../config/env";
import { logger } from "../services/logger";

const rateLimitHandler = (_req: Request, res: Response, _next: unknown, options: any) => {
    const reset = res.getHeader("ratelimit-reset") || res.getHeader("x-ratelimit-reset");
    res.status(options.statusCode).json({
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes desde este cliente. Intenta de nuevo más tarde.",
        retryAfter: reset ?? null
    });
};

function createRedisStore(prefix: string) {
    if (env.NODE_ENV !== "production") {
        return undefined;
    }

    if (!env.REDIS_URL) {
        throw new Error("REDIS_URL is required in production for rate limiting");
    }

    const store = new RedisStore({
        prefix,
        sendCommand: async (...args: string[]) => {
            const client = await getRedis();
            if (!client) {
                throw new Error("Redis rate-limit store unavailable");
            }
            return client.sendCommand(args);
        }
    });

    void store.incrementScriptSha.catch((error) => {
        logger.error("RATE_LIMIT_REDIS_INCREMENT_SCRIPT_LOAD_FAILED", {
            prefix,
            error: (error as Error).message
        });
    });
    void store.getScriptSha.catch((error) => {
        logger.error("RATE_LIMIT_REDIS_GET_SCRIPT_LOAD_FAILED", {
            prefix,
            error: (error as Error).message
        });
    });

    return store;
}

function hashRateLimitPart(value: string) {
    return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function authKeyGenerator(req: Request) {
    const ip = ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown");
    const route = `${req.baseUrl}${req.path}`.replace(/\/+/g, "/");
    const rawIdentifier =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : typeof req.body?.token === "string"
                ? req.body.token.trim()
                : "";
    const identifier = rawIdentifier ? hashRateLimitPart(rawIdentifier) : "anonymous";

    return `${route}:${ip}:${identifier}`;
}

export const globalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore("rl:global:"),
    handler: rateLimitHandler
});

const authWindowMs = env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
const authMaxRequests = env.AUTH_RATE_LIMIT_MAX;
const refreshWindowMs = env.REFRESH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
const refreshMaxRequests = env.REFRESH_RATE_LIMIT_MAX;

export const authRateLimiter = rateLimit({
    windowMs: authWindowMs,
    max: authMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: authKeyGenerator,
    store: createRedisStore("rl:auth:v2:"),
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
