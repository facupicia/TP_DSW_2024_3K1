import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Add startDateTime column to Event entity
 * 
 * Purpose:
 * - Replaces the non-sargable (date + time) > NOW() filter with a proper
 *   indexed timestamptz column for future event queries.
 * - Backfills existing data by combining the date and time columns.
 * - Creates a composite index for the most common query pattern:
 *   WHERE active = true AND isPublic = true AND startDateTime > NOW()
 * 
 * Backward compatibility:
 * - The original date and time columns are preserved.
 * - The startDateTime column is nullable to avoid breaking existing data
 *   during the migration window.
 */
export class AddEventStartDateTime20260529120000 implements MigrationInterface {
    name = 'AddEventStartDateTime20260529120000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add the new column (nullable to allow safe migration)
        await queryRunner.query(`
            ALTER TABLE "event"
            ADD COLUMN IF NOT EXISTS "startDateTime" TIMESTAMPTZ NULL
        `);

        // 2. Backfill existing rows by combining date + time
        await queryRunner.query(`
            UPDATE "event"
            SET "startDateTime" = ("date"::text || 'T' || COALESCE("time"::text, '00:00:00'))::timestamptz
            WHERE "startDateTime" IS NULL
        `);

        // 3. Create the composite index for the primary public listing query
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_event_active_public_startdatetime"
            ON "event" ("active", "isPublic", "startDateTime")
            WHERE "deletedAt" IS NULL
        `);

        // 4. Remove the redundant index on user.mpUserId 
        //    (the UNIQUE constraint already creates one)
        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_user_mp_user_id"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverse: re-create the dropped user index
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_user_mp_user_id"
            ON "user" ("mpUserId")
        `);

        // Reverse: drop the new composite index
        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_event_active_public_startdatetime"
        `);

        // Reverse: drop the new column
        await queryRunner.query(`
            ALTER TABLE "event" DROP COLUMN IF EXISTS "startDateTime"
        `);
    }
}
