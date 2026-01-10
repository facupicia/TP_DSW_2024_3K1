import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    BaseEntity,
    OneToMany,
    ManyToOne,
    JoinColumn,
    Index
} from "typeorm";

import { TicketType } from "../ticketType/ticketType.entity";
import { User } from "../user/user.entity";
import { Category } from "../category/category.entity";

@Entity("event")
export class Event extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar", length: 255 })
    title: string;

    @Column({ type: "varchar", length: 255 })
    location: string;

    @Column({ type: "varchar", length: 255 })
    organizer: string;

    @Column({ type: "varchar", nullable: true })
    image: string;

    @Column({ type: "date" })
    @Index()
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
    minAge: number; // 0 = sin restricción, 18 = +18, 21 = +21, etc.

    /* ===================== RELATIONS ===================== */

    @ManyToOne(() => User, user => user.eventos, { nullable: false })
    @JoinColumn({ name: "user_id" })
    user: User;

    @Column()
    user_id: number;

    @ManyToOne(() => Category, category => category.events, { nullable: false })
    @JoinColumn({ name: "categoryId" })
    category: Category;

    @Column()
    categoryId: number;

    @OneToMany(() => TicketType, ticketType => ticketType.event, {
        cascade: true
    })
    ticketTypes: TicketType[];

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}
