import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    BaseEntity,
    OneToMany,
    ManyToOne,
    JoinColumn,
    Index,
    Check
} from "typeorm";

import { TicketType } from "../ticketType/ticketType.entity";
import { User } from "../user/user.entity";
import { Category } from "../category/category.entity";
import { PromoterEventAssignment } from "../promoter/promoter.entity";
import { EventProduct } from "../extra/eventProduct.entity";

@Entity("event")
@Index('idx_event_public_date', ['active', 'isPublic', 'date'])
@Index('idx_event_user_active_date', ['user_id', 'active', 'date'])
@Index('idx_event_category_active_date', ['categoryId', 'active', 'date'])
@Index('idx_event_ciudad', ['ciudad'])
@Index('idx_event_destacado_active_date', ['destacado', 'active', 'date'])
@Index('idx_event_date', ['date'])
@Index('idx_event_title', ['title'])
@Check('"minAge" >= 0')
export class Event extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar", length: 255 })
    title: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    pais: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    provincia: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    ciudad: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    direccion: string;

    @Column({ type: "varchar", length: 255 })
    organizer: string;

    @Column({ type: "varchar", nullable: true })
    image: string;

    @Column({ type: "date" })
    date: Date;

    @Column({ type: "time" })
    time: string;

    @Column({ type: "varchar", length: 500, nullable: true })
    description: string;

    @Column({ default: true })
    active: boolean;

    @Column({ default: false })
    destacado: boolean;

    @Column({ default: 0 })
    minAge: number;

    @Column({ default: true })
    isPublic: boolean;

    /* ===================== RELATIONS ===================== */

    @ManyToOne(() => User, user => user.eventos, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: "user_id" })
    user: User;

    @Column()
    user_id: number;

    @ManyToOne(() => Category, category => category.events, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: "categoryId" })
    category: Category;

    @Column()
    categoryId: number;

    @OneToMany(() => TicketType, ticketType => ticketType.event, {
        cascade: true
    })
    ticketTypes: TicketType[];

    @OneToMany(() => PromoterEventAssignment, assignment => assignment.event)
    promoterAssignments: PromoterEventAssignment[];

    @OneToMany(() => EventProduct, ep => ep.event)
    eventProducts: EventProduct[];

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;

    @DeleteDateColumn({ type: "timestamptz", nullable: true })
    deletedAt: Date | null;
}
