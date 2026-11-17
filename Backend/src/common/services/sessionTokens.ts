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

    const value = target.slice(name.length + 1);
    if (!value || value.length > 512) return null;
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
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

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const current = await queryRunner.manager.findOne(User,{where:{id:user.id},lock:{mode:'pessimistic_write'}});
        if (!current?.active || current.deletedAt || (current.credentialsVersion || 0)!==(user.credentialsVersion || 0)) throw new Error('Session credentials changed');
        const refreshRepo = queryRunner.manager.getRepository(RefreshToken);

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
        await queryRunner.commitTransaction();
    } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
    } finally {
        await queryRunner.release();
    }

    res.cookie(REFRESH_COOKIE, rawToken, getCookieOptions());
}

/**
 * Rotate refresh token with reuse detection.
 * If a revoked token is presented, we detect reuse and revoke all tokens for the user.
 */
export async function rotateRefreshToken(req: Request, res: Response): Promise<{ token: string; user: User } | null> {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    if (!rawToken) {
        return null;
    }

    const nextRawToken = crypto.randomBytes(64).toString('base64url');
    const nextHash = hashToken(nextRawToken);
    const user = await AppDataSource.transaction(async manager => {
        const repo = manager.getRepository(RefreshToken);
        const candidate = await repo.findOne({where:{tokenHash:hashToken(rawToken)}});
        if (!candidate) return null;
        const lockedUser = await manager.findOne(User,{where:{id:candidate.userId},lock:{mode:'pessimistic_write'}});
        if (!lockedUser?.active || lockedUser.deletedAt) return null;
        const old = await repo.findOne({ where: { tokenHash: hashToken(rawToken) }, lock: { mode: 'pessimistic_write' } });
        if (!old) return null;
        if (old.revokedAt) {
            // Brief concurrency grace: reject a duplicate refresh without destroying other tabs.
            if (Date.now()-old.revokedAt.getTime()>10000) await repo.update({ userId: old.userId, revokedAt: IsNull() }, { revokedAt: new Date() });
            return null;
        }
        if (old.expiresAt <= new Date()) return null;
        const activeUser = await manager.findOne(User, { where: { id: old.userId }, relations: ['roles'] });
        if (!activeUser?.active || activeUser.deletedAt) return null;
        old.revokedAt = new Date(); old.replacedByHash = nextHash;
        await repo.save(old);
        await repo.save(repo.create({ userId: old.userId, tokenHash: nextHash, expiresAt: refreshExpiry(), revokedAt: null, replacedByHash: null }));
        return activeUser;
    });
    if (!user) return null;
    res.cookie(REFRESH_COOKIE, nextRawToken, getCookieOptions());
    return { token: await tokenSing(user), user };

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
