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

    @ManyToOne(() => Event, event => event.tickets)
    @JoinColumn({ name: "event_Id" })
    event: Event;

    @ManyToOne(() => User, user => user.tickets)
    @JoinColumn({ name: "user_Id" })
    user: User;

    @Index('idx_ticket_eventId')
    @Column()
    eventId: number;

    @Column()
    titleEvent: string;

    @Index('idx_ticket_userId')
    @Column()
    userId: number;

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
