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

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    @Index()
    userId: number;

    @ManyToOne(() => SubscriptionPlan, { nullable: false })
    @JoinColumn({ name: 'planId' })
    plan: SubscriptionPlan;

    @Column()
    planId: number;

    @Column({
        type: 'enum',
        enum: SubscriptionStatus,
        default: SubscriptionStatus.ACTIVE
    })
    @Index('idx_subscription_status')
    status: SubscriptionStatus;

    @Column({ type: 'timestamptz', nullable: true })
    currentPeriodStart: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    currentPeriodEnd: Date | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    externalSubscriptionId: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    @Index('idx_subscription_cancelled_at')
    cancelledAt: Date | null;

    @Column({ 
        type: 'enum', 
        enum: ['monthly', 'yearly'],
        default: 'monthly'
    })
    billingCycle: 'monthly' | 'yearly';

    @CreateDateColumn({ type: 'timestamptz' })
    @Index('idx_subscription_created_at')
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
