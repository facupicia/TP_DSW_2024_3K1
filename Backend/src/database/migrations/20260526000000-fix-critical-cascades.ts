import { MigrationInterface, QueryRunner } from "typeorm";

export class FixCriticalCascades20260526000000 implements MigrationInterface {
    name = "FixCriticalCascades20260526000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Event -> User: CASCADE -> SET NULL
        await queryRunner.query(`
            ALTER TABLE "event"
            DROP CONSTRAINT IF EXISTS "FK_event_user_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "event"
            ALTER COLUMN "user_id" DROP NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "event"
            ADD CONSTRAINT "FK_event_user_id"
            FOREIGN KEY ("user_id")
            REFERENCES "user"(id)
            ON DELETE SET NULL
        `);

        // 2. Product -> User: CASCADE -> SET NULL
        await queryRunner.query(`
            ALTER TABLE "product"
            DROP CONSTRAINT IF EXISTS "FK_product_organizerId"
        `);
        await queryRunner.query(`
            ALTER TABLE "product"
            ALTER COLUMN "organizerId" DROP NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "product"
            ADD CONSTRAINT "FK_product_organizerId"
            FOREIGN KEY ("organizerId")
            REFERENCES "user"(id)
            ON DELETE SET NULL
        `);

        // 3. UserSubscription -> User: CASCADE -> RESTRICT
        await queryRunner.query(`
            ALTER TABLE "user_subscription"
            DROP CONSTRAINT IF EXISTS "FK_user_subscription_userId"
        `);
        await queryRunner.query(`
            ALTER TABLE "user_subscription"
            ADD CONSTRAINT "FK_user_subscription_userId"
            FOREIGN KEY ("userId")
            REFERENCES "user"(id)
            ON DELETE RESTRICT
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert Event -> User
        await queryRunner.query(`
            ALTER TABLE "event"
            DROP CONSTRAINT IF EXISTS "FK_event_user_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "event"
            ALTER COLUMN "user_id" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "event"
            ADD CONSTRAINT "FK_event_user_id"
            FOREIGN KEY ("user_id")
            REFERENCES "user"(id)
            ON DELETE CASCADE
        `);

        // Revert Product -> User
        await queryRunner.query(`
            ALTER TABLE "product"
            DROP CONSTRAINT IF EXISTS "FK_product_organizerId"
        `);
        await queryRunner.query(`
            ALTER TABLE "product"
            ALTER COLUMN "organizerId" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "product"
            ADD CONSTRAINT "FK_product_organizerId"
            FOREIGN KEY ("organizerId")
            REFERENCES "user"(id)
            ON DELETE CASCADE
        `);

        // Revert UserSubscription -> User
        await queryRunner.query(`
            ALTER TABLE "user_subscription"
            DROP CONSTRAINT IF EXISTS "FK_user_subscription_userId"
        `);
        await queryRunner.query(`
            ALTER TABLE "user_subscription"
            ADD CONSTRAINT "FK_user_subscription_userId"
            FOREIGN KEY ("userId")
            REFERENCES "user"(id)
            ON DELETE CASCADE
        `);
    }
}
