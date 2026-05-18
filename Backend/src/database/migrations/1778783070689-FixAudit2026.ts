import { MigrationInterface, QueryRunner } from "typeorm";

export class FixAudit20261778783070689 implements MigrationInterface {
    name = 'FixAudit20261778783070689'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Soft delete para entidades financieras (PaymentLog)
        await queryRunner.query(`ALTER TABLE "payment_log" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);

        // 2. Relación directa Ticket <-> PaymentLog para auditoría y refunds precisos
        await queryRunner.query(`ALTER TABLE "ticket" ADD "paymentLogId" integer`);
        await queryRunner.query(`ALTER TABLE "ticket" ADD CONSTRAINT "FK_764f3927b74323af1c8a1f93c39" FOREIGN KEY ("paymentLogId") REFERENCES "payment_log"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // 3. UNIQUE en mpUserId para evitar que dos organizadores vinculen la misma cuenta MP
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "UQ_8f387595fb859d86221591f97ad" UNIQUE ("mpUserId")`);

        // 4. Índice en Event.title para acelerar búsquedas públicas
        await queryRunner.query(`CREATE INDEX "idx_event_title" ON "event" ("title") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_event_title"`);
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "UQ_8f387595fb859d86221591f97ad"`);
        await queryRunner.query(`ALTER TABLE "ticket" DROP CONSTRAINT "FK_764f3927b74323af1c8a1f93c39"`);
        await queryRunner.query(`ALTER TABLE "ticket" DROP COLUMN "paymentLogId"`);
        await queryRunner.query(`ALTER TABLE "payment_log" DROP COLUMN "deletedAt"`);
    }

}
