import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn } from 'typeorm';

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

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}

