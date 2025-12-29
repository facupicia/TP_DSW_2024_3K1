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
  eventId: number;

  @Column()
  amount: number;

  @Column({
        type: 'enum',
        enum: PaymentStatus,
        default: PaymentStatus.PROCESSING
    })
    status: PaymentStatus;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}

