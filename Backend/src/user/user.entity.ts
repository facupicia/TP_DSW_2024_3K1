import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, BaseEntity, Unique, OneToMany, JoinColumn } from "typeorm"
import { Event } from '../event/event.entity';
import { Ticket } from "../ticket/ticket.entity";
@Entity()
@Unique(['email'])
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
     * User role. Valid values: 'user', 'organizer', 'scanner', 'admin'
     * - user: Regular user, can buy tickets
     * - organizer: User who has created events, can manage their events
     * - scanner: Can scan/validate tickets
     * - admin: Full system access
     */
    @Column({
        default: "user"
    })
    rol: string;

    @Column({
        default: true
    })
    active: boolean;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt: Date;

    @OneToMany(() => Event, evento => evento.user)
    eventos: Event[];

    @OneToMany(() => Ticket, ticket => ticket.user)
    tickets: Ticket[];

}
