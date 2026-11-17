import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('refund_request')
export class RefundRequest {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ unique: true }) paymentLogId: number;
    @Column({ default: 'pending' }) status: string;
    @Column({ type: 'numeric', precision: 12, scale: 2 }) amount: number;
    @Column({ type: 'text', nullable: true }) reason: string | null;
    @Column({ nullable: true }) requestedBy: number | null;
    @Column({ nullable: true }) refundId: string | null;
    @Column({ type: 'text', nullable: true, select: false }) lastError: string | null;
    @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
