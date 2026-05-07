/**
 * Environment Configuration
 * Zod schema validation for environment variables
 */
import { z } from "zod";

function requireOneOf(groups: string[][], message: string) {
    return z.custom<string>((val) => {
        if (typeof val !== "string") return false;
        return groups.some((group) => group.every((k) => process.env[k]));
    }, { message });
}

const EnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().min(1).max(65535).default(3000),
    SECRET_KEY: z.string().min(32, "SECRET_KEY must be at least 32 characters"),
    JWT_REFRESH_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),

    // Client URLs
    CLIENT_URLS: z.string().optional(),
    CLIENT_URL: z.string().optional(),

    // Mercado Pago - Marketplace
    MP_ACCESS_TOKEN: z.string().min(1),
    MP_CLIENT_ID: z.string().optional(),
    MP_CLIENT_SECRET: z.string().optional(),
    APP_URL: z.string().optional(),
    MP_NOTIFICATION_URL: z.string().optional(),
    MP_TEST_PAYER_EMAIL: z.string().optional(),
    MP_WEBHOOK_SECRET: z.string().optional(),

    // Mercado Pago - Subscriptions
    MP_ACCESS_TOKEN_SUSCRIPCION: z.string().optional(),
    MP_NOTIFICATION_URL_SUSCRIPCION: z.string().optional(),
    MP_SUBSCRIPTION_WEBHOOK_SECRET: z.string().optional(),
    MP_SUBSCRIPTION_BACK_URL: z.string().optional(),

    // Database
    POSTGRES_URL: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    PGHOST: z.string().optional(),
    PGPORT: z.string().optional(),
    PGUSER: z.string().optional(),
    PGPASSWORD: z.string().optional(),
    PGDATABASE: z.string().optional(),

    // Auth
    ID_CLIENT_GOOGLE_OAUTH: z.string().optional(),

    // Cache
    REDIS_URL: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // Email
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.string().optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),

    // Encryption
    ENCRYPTION_KEY: z.string().length(64).optional(),
}).refine(
    (data) => {
        const hasDbUrl = !!(data.DATABASE_URL || data.POSTGRES_URL);
        const hasPgVars = !!(data.PGHOST && data.PGUSER && data.PGPASSWORD && data.PGDATABASE);
        return hasDbUrl || hasPgVars;
    },
    { message: "Either DATABASE_URL/POSTGRES_URL or all PG* variables must be provided", path: ["DATABASE_URL"] }
).refine(
    (data) => {
        if (data.NODE_ENV === "production") {
            return !!data.REDIS_URL;
        }
        return true;
    },
    { message: "REDIS_URL is required in production", path: ["REDIS_URL"] }
);

export const env = EnvSchema.parse(process.env);
