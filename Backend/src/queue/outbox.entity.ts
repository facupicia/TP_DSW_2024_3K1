import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('outbox_job')
@Index('idx_outbox_ready', ['processedAt', 'availableAt'])
export class OutboxJob {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ unique: true }) key: string;
    @Column() kind: string;
    @Column({ type: 'jsonb', select: false }) payload: Record<string, any>;
    @Column({ default: 0 }) attempts: number;
    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) availableAt: Date;
    @Column({ type: 'timestamptz', nullable: true }) lockedUntil: Date | null;
    @Column({ type: 'uuid', nullable: true }) owner: string | null;
    @Column({ type: 'timestamptz', nullable: true }) processedAt: Date | null;
    @Column({ type: 'text', nullable: true, select: false }) lastError: string | null;
    @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
