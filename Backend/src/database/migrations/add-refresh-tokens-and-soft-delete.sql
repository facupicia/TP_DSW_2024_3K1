-- Migration: Refresh tokens + soft delete for users
-- Run this SQL in PostgreSQL before deploying the refresh-token flow in production.

ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;

CREATE TABLE IF NOT EXISTS refresh_token (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tokenHash" varchar NOT NULL UNIQUE,
    "userId" integer NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "expiresAt" timestamp NOT NULL,
    "revokedAt" timestamp NULL,
    "replacedByHash" varchar NULL,
    "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_refresh_token_userId"
ON refresh_token ("userId");

CREATE INDEX IF NOT EXISTS "IDX_refresh_token_expiresAt"
ON refresh_token ("expiresAt");
