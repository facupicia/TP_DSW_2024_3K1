import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    BaseEntity,
    ManyToOne,
    JoinColumn,
    OneToMany
} from "typeorm";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";

/**
 * Entity representing the relationship between an Organizer and their Promoters (RRPP)
 * An organizer can have multiple promoters in their group
 */
@Entity("promoter_group")
export class PromoterGroup extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /* ===================== RELATIONS ===================== */

    /** Organizer (owner) of this promoter group */
    @ManyToOne(() => User, user => user.promoterGroupsOwned, { nullable: false })
    @JoinColumn({ name: "organizerId" })
    organizer: User;

    @Column()
    organizerId: number;

    /** Promoter (RRPP) assigned to this group */
    @ManyToOne(() => User, user => user.promoterAssignments, { nullable: false })
    @JoinColumn({ name: "promoterId" })
    promoter: User;

    @Column()
    promoterId: number;

    /* ===================== BUSINESS DATA ===================== */

    /** Commission percentage the promoter earns per sale (0-100) */
    @Column({ type: "decimal", precision: 5, scale: 2, default: 10.00 })
    commissionPercentage: number;

    /** Custom code for the promoter (for tracking/links) */
    @Column({ type: "varchar", length: 50, nullable: true, unique: true })
    promoterCode: string | null;

    /** Whether this promoter assignment is active */
    @Column({ default: true })
    isActive: boolean;

    /** Optional notes about this promoter */
    @Column({ type: "text", nullable: true })
    notes: string | null;

    /* ===================== RELATIONS ===================== */

    @OneToMany(() => PromoterEventAssignment, assignment => assignment.promoterGroup)
    eventAssignments: PromoterEventAssignment[];

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}

/**
 * Entity representing which events a promoter can sell tickets for
 * Links promoters to specific events with their custom commission
 */
@Entity("promoter_event_assignment")
export class PromoterEventAssignment extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /* ===================== RELATIONS ===================== */

    /** The promoter group relationship */
    @ManyToOne(() => PromoterGroup, group => group.eventAssignments, { nullable: false })
    @JoinColumn({ name: "promoterGroupId" })
    promoterGroup: PromoterGroup;

    @Column()
    promoterGroupId: number;

    /** The event this promoter can sell tickets for */
    @ManyToOne(() => Event, event => event.promoterAssignments, { nullable: false })
    @JoinColumn({ name: "eventId" })
    event: Event;

    @Column()
    eventId: number;

    /* ===================== BUSINESS DATA ===================== */

    /** Custom commission percentage for this specific event (overrides default if set) */
    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    customCommissionPercentage: number | null;

    /** Whether this assignment is active */
    @Column({ default: true })
    isActive: boolean;

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}
