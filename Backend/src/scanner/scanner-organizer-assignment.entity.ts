import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn
} from "typeorm";
import { User } from "../user/user.entity";

@Entity("scanner_organizer_assignment")
@Unique("uq_scanner_organizer_assignment", ["organizerId", "scannerId"])
@Index("idx_scanner_organizer_active", ["organizerId", "isActive"])
@Index("idx_scanner_user_active", ["scannerId", "isActive"])
export class ScannerOrganizerAssignment extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, user => user.scannerAssignmentsOwned, { nullable: false })
    @JoinColumn({ name: "organizerId" })
    organizer: User;

    @Column()
    organizerId: number;

    @ManyToOne(() => User, user => user.scannerAssignments, { nullable: false })
    @JoinColumn({ name: "scannerId" })
    scanner: User;

    @Column()
    scannerId: number;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "assignedById" })
    assignedBy: User | null;

    @Column({ nullable: true })
    assignedById: number | null;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}
