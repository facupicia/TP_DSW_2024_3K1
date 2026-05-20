import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, BaseEntity, Unique, OneToMany, ManyToMany, JoinTable, Index } from "typeorm"
import { Event } from '../event/event.entity';
import { Ticket } from "../ticket/ticket.entity";
import { PromoterGroup } from "../promoter/promoter.entity";
import { Role } from "./role.entity";
import { ScannerOrganizerAssignment } from "../scanner/scanner-organizer-assignment.entity";
@Entity()
@Unique(['email'])
@Unique(['mpUserId'])
@Index('idx_user_active_created', ['active', 'createdAt'])
@Index('idx_user_created_at', ['createdAt'])
export class User extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    firstname: string;

    @Column()
    lastname: string;

    @Column({
        default: "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png"
    })
    imgPerfil: string;

    @Column()
    phone: string;

    @Column({ nullable: true })
    address: string;  // Dirección completa (opcional, para compatibilidad)

    @Column({ type: "varchar", length: 100, nullable: true })
    pais: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    provincia: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    ciudad: string;

    @Column({ type: 'date' })
    birth: Date;

    @Column()
    email: string;

    @Column({ select: false })
    password: string;

    /**
     * User roles. Valid values: 'user', 'organizer', 'scanner', 'admin', 'rrpp'
     * A user can have multiple roles simultaneously.
     * Hierarchy: admin > organizer > scanner > rrpp > user
     *
     * - user: Regular user, can buy tickets
     * - organizer: User who has created events, can manage their events
     * - scanner: Can scan/validate tickets
     * - admin: Full system access
     * - rrpp: Promoter/Relaciones Públicas - promotes events for an organizer
     */
    @ManyToMany(() => Role, { eager: false, cascade: true })
    @JoinTable({
        name: 'user_roles',
        joinColumn: { name: 'userId', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' }
    })
    roles: Role[];

    /* ==================== MERCADO PAGO MARKETPLACE ==================== */

    /** MP User ID (collector_id) para recibir pagos de tickets */
    @Column({ type: 'varchar', length: 100, nullable: true })
    @Index('idx_user_mp_user_id')
    mpUserId: string | null;

    /** MP Access Token del organizador (válido 180 días) */
    @Column({ type: 'varchar', length: 500, nullable: true, select: false })
    mpAccessToken: string | null;

    /** MP Refresh Token para renovar access token */
    @Column({ type: 'varchar', length: 500, nullable: true, select: false })
    mpRefreshToken: string | null;

    /** Fecha de expiración del access token */
    @Column({ type: 'timestamptz', nullable: true })
    mpTokenExpiresAt: Date | null;

    /* ================================================================== */

    @Column({
        default: true
    })
    active: boolean;

    @Column({ default: false })
    @Index('idx_user_guest_account')
    isGuestAccount: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    claimedAt: Date | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    @DeleteDateColumn({ type: 'timestamptz', nullable: true })
    deletedAt?: Date;

    @OneToMany(() => Event, evento => evento.user)
    eventos: Event[];

    @OneToMany(() => Ticket, ticket => ticket.user)
    tickets: Ticket[];

    /* ===================== PROMOTER (RRPP) RELATIONS ===================== */

    /** Promoter groups owned by this user (if organizer) */
    @OneToMany(() => PromoterGroup, group => group.organizer)
    promoterGroupsOwned: PromoterGroup[];

    /** Promoter assignments for this user (if rrpp) */
    @OneToMany(() => PromoterGroup, group => group.promoter)
    promoterAssignments: PromoterGroup[];

    /** Events this user can scan tickets for */
    @OneToMany(() => ScannerOrganizerAssignment, assignment => assignment.scanner)
    scannerAssignments: ScannerOrganizerAssignment[];

    /** Scanner team assignments owned by this organizer */
    @OneToMany(() => ScannerOrganizerAssignment, assignment => assignment.organizer)
    scannerAssignmentsOwned: ScannerOrganizerAssignment[];

}
