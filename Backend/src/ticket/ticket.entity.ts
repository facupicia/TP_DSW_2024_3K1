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

    /* ===================== BUSINESS DATA ===================== */

    @Column({
        type: "enum",
        enum: TicketStatus,
        default: TicketStatus.ACTIVE
    })
    status: TicketStatus;

    @Column({ type: "numeric", precision: 12, scale: 2 })
    purchasePrice: number;

    /* ===================== ACCESS CONTROL ===================== */

    @Column({ type: "timestamp", nullable: true })
    usedAt: Date | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "scannedById" })
    scannedBy: User | null;

    @Column({ nullable: true })
    scannedById: number | null;

    /* ===================== TIMESTAMPS ===================== */

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}
