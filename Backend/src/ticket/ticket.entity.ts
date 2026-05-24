import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    BaseEntity,
    ManyToOne,
    JoinColumn,
    Index,
    Check
} from "typeorm";

import { User } from "../user/user.entity";
import { TicketType } from "../ticketType/ticketType.entity";
import { PaymentLog } from "../payment/payment.entity";

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
@Check('"purchasePrice" >= 0')
@Check('"promoterCommissionPercentage" IS NULL OR ("promoterCommissionPercentage" >= 0 AND "promoterCommissionPercentage" <= 100)')
@Check('"promoterCommissionAmount" IS NULL OR "promoterCommissionAmount" >= 0')
@Check('"status" IN (\'active\', \'used\', \'cancelled\')')
export class Ticket extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    /* ===================== IDENTIFICATION ===================== */

    @Column({ type: "varchar", unique: true })
    codigo_unico: string;

    @Column({ type: "text" })
    qrCode: string;

    /* ===================== RELATIONS ===================== */

    @ManyToOne(() => TicketType, ticketType => ticketType.tickets, {
        nullable: false,
        onDelete: "RESTRICT"
    })
    @JoinColumn({ name: "ticketTypeId" })
    ticketType: TicketType;

    @Column()
    ticketTypeId: number;

    @ManyToOne(() => User, user => user.tickets, {
        nullable: false,
        onDelete: "RESTRICT"
    })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column()
    userId: number;

    @ManyToOne(() => PaymentLog, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "paymentLogId" })
    paymentLog: PaymentLog | null;

    @Column({ nullable: true })
    paymentLogId: number | null;

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
    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "soldByPromoterId" })
    soldByPromoter: User | null;

    @Column({ nullable: true })
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

    @Column({ type: "timestamptz", nullable: true })
    usedAt: Date | null;

    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "scannedById" })
    scannedBy: User | null;

    @Column({ nullable: true })
    scannedById: number | null;

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;

    @DeleteDateColumn({ type: "timestamptz", nullable: true })
    deletedAt: Date | null;
}
