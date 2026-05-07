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
    @Index('idx_refresh_token_user')
    userId: number;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @Column({ type: "timestamptz" })
    @Index('idx_refresh_token_expires')
    expiresAt: Date;

    @Column({ type: "timestamptz", nullable: true })
    revokedAt: Date | null;

    @Column({ nullable: true })
    @Index('idx_refresh_token_replaced')
    replacedByHash: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;
}
