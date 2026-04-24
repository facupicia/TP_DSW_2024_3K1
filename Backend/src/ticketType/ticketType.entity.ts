import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, BaseEntity, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index, OneToMany, Check } from 'typeorm';
import { Event } from '../event/event.entity';
import { Ticket } from '../ticket/ticket.entity';

export enum TicketTypeStatus {
    ACTIVE = 'active',
    SOLD_OUT = 'sold_out',
    PAUSED = 'paused',
    DISABLED = 'disabled'
}

@Entity('ticket_type')
@Index('idx_ticket_type_event_status', ['eventId', 'status'])
@Check('"soldCount" >= 0')
@Check('"soldCount" <= "capacity"')
export class TicketType extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @Index('idx_ticket_type_eventId')
    eventId: number;

    @ManyToOne(() => Event, event => event.ticketTypes)
    @JoinColumn({ name: "eventId" })
    event: Event;

    @OneToMany(() => Ticket, ticket => ticket.ticketType)
    tickets: Ticket[];

    @Column()
    name: string;

    @Column({ nullable: true })
    description: string;

    @Column("decimal", { precision: 12, scale: 2 })
    price: number;

    @Column()
    capacity: number;

    @Column({ default: 0 })
    soldCount: number;

    @Column({
        type: 'enum',
        enum: TicketTypeStatus,
        default: TicketTypeStatus.ACTIVE
    })
    status: TicketTypeStatus;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt: Date;

    @DeleteDateColumn({ type: 'timestamp', nullable: true })
    deletedAt: Date | null;
}
