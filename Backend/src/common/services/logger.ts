type Level = "debug" | "info" | "warn" | "error";

import { env } from "../../config/env";

const LOG_LEVEL_PRIORITY: Record<Level, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const SENSITIVE_KEYS = new Set([
    "password", "token", "accessToken", "refreshToken", "secret", "apiKey",
    "mpAccessToken", "mpToken", "authorization", "cookie", "creditCard",
    "cvv", "pan", "cardNumber", "mpPaymentId", "external_reference",
    "claimUrl", "qrCode", "codigo_unico"
]);

function redact(data: any): any {
    if (!data || typeof data !== "object") return data;
    if (Array.isArray(data)) return data.map(redact);
    const out: any = {};
    for (const [k, v] of Object.entries(data)) {
        const lower = k.toLowerCase();
        if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(lower)) {
            out[k] = "[REDACTED]";
        } else if (typeof v === "object" && v !== null) {
            out[k] = redact(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function log(level: Level, msg: string, data?: any) {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[env.LOG_LEVEL]) return;
    const entry = { level, msg, time: new Date().toISOString(), ...(data ? redact(data) : {}) };
    const line = JSON.stringify(entry);
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
