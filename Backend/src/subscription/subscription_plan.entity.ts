import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    BaseEntity,
    Check
} from 'typeorm';

/**
 * Represents a subscription plan (FREE, PRO, etc.)
 * Plans are stored in DB to allow dynamic configuration without code changes.
 */
@Entity('subscription_plan')
@Check('"monthlyPrice" >= 0')
@Check('"yearlyPrice" >= 0')
@Check('"commissionPercent" >= 0 AND "commissionPercent" <= 100')
@Check('"serviceFeePercent" >= 0 AND "serviceFeePercent" <= 100')
@Check('"minimumServiceFee" >= 0')
@Check('"maxEventsPerMonth" >= -1')
@Check('"maxTicketTypesPerEvent" >= -1')
@Check('"maxProductsInCatalog" >= -1')
export class SubscriptionPlan extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    /** Plan name: 'FREE', 'PRO', etc. */
    @Column({ type: 'varchar', length: 50, unique: true })
    name: string;

    /** Display name for UI */
    @Column({ type: 'varchar', length: 100, nullable: true })
    displayName: string;

    /** Monthly price in ARS (0 for free plan) */
    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    monthlyPrice: number;

    /** Yearly price in ARS (null if not offered) */
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    yearlyPrice: number;

    /** Max events an organizer can create per month (-1 = unlimited) */
    @Column({ default: 3 })
    maxEventsPerMonth: number;

    /** Max ticket types per event (-1 = unlimited) */
    @Column({ default: 1 })
    maxTicketTypesPerEvent: number;

    /** Max products in organizer catalog (-1 = unlimited) */
    @Column({ default: 0 })
    maxProductsInCatalog: number;

    /** Whether this plan allows selling extras/addons at events */
    @Column({ default: false })
    canSellExtras: boolean;

    /** Commission percentage charged on each ticket sale */
    @Column({ type: 'decimal', precision: 5, scale: 2 })
    commissionPercent: number;

    /** Service fee percentage added to the attendee checkout total */
    @Column({ type: 'decimal', precision: 5, scale: 2, default: 15.00 })
    serviceFeePercent: number;

    /** Minimum service fee in ARS when serviceFeePercent is greater than zero */
    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    minimumServiceFee: number;

    /** JSON object with feature flags */
    @Column({ type: 'jsonb', default: {} })
    features: {
        advancedDashboard?: boolean;
        exportSales?: boolean;
        featuredEvents?: boolean;
        prioritySupport?: boolean;
        removeBranding?: boolean;
        customBranding?: boolean;
    };

    /** Whether this plan is available for new subscriptions */
    @Column({ default: true })
    active: boolean;

    /** Sort order for display */
    @Column({ default: 0 })
    sortOrder: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
