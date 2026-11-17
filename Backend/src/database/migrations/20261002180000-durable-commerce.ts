import { MigrationInterface, QueryRunner } from 'typeorm';

export class DurableCommerce1790964000000 implements MigrationInterface {
    async up(q: QueryRunner) {
        await q.query(`CREATE TABLE outbox_job (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key varchar NOT NULL UNIQUE,
            kind varchar NOT NULL, payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
            "availableAt" timestamptz NOT NULL DEFAULT NOW(), "lockedUntil" timestamptz, owner uuid,
            "processedAt" timestamptz, "lastError" text, "createdAt" timestamptz NOT NULL DEFAULT NOW())`);
        await q.query(`CREATE INDEX idx_outbox_ready ON outbox_job ("availableAt") WHERE "processedAt" IS NULL`);
        await q.query(`CREATE TABLE checkout_order ("externalReference" varchar PRIMARY KEY, "userId" integer NOT NULL REFERENCES "user"(id),
            "organizerId" integer NOT NULL, "eventId" integer NOT NULL, "statusTokenHash" varchar NOT NULL,
            snapshot jsonb NOT NULL, status varchar NOT NULL DEFAULT 'pending', "preferenceId" varchar,
            "expiresAt" timestamptz NOT NULL, "reservationExpiresAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT NOW())`);
        await q.query(`CREATE INDEX idx_checkout_user ON checkout_order ("userId")`);
        await q.query(`CREATE INDEX idx_checkout_reservations ON checkout_order ("reservationExpiresAt") WHERE status='pending'`);
        await q.query(`CREATE TABLE refund_request (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "paymentLogId" integer NOT NULL UNIQUE REFERENCES payment_log(id),
            status varchar NOT NULL DEFAULT 'pending', amount numeric(12,2) NOT NULL CHECK(amount>0), reason text,
            "requestedBy" integer, "refundId" varchar, "lastError" text, "createdAt" timestamptz NOT NULL DEFAULT NOW())`);
        await q.query(`ALTER TABLE account_claim_token ADD COLUMN purpose varchar NOT NULL DEFAULT 'claim', ADD COLUMN "credentialsVersion" integer NOT NULL DEFAULT 0`);
        await q.query(`ALTER TABLE "user" ADD COLUMN "credentialsVersion" integer NOT NULL DEFAULT 0`);
        await q.query(`ALTER TABLE event ADD COLUMN "timeZone" varchar NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'`);
        await q.query(`UPDATE event SET "startDateTime"=(date+COALESCE(time,'00:00'::time)) AT TIME ZONE "timeZone"`);
    }
    async down(q: QueryRunner) {
        await q.query(`ALTER TABLE account_claim_token DROP COLUMN purpose, DROP COLUMN "credentialsVersion"`);
        await q.query(`DROP TABLE refund_request, checkout_order, outbox_job`);
        await q.query(`ALTER TABLE "user" DROP COLUMN "credentialsVersion"`);
        await q.query(`ALTER TABLE event DROP COLUMN "timeZone"`);
    }
}
