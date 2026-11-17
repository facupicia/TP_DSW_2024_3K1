import crypto from "crypto";
import { IsNull, EntityManager } from "typeorm";
import AppDataSource from "../db";
import { AccountClaimToken } from "./accountClaimToken.entity";
import { User } from "./user.entity";
import { env } from "../config/env";

const CLAIM_TOKEN_HOURS = env.ACCOUNT_CLAIM_TOKEN_HOURS;

function hashToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function expiresAt() {
    const date = new Date();
    date.setHours(date.getHours() + CLAIM_TOKEN_HOURS);
    return date;
}

function getClientUrl() {
    return (env.CLIENT_URL || "https://event-life.netlify.app").replace(/\/$/, "");
}

export async function createAccountClaimToken(user: User, manager: EntityManager = AppDataSource.manager): Promise<{ rawToken: string; claimUrl: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(48).toString("base64url");
    const token = new AccountClaimToken();
    token.userId = user.id;
    token.tokenHash = hashToken(rawToken);
    token.expiresAt = expiresAt();
    token.usedAt = null;
    token.purpose = 'claim';
    token.credentialsVersion = user.credentialsVersion || 0;

    await manager.getRepository(AccountClaimToken).save(token);

    return {
        rawToken,
        claimUrl: `${getClientUrl()}/claim-account?token=${encodeURIComponent(rawToken)}`,
        expiresAt: token.expiresAt
    };
}

export async function findValidAccountClaimToken(rawToken: string): Promise<AccountClaimToken | null> {
    if (!rawToken) return null;

    const token = await AppDataSource.getRepository(AccountClaimToken).findOne({
        where: { purpose:'claim', tokenHash: hashToken(rawToken), usedAt: IsNull() },
        relations: ["user", "user.roles"]
    });

    if (!token || token.expiresAt <= new Date() || !token.user || token.user.deletedAt || !token.user.active || !token.user.isGuestAccount
        || (token.credentialsVersion || 0) !== (token.user.credentialsVersion || 0)) {
        return null;
    }

    return token;
}

export async function consumeAccountClaimToken(rawToken: string, manager: EntityManager = AppDataSource.manager): Promise<User | null> {
    const token = await manager.findOne(AccountClaimToken, { where: { purpose: 'claim', tokenHash: hashToken(rawToken), usedAt: IsNull() } });
    if (!token || token.expiresAt <= new Date()) return null;
    const user = await manager.findOne(User, { where: { id: token.userId }, lock: { mode: 'pessimistic_write' } });
    if (!user?.active || user.deletedAt || !user.isGuestAccount || (token.credentialsVersion || 0)!==(user.credentialsVersion || 0)) return null;
    const consumed = await manager.update(AccountClaimToken, { id: token.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!consumed.affected) return null;
    await manager.update(AccountClaimToken, { userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });
    return user;
}
