import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTicketDeletedAt20260507170000 implements MigrationInterface {
    name = "AddTicketDeletedAt20260507170000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ticket"
            ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ticket"
            DROP COLUMN IF EXISTS "deletedAt"
        `);
    }
}
