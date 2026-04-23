import { BaseEntity, Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user.entity";

@Entity({ name: "refresh_token" })
export class RefreshToken extends BaseEntity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    @Index({ unique: true })
    tokenHash: string;

    @Column()
    userId: number;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @Column({ type: "timestamp" })
    expiresAt: Date;

    @Column({ type: "timestamp", nullable: true })
    revokedAt: Date | null;

    @Column({ nullable: true })
    replacedByHash: string | null;

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;
}
