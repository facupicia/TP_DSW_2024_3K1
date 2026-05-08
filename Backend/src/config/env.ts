/**
 * Environment Configuration
 * Zod schema validation for environment variables
 */
import { z } from "zod";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function requireOneOf(groups: string[][], message: string) {
  return z.custom<string>(
    (val) => {
      if (typeof val !== "string") return false;
      return groups.some((group) => group.every((k) => process.env[k]));
    },
    { message },
  );
}

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
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
    DB_SYNC: z.enum(["true", "false"]).optional().default("false"),
    DB_LOGGING: z.enum(["true", "false"]).optional().default("false"),
    DB_POOL_MAX: z.coerce.number().min(1).max(100).optional().default(10),
    DB_CONN_TIMEOUT: z.coerce.number().min(1000).optional().default(15000),
    DB_IDLE_TIMEOUT: z.coerce.number().min(1000).optional().default(30000),
    DB_STATEMENT_TIMEOUT: z.coerce.number().min(1000).optional().default(30000),

    // Auth
    ID_CLIENT_GOOGLE_OAUTH: z.string().optional(),

    // Cache
    REDIS_URL: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    BACKEND_URL: z.string().optional(),
    API_URL: z.string().optional(),
    ACCOUNT_CLAIM_TOKEN_HOURS: z.coerce.number().min(1).max(168).optional().default(24),

    // Email
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.string().optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),

    // Encryption
    ENCRYPTION_KEY: z.string().length(64).optional(),
    METRICS_PUBLIC: z.enum(["true", "false"]).default("false"),
    TRUST_PROXY_HOPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .default(process.env.NODE_ENV === "production" ? 1 : 0),

    // Rate Limiting
    AUTH_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .default(process.env.NODE_ENV === "production" ? 30 : 100),
    AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .default(process.env.NODE_ENV === "production" ? 15 : 1),
    REFRESH_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .default(process.env.NODE_ENV === "production" ? 60 : 300),
    REFRESH_RATE_LIMIT_WINDOW_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .default(15),

    // Volume Seeding (solo para testeo de carga)
    VOLUME_USERS: z.coerce.number().int().min(1).optional().default(500),
    VOLUME_ORGANIZERS: z.coerce.number().int().min(1).optional().default(20),
    VOLUME_EVENTS: z.coerce.number().int().min(1).optional().default(100),
    VOLUME_TICKET_TYPES: z.coerce.number().int().min(1).optional().default(300),
    VOLUME_TICKETS: z.coerce.number().int().min(1).optional().default(2000),
    VOLUME_PAYMENTS: z.coerce.number().int().min(1).optional().default(2000),
    VOLUME_BATCH_SIZE: z.coerce.number().int().min(1).optional().default(500),
  })
  .refine(
    (data) => {
      const hasDbUrl = !!(data.DATABASE_URL || data.POSTGRES_URL);
      const hasPgVars = !!(
        data.PGHOST &&
        data.PGUSER &&
        data.PGPASSWORD &&
        data.PGDATABASE
      );
      return hasDbUrl || hasPgVars;
    },
    {
      message:
        "Either DATABASE_URL/POSTGRES_URL or all PG* variables must be provided",
      path: ["DATABASE_URL"],
    },
  )
  .refine(
    (data) => {
      if (data.NODE_ENV === "production") {
        return !!data.REDIS_URL;
      }
      return true;
    },
    { message: "REDIS_URL is required in production", path: ["REDIS_URL"] },
  );

export const env = EnvSchema.parse(process.env);
