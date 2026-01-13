import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    BaseEntity,
    ManyToOne,
    JoinColumn,
    Index
} from 'typeorm';
import { User } from '../user/user.entity';
import { SubscriptionPlan } from './subscription_plan.entity';

export enum SubscriptionStatus {
    ACTIVE = 'active',
    EXPIRED = 'expired',
    CANCELLED = 'cancelled',
    PENDING = 'pending'
}

/**
 * Represents a user's subscription to a plan.
 * Every organizer has exactly one active subscription (FREE by default).
 */
@Entity('user_subscription')
@Index(['userId', 'status'])
export class UserSubscription extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    /** The user (organizer) who owns this subscription */
    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    @Index()
    userId: number;

    /** The subscription plan */
    @ManyToOne(() => SubscriptionPlan, { nullable: false, eager: true })
    @JoinColumn({ name: 'planId' })
    plan: SubscriptionPlan;

    @Column()
    planId: number;

    /** Current subscription status */
    @Column({
        type: 'enum',
        enum: SubscriptionStatus,
        default: SubscriptionStatus.ACTIVE
    })
    status: SubscriptionStatus;

    /** When current billing period started */
    @Column({ type: 'timestamp', nullable: true })
    currentPeriodStart: Date | null;

    /** When current billing period ends (null for FREE = never expires) */
    @Column({ type: 'timestamp', nullable: true })
    currentPeriodEnd: Date | null;

    /** External payment reference (for future MP integration) */
    @Column({ type: 'varchar', length: 255, nullable: true })
    externalSubscriptionId: string | null;

    /** Cancellation date if cancelled */
    @Column({ type: 'timestamp', nullable: true })
    cancelledAt: Date | null;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt: Date;
}
