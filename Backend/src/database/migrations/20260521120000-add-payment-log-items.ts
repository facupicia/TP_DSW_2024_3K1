import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentLogItems20260521120000 implements MigrationInterface {
    name = "AddPaymentLogItems20260521120000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Eliminar índice que depende de ticketTypeId
        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_payment_ticket_type_status_created"
        `);

        // 2. Eliminar foreign key de ticketTypeId
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP CONSTRAINT IF EXISTS "FK_payment_log_ticketTypeId"
        `);

        // 3. Eliminar columna ticketTypeId
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP COLUMN IF EXISTS "ticketTypeId"
        `);

        // 4. Agregar columna items (JSONB)
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "items" jsonb
        `);

        // 5. Agregar índice GIN para consultas eficientes sobre items
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_payment_log_items"
            ON "payment_log" USING GIN ("items")
        `);

        // 6. Migrar datos legacy: crear array de un solo item a partir de unitPrice + quantity
        // Nota: esto es un best-effort para logs existentes antes del cambio.
        await queryRunner.query(`
            UPDATE "payment_log"
            SET "items" = jsonb_build_array(
                jsonb_build_object(
                    'ticketTypeId', NULL,
                    'quantity', "quantity",
                    'unitPrice', "unitPrice"
                )
            )
            WHERE "items" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 1. Restaurar columna ticketTypeId (sin FK ni datos, solo estructura)
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "ticketTypeId" integer
        `);

        // 2. Recuperar índice legacy (no se puede recuperar FK sin datos)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_payment_ticket_type_status_created"
            ON "payment_log" ("ticketTypeId", "status", "createdAt")
        `);

        // 3. Eliminar columna items
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP COLUMN IF EXISTS "items"
        `);

        // 4. Eliminar índice GIN
        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_payment_log_items"
        `);
    }
}
