import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';

export class PhaseOneHardening1794956400000 implements MigrationInterface {
    async up(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE outbox_job ADD COLUMN IF NOT EXISTS "failedAt" timestamptz`);
        await q.query(`CREATE INDEX IF NOT EXISTS idx_ticket_payment_log ON ticket ("paymentLogId")`);
        await q.query(`CREATE INDEX IF NOT EXISTS idx_event_product_product ON event_product ("productId")`);
        await q.query(`CREATE INDEX IF NOT EXISTS idx_user_subscription_plan ON user_subscription ("planId")`);
        await q.query(`CREATE INDEX IF NOT EXISTS idx_checkout_pending_event ON checkout_order ("eventId") WHERE status='pending'`);

        // Discover TypeORM's generated name instead of assuming a particular
        // historical constraint name. No coupon or financial row is rewritten.
        const table = await q.getTable('coupon');
        if (!table) throw new Error('COUPON_TABLE_REQUIRED');
        if (!table.uniques.some(u => u.name === 'uq_coupon_event_code')) {
            await q.createUniqueConstraint('coupon', new TableUnique({ name: 'uq_coupon_event_code', columnNames: ['eventId', 'code'] }));
        }
        for (const unique of table.uniques.filter(u => u.columnNames.length === 1 && u.columnNames[0] === 'code')) {
            await q.dropUniqueConstraint('coupon', unique);
        }
    }

    async down(q: QueryRunner): Promise<void> {
        const duplicateCodes = await q.query(`SELECT code FROM coupon GROUP BY code HAVING COUNT(*)>1 LIMIT 1`);
        const failures = await q.query(`SELECT id FROM outbox_job WHERE "failedAt" IS NOT NULL LIMIT 1`);
        if (duplicateCodes.length || failures.length) throw new Error('PHASE_ONE_ROLLBACK_REQUIRES_REVIEW: preserve coupons and failed jobs');
        await q.createUniqueConstraint('coupon', new TableUnique({ name: 'uq_coupon_code_global', columnNames: ['code'] }));
        await q.dropUniqueConstraint('coupon', 'uq_coupon_event_code');
        for (const index of ['idx_checkout_pending_event', 'idx_user_subscription_plan', 'idx_event_product_product', 'idx_ticket_payment_log']) {
            await q.query(`DROP INDEX IF EXISTS "${index}"`);
        }
        await q.query(`ALTER TABLE outbox_job DROP COLUMN "failedAt"`);
    }
}
