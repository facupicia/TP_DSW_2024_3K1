import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, BaseEntity, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { Event } from '../event/event.entity';
import { Ticket } from '../ticket/ticket.entity';

@Entity('ticket_type')
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

    @Column({ default: true })
    active: boolean;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt: Date;
}
