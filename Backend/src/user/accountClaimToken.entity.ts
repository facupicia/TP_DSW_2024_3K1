import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn
} from "typeorm";
import { User } from "./user.entity";

@Entity({ name: "account_claim_token" })
@Index("idx_account_claim_token_user", ["userId"])
@Index("idx_account_claim_token_expires", ["expiresAt"])
export class AccountClaimToken extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column({ unique: true })
    tokenHash: string;

    @Column({ type: "timestamptz" })
    expiresAt: Date;

    @Column({ type: "timestamptz", nullable: true })
    usedAt: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;
}
