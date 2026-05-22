import { MigrationInterface, QueryRunner } from "typeorm";

export class FixProPlanExtras20260521150000 implements MigrationInterface {
    name = "FixProPlanExtras20260521150000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Fix: plans other than FREE should be able to sell extras.
        // We set maxProductsInCatalog = 50 for paid plans, -1 for PRO if unlimited is desired.
        // Here we use 50 as a reasonable default for PRO.
        await queryRunner.query(`
            UPDATE "subscription_plan"
            SET "maxProductsInCatalog" = 50, "canSellExtras" = true
            WHERE "name" <> 'FREE'
        `);

        // Ensure FREE plan stays restricted
        await queryRunner.query(`
            UPDATE "subscription_plan"
            SET "maxProductsInCatalog" = 0, "canSellExtras" = false
            WHERE "name" = 'FREE'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert all plans back to no extras
        await queryRunner.query(`
            UPDATE "subscription_plan"
            SET "maxProductsInCatalog" = 0, "canSellExtras" = false
        `);
    }
}
