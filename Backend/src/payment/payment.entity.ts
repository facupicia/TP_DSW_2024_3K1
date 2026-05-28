import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn, Index, ManyToOne, JoinColumn, BaseEntity, Check, DeleteDateColumn } from 'typeorm';
import { User } from '../user/user.entity';

export enum PaymentStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded'
}

// Registro de pagos procesados para garantizar idempotencia del webhook
@Entity()
@Unique(['mpPaymentId'])
@Index('idx_payment_status_created', ['status', 'createdAt'])
@Index('idx_payment_organizer_status', ['organizerId', 'status'])
@Index('idx_payment_status_organizer', ['status', 'organizerId'])
@Index('idx_payment_user_created', ['userId', 'createdAt'])
@Check('"quantity" > 0')
@Check('"totalAmount" > 0')
@Check('"baseAmount" >= 0')
@Check('"discountAmount" >= 0')
@Check('"serviceFeePercent" >= 0 AND "serviceFeePercent" <= 100')
@Check('"serviceFeeAmount" >= 0')
@Check('"buyerTotalAmount" > 0')
@Check('"commissionPercent" >= 0 AND "commissionPercent" <= 100')
@Check('"refundAmount" IS NULL OR "refundAmount" >= 0')
export class PaymentLog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  mpPaymentId: string;

  @Column({ nullable: true })
  @Index('idx_payment_external_ref')
  externalReference?: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'jsonb', nullable: true })
  items: Array<{ type: 'ticket' | 'extra'; referenceId: number; quantity: number; unitPrice: number }> | null;

  /* ===================== PAYMENT AMOUNTS ===================== */

  @Column()
  quantity: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  baseAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  serviceFeePercent: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  serviceFeeAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  buyerTotalAmount: number;

  /* ===================== COMMISSION SNAPSHOT ===================== */

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  commissionPercent: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  commissionAmount: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  organizerPlanName: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organizerId' })
  organizer: User | null;

  @Column({ nullable: true })
  organizerId: number | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PROCESSING
  })
  status: PaymentStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_payment_created_at')
  createdAt: Date;

  /* ===================== REFUND FIELDS ===================== */

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt?: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'refundedBy' })
  refundedByUser: User | null;

  @Column({ nullable: true })
  refundedBy?: number;

  @Column({ type: 'text', nullable: true })
  refundReason?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  refundAmount?: number;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt?: Date;
}
