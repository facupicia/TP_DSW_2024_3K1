import { MigrationInterface, QueryRunner } from "typeorm";

export class RemovePaymentLogUnitPrice20260522050000 implements MigrationInterface {
    name = "RemovePaymentLogUnitPrice20260522050000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Eliminar constraint CHECK sobre unitPrice
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP CONSTRAINT IF EXISTS "chk_payment_unit_price"
        `);

        // 2. Eliminar columna legacy unitPrice
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP COLUMN IF EXISTS "unitPrice"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 1. Restaurar columna unitPrice
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "unitPrice" numeric(12,2) NOT NULL DEFAULT 0
        `);

        // 2. Restaurar constraint CHECK
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD CONSTRAINT "chk_payment_unit_price" CHECK ("unitPrice" >= 0)
        `);
    }
}
