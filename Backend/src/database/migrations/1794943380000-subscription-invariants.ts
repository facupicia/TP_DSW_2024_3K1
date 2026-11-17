import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionInvariants1794943380000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        // Preserve financial history. Existing duplicates need an explicit repair,
        // not silent deletion or rebinding during a release.
        const duplicates = await queryRunner.query(`SELECT 'active_user' AS kind FROM user_subscription WHERE status='active'
            GROUP BY "userId" HAVING COUNT(*)>1
            UNION ALL SELECT 'external_id' AS kind FROM user_subscription WHERE "externalSubscriptionId" IS NOT NULL
            GROUP BY "externalSubscriptionId" HAVING COUNT(*)>1`);
        if (duplicates.length) throw new Error('SUBSCRIPTION_DUPLICATES_REQUIRE_REVIEW');
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_active_user ON user_subscription ("userId") WHERE status='active'`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_external_id ON user_subscription ("externalSubscriptionId") WHERE "externalSubscriptionId" IS NOT NULL`);
    }
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS uq_subscription_external_id');
        await queryRunner.query('DROP INDEX IF EXISTS uq_subscription_active_user');
    }
}
