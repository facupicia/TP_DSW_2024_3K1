import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, BaseEntity } from "typeorm";

/**
 * Webhook Log Entity
 * 
 * Almacena todos los webhooks recibidos para auditoría y debugging.
 */
@Entity()
@Index("idx_webhook_log_type_created", ["type", "createdAt"])
export class WebhookLog extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50 })
    type: 'payment' | 'subscription';

    @Column({ type: 'varchar', length: 100, nullable: true })
    action: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    @Index()
    mpPaymentId: string;

    @Column({ type: 'jsonb', nullable: true, select: false })
    payload: any;

    @Column({ type: 'varchar', length: 45, select: false })
    ipAddress: string;

    @Column({ type: 'boolean', default: false })
    @Index()
    processed: boolean;

    @Column({ type: 'boolean', default: false })
    @Index()
    isDuplicate: boolean;

    @Column({ type: 'text', nullable: true })
    error: string;

    @Column({ type: 'timestamptz', nullable: true })
    processedAt: Date;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @Column({ type: 'varchar', length: 500, nullable: true })
    userAgent: string;
}
