import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn } from 'typeorm';

export enum PaymentStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded'
}

// Registro de pagos procesados para garantizar idempotencia del webhook
@Entity()
@Unique(['mpPaymentId'])
export class PaymentLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  mpPaymentId: string;

  @Column({ nullable: true })
  externalReference?: string;

  @Column()
  userId: number;

  @Column()
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
  organizerId: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PROCESSING
  })
  status: PaymentStatus;

  @CreateDateColumn({ type: 'timestamp' })
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

