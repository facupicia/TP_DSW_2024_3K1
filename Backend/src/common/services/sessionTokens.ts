import crypto from "crypto";
import { Request, Response } from "express";
import { IsNull } from "typeorm";
import AppDataSource from "../../db";
import { User } from "../../user/user.entity";
import { RefreshToken } from "../../user/refreshToken.entity";
import { tokenSing } from "./generateToken";

const REFRESH_COOKIE = "eventlife_refresh";
const REFRESH_DAYS = Number(process.env.JWT_REFRESH_DAYS || 30);

function hashToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshExpiry() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_DAYS);
    return expiresAt;
}

function getCookieOptions() {
    const isProduction = process.env.NODE_ENV === "production";
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

export async function issueRefreshToken(res: Response, user: User) {
    const rawToken = crypto.randomBytes(64).toString("base64url");
    const token = new RefreshToken();
    token.userId = user.id;
    token.tokenHash = hashToken(rawToken);
    token.expiresAt = refreshExpiry();
    token.revokedAt = null;
    token.replacedByHash = null;

    await AppDataSource.getRepository(RefreshToken).save(token);
    res.cookie(REFRESH_COOKIE, rawToken, getCookieOptions());
}

export async function rotateRefreshToken(req: Request, res: Response) {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    if (!rawToken) {
        return null;
    }

    const refreshRepo = AppDataSource.getRepository(RefreshToken);
    const current = await refreshRepo.findOne({
        where: { tokenHash: hashToken(rawToken), revokedAt: IsNull() },
        relations: ["user", "user.roles"]
    });

    if (!current || current.expiresAt <= new Date() || !current.user || current.user.deletedAt || !current.user.active) {
        clearRefreshToken(res);
        return null;
    }

    const nextRawToken = crypto.randomBytes(64).toString("base64url");
    const nextHash = hashToken(nextRawToken);
    current.revokedAt = new Date();
    current.replacedByHash = nextHash;
    await refreshRepo.save(current);

    const nextToken = new RefreshToken();
    nextToken.userId = current.userId;
    nextToken.tokenHash = nextHash;
    nextToken.expiresAt = refreshExpiry();
    nextToken.revokedAt = null;
    nextToken.replacedByHash = null;
    await refreshRepo.save(nextToken);

    res.cookie(REFRESH_COOKIE, nextRawToken, getCookieOptions());
    return tokenSing(current.user);
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
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/api/user"
    });
}
