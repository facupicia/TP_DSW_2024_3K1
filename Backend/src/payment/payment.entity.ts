import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn, Index } from 'typeorm';

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
@Index('idx_payment_user_created', ['userId', 'createdAt'])
@Index('idx_payment_ticket_type_status_created', ['ticketTypeId', 'status', 'createdAt'])
export class PaymentLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  mpPaymentId: string;

  @Column({ nullable: true })
  @Index('idx_payment_external_ref')
  externalReference?: string;

  @Column()
  @Index('idx_payment_user')
  userId: number;

  @Column()
  @Index('idx_payment_ticket_type')
  ticketTypeId: number;

  /* ===================== PAYMENT AMOUNTS ===================== */

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  unitPrice: number;

  @Column()
  quantity: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalAmount: number;

  /* ===================== COMMISSION SNAPSHOT ===================== */

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  commissionPercent: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  commissionAmount: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  organizerPlanName: string;

  @Column({ nullable: true })
  @Index('idx_payment_organizer')
  organizerId: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PROCESSING
  })
  @Index('idx_payment_status')
  status: PaymentStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_payment_created_at')
  createdAt: Date;

  /* ===================== REFUND FIELDS ===================== */

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt?: Date;

  @Column({ nullable: true })
  refundedBy?: number;

  @Column({ type: 'text', nullable: true })
  refundReason?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  refundAmount?: number;
}
