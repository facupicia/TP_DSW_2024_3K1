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
  externalReference?: string;

  @Column()
  @Index('idx_payment_user')
  userId: number;

  @Column()
  @Index('idx_payment_ticket_type')
  ticketTypeId: number;

  /* ===================== PAYMENT AMOUNTS ===================== */
  // El evento se obtiene vía: payment_log → ticket_type → event

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  unitPrice: number;

  @Column()
  quantity: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalAmount: number;

  /* ===================== COMMISSION SNAPSHOT ===================== */
  // Snapshot of organizer's plan commission at time of payment (for auditing)

  /** Commission percentage from organizer's plan at time of payment */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  commissionPercent: number;

  /** Calculated commission amount (totalAmount * commissionPercent / 100) */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  commissionAmount: number;

  /** Organizer's plan name at time of payment (FREE, PRO, etc.) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  organizerPlanName: string;

  /** Organizer ID who receives the payment (marketplace audit) */
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

  @CreateDateColumn({ type: 'timestamp' })
  @Index('idx_payment_created_at')
  createdAt: Date;

  /* ===================== REFUND FIELDS ===================== */

  @Column({ type: 'timestamp', nullable: true })
  refundedAt?: Date;

  @Column({ nullable: true })
  refundedBy?: number;

  @Column({ type: 'text', nullable: true })
  refundReason?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  refundAmount?: number;
}
