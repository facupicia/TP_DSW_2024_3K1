import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBuyerServiceFeePricing20260508193000 implements MigrationInterface {
    name = "AddBuyerServiceFeePricing20260508193000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            ADD COLUMN IF NOT EXISTS "serviceFeePercent" numeric(5,2) NOT NULL DEFAULT 15.00
        `);
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            ADD COLUMN IF NOT EXISTS "minimumServiceFee" numeric(10,2) NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`
            UPDATE "subscription_plan"
            SET "serviceFeePercent" = CASE
                WHEN name = 'PRO' THEN 12.00
                ELSE 15.00
            END
            WHERE "serviceFeePercent" IS NULL OR "serviceFeePercent" = 15.00
        `);
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            DROP CONSTRAINT IF EXISTS chk_plan_service_fee
        `);
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            ADD CONSTRAINT chk_plan_service_fee CHECK ("serviceFeePercent" >= 0 AND "serviceFeePercent" <= 100)
        `);
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            DROP CONSTRAINT IF EXISTS chk_plan_minimum_service_fee
        `);
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            ADD CONSTRAINT chk_plan_minimum_service_fee CHECK ("minimumServiceFee" >= 0)
        `);

        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "baseAmount" numeric(12,2) NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "discountAmount" numeric(12,2) NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "serviceFeePercent" numeric(5,2) NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "serviceFeeAmount" numeric(12,2) NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD COLUMN IF NOT EXISTS "buyerTotalAmount" numeric(12,2) NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`
            UPDATE "payment_log"
            SET
                "baseAmount" = COALESCE(NULLIF("baseAmount", 0), "totalAmount"),
                "buyerTotalAmount" = COALESCE(NULLIF("buyerTotalAmount", 0), "totalAmount")
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP CONSTRAINT IF EXISTS chk_payment_base_amount
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD CONSTRAINT chk_payment_base_amount CHECK ("baseAmount" >= 0)
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP CONSTRAINT IF EXISTS chk_payment_discount_amount
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD CONSTRAINT chk_payment_discount_amount CHECK ("discountAmount" >= 0)
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP CONSTRAINT IF EXISTS chk_payment_service_fee_percent
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD CONSTRAINT chk_payment_service_fee_percent CHECK ("serviceFeePercent" >= 0 AND "serviceFeePercent" <= 100)
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP CONSTRAINT IF EXISTS chk_payment_service_fee_amount
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD CONSTRAINT chk_payment_service_fee_amount CHECK ("serviceFeeAmount" >= 0)
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            DROP CONSTRAINT IF EXISTS chk_payment_buyer_total
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_log"
            ADD CONSTRAINT chk_payment_buyer_total CHECK ("buyerTotalAmount" > 0)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_buyer_total`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_service_fee_amount`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_service_fee_percent`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_discount_amount`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_base_amount`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP COLUMN IF EXISTS "buyerTotalAmount"`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP COLUMN IF EXISTS "serviceFeeAmount"`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP COLUMN IF EXISTS "serviceFeePercent"`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP COLUMN IF EXISTS "discountAmount"`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP COLUMN IF EXISTS "baseAmount"`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_minimum_service_fee`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_service_fee`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" DROP COLUMN IF EXISTS "minimumServiceFee"`);
        await queryRunner.query(`ALTER TABLE "subscription_plan" DROP COLUMN IF EXISTS "serviceFeePercent"`);
    }
}
