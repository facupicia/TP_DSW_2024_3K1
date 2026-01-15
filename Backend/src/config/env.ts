/**
 * Environment Configuration
 * Zod schema validation for environment variables
 */
import { z } from "zod";

const EnvSchema = z.object({
    NODE_ENV: z.string().default("development"),
    PORT: z.string().optional(),
    SECRET_KEY: z.string().min(1),

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

    // Email
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.string().optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
