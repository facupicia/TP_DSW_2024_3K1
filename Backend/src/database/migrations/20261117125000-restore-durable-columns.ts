import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreDurableColumns1794919800000 implements MigrationInterface {
    async up(q: QueryRunner): Promise<void> {
        const [previous] = await q.query(`SELECT
            EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='user' AND column_name='credentialsVersion') AS "hasUserVersion",
            EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='account_claim_token' AND column_name='purpose') AS "hasClaimPurpose",
            EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='account_claim_token' AND column_name='credentialsVersion') AS "hasClaimVersion"`);
        // Older production images used synchronize=true and could remove these
        // columns after DurableCommerce had already been recorded as applied.
        await q.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "credentialsVersion" integer NOT NULL DEFAULT 0`);
        await q.query(`ALTER TABLE account_claim_token ADD COLUMN IF NOT EXISTS purpose varchar NOT NULL DEFAULT 'claim',
            ADD COLUMN IF NOT EXISTS "credentialsVersion" integer NOT NULL DEFAULT 0`);
        await q.query(`ALTER TABLE event ADD COLUMN IF NOT EXISTS "timeZone" varchar NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'`);
        if (!previous.hasUserVersion) {
            // Lost versions cannot be reconstructed. Invalidate old JWTs and
            // refresh sessions instead of resetting existing accounts to zero.
            await q.query(`UPDATE "user" SET "credentialsVersion"=(floor(random()*2147483646)+1)::integer`);
            await q.query(`UPDATE refresh_token SET "revokedAt"=NOW() WHERE "revokedAt" IS NULL`);
        }
        if (!previous.hasUserVersion || !previous.hasClaimPurpose || !previous.hasClaimVersion) {
            // A lost purpose could relabel reset links as account claims.
            await q.query(`UPDATE account_claim_token SET "usedAt"=NOW() WHERE "usedAt" IS NULL`);
        }
    }

    async down(): Promise<void> {
        // These columns may predate this repair; keep their data on rollback.
    }
}
