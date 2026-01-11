import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn } from 'typeorm';

export enum PaymentStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
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

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PROCESSING
  })
  status: PaymentStatus;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}

