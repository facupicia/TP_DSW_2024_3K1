import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Add composite index on PaymentLog.externalReference + createdAt
 *
 * Purpose:
 * - The getPaymentStatus endpoint queries by external_reference with ORDER BY createdAt DESC.
 * - Without an index, PostgreSQL must scan the entire payment_log table.
 * - This composite index covers the exact query pattern.
 *
 * Note:
 * - externalReference is nullable but the index is still useful for lookups.
 */
export class AddPaymentExternalRefIndex20260530194000 implements MigrationInterface {
    name = 'AddPaymentExternalRefIndex20260530194000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_payment_external_ref_lookup"
            ON "payment_log" ("externalReference", "createdAt")
            WHERE "deletedAt" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_payment_external_ref_lookup"
        `);
    }
}
