import crypto from "crypto";
import { Request, Response } from "express";
import { IsNull } from "typeorm";
import AppDataSource from "../../db";
import { User } from "../../user/user.entity";
import { RefreshToken } from "../../user/refreshToken.entity";
import { tokenSing } from "./generateToken";
import { logger } from "./logger";
import { env } from "../../config/env";

const REFRESH_COOKIE = "eventlife_refresh";
const REFRESH_DAYS = env.JWT_REFRESH_DAYS;

function hashToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshExpiry() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_DAYS);
    return expiresAt;
}

function getCookieOptions() {
    const isProduction = env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" as const : "lax" as const,
        path: "/api/user",
        expires: refreshExpiry()
    };
}

function readCookie(req: Request, name: string) {
    const header = req.headers.cookie;
    if (!header) return null;

    const cookies = header.split(";").map(part => part.trim());
    const target = cookies.find(part => part.startsWith(`${name}=`));
    if (!target) return null;

    return decodeURIComponent(target.slice(name.length + 1));
}

/**
 * Limit active refresh tokens per user to prevent token accumulation
 */
const MAX_REFRESH_TOKENS_PER_USER = 5;

export async function issueRefreshToken(res: Response, user: User) {
    const rawToken = crypto.randomBytes(64).toString("base64url");
    const token = new RefreshToken();
    token.userId = user.id;
    token.tokenHash = hashToken(rawToken);
    token.expiresAt = refreshExpiry();
    token.revokedAt = null;
    token.replacedByHash = null;

    const refreshRepo = AppDataSource.getRepository(RefreshToken);

    // Clean up oldest tokens if exceeding limit
    const existingTokens = await refreshRepo.find({
        where: { userId: user.id, revokedAt: IsNull() },
        order: { createdAt: "ASC" },
        take: MAX_REFRESH_TOKENS_PER_USER + 1
    });
    if (existingTokens.length >= MAX_REFRESH_TOKENS_PER_USER) {
        const toRevoke = existingTokens.slice(0, existingTokens.length - MAX_REFRESH_TOKENS_PER_USER + 1);
        for (const old of toRevoke) {
            old.revokedAt = new Date();
        }
        await refreshRepo.save(toRevoke);
    }

    await refreshRepo.save(token);
    res.cookie(REFRESH_COOKIE, rawToken, getCookieOptions());
}

/**
 * Rotate refresh token with reuse detection.
 * If a revoked token is presented, we detect reuse and revoke all tokens for the user.
 */
export async function rotateRefreshToken(req: Request, res: Response) {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    if (!rawToken) {
        return null;
    }

    // Double-submit cookie CSRF protection: verify X-Refresh-Token header matches cookie
    const headerToken = req.header("X-Refresh-Token");
    if (!headerToken || hashToken(headerToken) !== hashToken(rawToken)) {
        logger.warn('REFRESH_CSRF_ATTEMPT', { ip: req.ip });
        clearRefreshToken(res);
        return null;
    }

    const refreshRepo = AppDataSource.getRepository(RefreshToken);
    const tokenHash = hashToken(rawToken);

    // Check for reused (revoked) token
    const reused = await refreshRepo.findOne({
        where: { tokenHash, revokedAt: IsNull() },
        relations: ["user", "user.roles"]
    });

    if (!reused) {
        // Token not found or already revoked - possible reuse attack
        const existingRevoked = await refreshRepo.findOne({
            where: { tokenHash }
        });
        if (existingRevoked) {
            logger.error('REFRESH_TOKEN_REUSE_DETECTED', { userId: existingRevoked.userId, tokenHash: tokenHash.slice(0, 16) });
            // Revoke ALL refresh tokens for this user
            await refreshRepo.update(
                { userId: existingRevoked.userId, revokedAt: IsNull() },
                { revokedAt: new Date() }
            );
        }
        clearRefreshToken(res);
        return null;
    }

    if (reused.expiresAt <= new Date() || !reused.user || reused.user.deletedAt || !reused.user.active) {
        clearRefreshToken(res);
        return null;
    }

    const nextRawToken = crypto.randomBytes(64).toString("base64url");
    const nextHash = hashToken(nextRawToken);
    reused.revokedAt = new Date();
    reused.replacedByHash = nextHash;
    await refreshRepo.save(reused);

    const nextToken = new RefreshToken();
    nextToken.userId = reused.userId;
    nextToken.tokenHash = nextHash;
    nextToken.expiresAt = refreshExpiry();
    nextToken.revokedAt = null;
    nextToken.replacedByHash = null;
    await refreshRepo.save(nextToken);

    res.cookie(REFRESH_COOKIE, nextRawToken, getCookieOptions());
    return tokenSing(reused.user);
}

export async function revokeRefreshToken(req: Request, res: Response) {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    if (rawToken) {
        await AppDataSource.getRepository(RefreshToken).update(
            { tokenHash: hashToken(rawToken), revokedAt: IsNull() },
            { revokedAt: new Date() }
        );
    }
    clearRefreshToken(res);
}

export function clearRefreshToken(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
        path: "/api/user"
    });
}
