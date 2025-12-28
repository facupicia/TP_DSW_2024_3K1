import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, BaseEntity, CreateDateColumn, Index } from 'typeorm';
import { Event } from '../event/event.entity';
import { User } from '../user/user.entity';

export enum TicketStatus {
    VALID = 'valid',
    USED = 'used',
    CANCELLED = 'cancelled'
}

@Entity()
export class Ticket extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    codigo_unico: string;

    // CORRECCIÓN 1: Unificamos la relación con la columna ID
    @Column()
    @Index('idx_ticket_eventId')
    eventId: number;

    @ManyToOne(() => Event, event => event.tickets)
    @JoinColumn({ name: "eventId" }) // Apunta a la columna de arriba
    event: Event;

    // CORRECCIÓN 2: Lo mismo para el usuario
    @Column()
    @Index('idx_ticket_userId')
    userId: number;

    @ManyToOne(() => User, user => user.tickets)
    @JoinColumn({ name: "userId" }) // Apunta a la columna de arriba
    user: User;

    @Column()
    titleEvent: string;

    @Column({ type: "text" })
    qrCode: string;

    @Column({
        type: "enum",
        enum: TicketStatus,
        default: TicketStatus.VALID
    })
    status: TicketStatus;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    purchasePrice: number;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @Column({ type: "timestamp", nullable: true })
    usedAt: Date;
}