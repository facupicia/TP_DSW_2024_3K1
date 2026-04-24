import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    BaseEntity,
    ManyToOne,
    JoinColumn,
    Index
} from "typeorm";

import { Event } from "../event/event.entity";

@Entity("coupon")
@Index('idx_coupon_event_created', ['eventId', 'createdAt'])
@Index('idx_coupon_event_code_active', ['eventId', 'code', 'isActive'])
export class Coupon extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    /* ===================== IDENTIFICATION ===================== */

    @Column({ type: "varchar", length: 50, unique: true })
    @Index({ unique: true })
    code: string;

    /* ===================== DISCOUNT CONFIG ===================== */

    @Column({ type: "int" })
    discountPercent: number; // 0-100

    @Column({ type: "int", default: 0 })
    maxUses: number; // 0 = unlimited

    @Column({ type: "int", default: 0 })
    usedCount: number;

    @Column({ type: "timestamp", nullable: true })
    expiresAt: Date | null;

    @Column({ default: true })
    isActive: boolean;

    /* ===================== RELATIONS ===================== */

    @ManyToOne(() => Event, { nullable: false, onDelete: "CASCADE" })
    @JoinColumn({ name: "eventId" })
    event: Event;

    @Column()
    @Index('idx_coupon_event_id')
    eventId: number;

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}
