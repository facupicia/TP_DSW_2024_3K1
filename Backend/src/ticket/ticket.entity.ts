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

import { User } from "../user/user.entity";
import { TicketType } from "../ticketType/ticketType.entity";

export enum TicketStatus {
    ACTIVE = "active",
    USED = "used",
    CANCELLED = "cancelled"
}

@Entity("ticket")
@Index("idx_ticket_user_created", ["userId", "createdAt"])
@Index("idx_ticket_type_created", ["ticketTypeId", "createdAt"])
@Index("idx_ticket_type_status", ["ticketTypeId", "status"])
@Index("idx_ticket_promoter_created", ["soldByPromoterId", "createdAt"])
@Index("idx_ticket_scanner_used", ["scannedById", "usedAt"])
@Index("idx_ticket_status_created", ["status", "createdAt"])
export class Ticket extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    /* ===================== IDENTIFICATION ===================== */

    @Column({ type: "varchar", unique: true })
    @Index({ unique: true })
    codigo_unico: string;

    @Column({ type: "text" })
    qrCode: string;

    /* ===================== RELATIONS ===================== */

    @ManyToOne(() => TicketType, ticketType => ticketType.tickets, {
        nullable: false,
        onDelete: "RESTRICT"
    })
    @JoinColumn({ name: "ticketTypeId" })
    @Index("idx_ticket_ticket_type")
    ticketType: TicketType;

    @Column()
    @Index("idx_ticket_ticket_type_id")
    ticketTypeId: number;

    @ManyToOne(() => User, user => user.tickets, {
        nullable: false,
        onDelete: "RESTRICT"
    })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column()
    @Index("idx_ticket_user_id")
    userId: number;

    /* ===================== BUSINESS DATA ===================== */

    @Column({
        type: "varchar",
        length: 20,
        default: TicketStatus.ACTIVE
    })
    status: TicketStatus;

    @Column({ type: "numeric", precision: 12, scale: 2 })
    purchasePrice: number;

    /* ===================== PROMOTER (RRPP) DATA ===================== */

    /** Promoter who sold this ticket (if applicable) */
    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "soldByPromoterId" })
    @Index("idx_ticket_sold_by_promoter")
    soldByPromoter: User | null;

    @Column({ nullable: true })
    @Index("idx_ticket_sold_by_promoter_id")
    soldByPromoterId: number | null;

    /** Commission percentage applied at the time of sale */
    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    promoterCommissionPercentage: number | null;

    /** Commission amount earned by the promoter */
    @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
    promoterCommissionAmount: number | null;

    /** Promoter code used for this sale */
    @Column({ type: "varchar", length: 50, nullable: true })
    promoterCode: string | null;

    /* ===================== ACCESS CONTROL ===================== */

    @Column({ type: "timestamp", nullable: true })
    usedAt: Date | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "scannedById" })
    @Index("idx_ticket_scanned_by")
    scannedBy: User | null;

    @Column({ nullable: true })
    @Index("idx_ticket_scanned_by_id")
    scannedById: number | null;

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamp" })
    @Index("idx_ticket_created_at")
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}
