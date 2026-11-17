type Level = "debug" | "info" | "warn" | "error";

import { env } from "../../config/env";

const LOG_LEVEL_PRIORITY: Record<Level, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const normalizeKey = (key: string) => key.replace(/[^a-z0-9]/gi, '').toLowerCase();

const SENSITIVE_KEYS = new Set([
    "password", "token", "accessToken", "refreshToken", "secret", "apiKey",
    "mpAccessToken", "mpToken", "authorization", "cookie", "creditCard",
    "cvv", "pan", "cardNumber", "mpPaymentId", "external_reference",
    "claimUrl", "qrCode", "codigo_unico", "currentPassword", "newPassword",
    "passwordHash", "tokenHash", "secretKey", "webhookSecret", "clientSecret"
].map(normalizeKey));

function redact(data: any, seen = new WeakSet<object>()): any {
    if (!data || typeof data !== "object") return data;
    if (seen.has(data)) return "[Circular]";
    seen.add(data);
    if (data instanceof Date) return data;
    if (Array.isArray(data)) return data.map(value => redact(value, seen));
    const out: any = Object.create(null);
    for (const [k, v] of Object.entries(data)) {
        if (SENSITIVE_KEYS.has(normalizeKey(k))) {
            out[k] = "[REDACTED]";
        } else if (typeof v === "object" && v !== null) {
            out[k] = redact(v, seen);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    });
}

function log(level: Level, msg: string, data?: any) {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[env.LOG_LEVEL]) return;
    const entry = { level, msg, time: new Date().toISOString(), ...(data ? redact(data) : {}) };
    const line = safeStringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

export const logger = {
    debug: (msg: string, data?: any) => log("debug", msg, data),
    info: (msg: string, data?: any) => log("info", msg, data),
    warn: (msg: string, data?: any) => log("warn", msg, data),
    error: (msg: string, data?: any) => log("error", msg, data),
};
