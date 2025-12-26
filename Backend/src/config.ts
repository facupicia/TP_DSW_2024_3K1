import { z } from "zod";

const EnvSchema = z.object({
    NODE_ENV: z.string().default("development"),
    PORT: z.string().optional(),
    SECRET_KEY: z.string().min(1),
    CLIENT_URLS: z.string().optional(),
    CLIENT_URL: z.string().optional(),
    MP_ACCESS_TOKEN: z.string().min(1),
    MP_NOTIFICATION_URL: z.string().optional(),
    MP_TEST_PAYER_EMAIL: z.string().optional(),
    MP_WEBHOOK_SECRET: z.string().optional(),
    POSTGRES_URL: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    PGHOST: z.string().optional(),
    PGPORT: z.string().optional(),
    PGUSER: z.string().optional(),
    PGPASSWORD: z.string().optional(),
    PGDATABASE: z.string().optional(),
    ID_CLIENT_GOOGLE_OAUTH: z.string().optional(),
    REDIS_URL: z.string().optional()
});

export const env = EnvSchema.parse(process.env);

