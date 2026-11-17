import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentChargebackStatus1794945300000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE payment_log_status_enum ADD VALUE IF NOT EXISTS 'charged_back'`);
    }
    async down(): Promise<void> {
        throw new Error('Chargeback status is retained to preserve financial history; roll back application code without removing the enum value');
    }
}
