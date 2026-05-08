import crypto from "crypto";
import { IsNull } from "typeorm";
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

export async function createAccountClaimToken(user: User): Promise<{ rawToken: string; claimUrl: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(48).toString("base64url");
    const token = new AccountClaimToken();
    token.userId = user.id;
    token.tokenHash = hashToken(rawToken);
    token.expiresAt = expiresAt();
    token.usedAt = null;

    await AppDataSource.getRepository(AccountClaimToken).save(token);

    return {
        rawToken,
        claimUrl: `${getClientUrl()}/claim-account?token=${encodeURIComponent(rawToken)}`,
        expiresAt: token.expiresAt
    };
}

export async function findValidAccountClaimToken(rawToken: string): Promise<AccountClaimToken | null> {
    if (!rawToken) return null;

    const token = await AppDataSource.getRepository(AccountClaimToken).findOne({
        where: { tokenHash: hashToken(rawToken), usedAt: IsNull() },
        relations: ["user", "user.roles"]
    });

    if (!token || token.expiresAt <= new Date() || !token.user || token.user.deletedAt || !token.user.active) {
        return null;
    }

    return token;
}

export async function consumeAccountClaimToken(rawToken: string): Promise<User | null> {
    const token = await findValidAccountClaimToken(rawToken);
    if (!token) return null;

    token.usedAt = new Date();
    await AppDataSource.getRepository(AccountClaimToken).save(token);

    return token.user;
}
