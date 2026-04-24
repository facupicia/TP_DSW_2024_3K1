-- Migration: Guest account claim flow
-- Run this SQL in PostgreSQL before deploying the account-claim feature in production.

ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "isGuestAccount" boolean NOT NULL DEFAULT false;

ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "claimedAt" timestamp NULL;

CREATE INDEX IF NOT EXISTS "idx_user_guest_account"
ON "user" ("isGuestAccount");

CREATE TABLE IF NOT EXISTS account_claim_token (
    id SERIAL PRIMARY KEY,
    "userId" integer NOT NULL,
    "tokenHash" varchar NOT NULL UNIQUE,
    "expiresAt" timestamp NOT NULL,
    "usedAt" timestamp NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "FK_account_claim_token_user"
        FOREIGN KEY ("userId")
        REFERENCES "user"(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_account_claim_token_user"
ON account_claim_token ("userId");

CREATE INDEX IF NOT EXISTS "idx_account_claim_token_expires"
ON account_claim_token ("expiresAt");
