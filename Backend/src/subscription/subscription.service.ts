import AppDataSource from "../db";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { SubscriptionPlan } from "./subscription_plan.entity";
import { UserSubscription, SubscriptionStatus } from "./user_subscription.entity";
import { MoreThanOrEqual, LessThanOrEqual, Between } from "typeorm";

/**
 * Get the active subscription for a user.
 * If no subscription exists, creates a FREE subscription automatically.
 */
export const getActiveSubscription = async (userId: number, manager?: any): Promise<UserSubscription> => {
    const subscriptionRepo = manager ? manager.getRepository(UserSubscription) : AppDataSource.getRepository(UserSubscription);

    // Try to find existing active subscription
    let subscription = await subscriptionRepo.findOne({
        where: {
            userId,
            status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
    });

    if (subscription) {
        // Check if subscription has expired (for paid plans)
        if (subscription.currentPeriodEnd && new Date() > subscription.currentPeriodEnd) {
            subscription.status = SubscriptionStatus.EXPIRED;
            await subscriptionRepo.save(subscription);

            // Downgrade to FREE
            subscription = await assignDefaultPlan(userId, manager);
        }
        return subscription;
    }

    // No subscription found, assign FREE plan
    return await assignDefaultPlan(userId, manager);
};

/**
 * Assign the default FREE plan to a user.
 */
export const assignDefaultPlan = async (userId: number, manager?: any): Promise<UserSubscription> => {
    const planRepo = manager ? manager.getRepository(SubscriptionPlan) : AppDataSource.getRepository(SubscriptionPlan);
    const subscriptionRepo = manager ? manager.getRepository(UserSubscription) : AppDataSource.getRepository(UserSubscription);

    // Get FREE plan
    let freePlan = await planRepo.findOne({ where: { name: 'FREE' } });

    if (!freePlan) {
        // Create FREE plan if it doesn't exist (first run)
        freePlan = planRepo.create({
            name: 'FREE',
            displayName: 'Plan Gratuito',
            monthlyPrice: 0,
            maxEventsPerMonth: 3,
            maxTicketTypesPerEvent: 1,
            commissionPercent: 8.00,
            features: {
                advancedDashboard: false,
                exportSales: false,
                featuredEvents: false,
                prioritySupport: false,
                removeBranding: false
            },
            sortOrder: 0
        });
        await planRepo.save(freePlan);
    }

    // Deactivate any existing subscriptions for this user atomically
    await subscriptionRepo.update(
        { userId, status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.EXPIRED }
    );

    // Create new FREE subscription
    const subscription = subscriptionRepo.create({
        userId,
        planId: freePlan.id,
        plan: freePlan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: null // FREE never expires
    });

    await subscriptionRepo.save(subscription);
    return subscription;
};

/**
 * Count events created by user in current calendar month.
 */
export const countEventsThisMonth = async (userId: number, manager?: any): Promise<number> => {
    const eventRepo = manager ? manager.getRepository(Event) : AppDataSource.getRepository(Event);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await eventRepo.count({
        where: {
            user_id: userId,
            createdAt: Between(startOfMonth, endOfMonth),
            active: true
        }
    });

    return count;
};

/**
 * Validate if user can create a new event based on their plan limits.
 * Returns { allowed: boolean, reason?: string, upgradeRequired?: boolean }
 */
export const canCreateEvent = async (userId: number, manager?: any): Promise<{
    allowed: boolean;
    reason?: string;
    upgradeRequired?: boolean;
    currentCount?: number;
    maxAllowed?: number;
}> => {
    const subscription = await getActiveSubscription(userId, manager);
    const plan = subscription.plan;

    // Unlimited events
    if (plan.maxEventsPerMonth === -1) {
        return { allowed: true };
    }

    const eventsThisMonth = await countEventsThisMonth(userId, manager);

    if (eventsThisMonth >= plan.maxEventsPerMonth) {
        return {
            allowed: false,
            reason: `Tu plan ${plan.displayName || plan.name} permite máximo ${plan.maxEventsPerMonth} evento(s) por mes. Ya has creado ${eventsThisMonth}.`,
            upgradeRequired: true,
            currentCount: eventsThisMonth,
            maxAllowed: plan.maxEventsPerMonth
        };
    }

    return {
        allowed: true,
        currentCount: eventsThisMonth,
        maxAllowed: plan.maxEventsPerMonth
    };
};

/**
 * Validate if user can create specified number of ticket types based on their plan.
 */
export const canCreateTicketTypes = async (userId: number, ticketTypesCount: number, manager?: any): Promise<{
    allowed: boolean;
    reason?: string;
    upgradeRequired?: boolean;
    maxAllowed?: number;
}> => {
    const subscription = await getActiveSubscription(userId, manager);
    const plan = subscription.plan;

    // Unlimited ticket types
    if (plan.maxTicketTypesPerEvent === -1) {
        return { allowed: true };
    }

    if (ticketTypesCount > plan.maxTicketTypesPerEvent) {
        return {
            allowed: false,
            reason: `Tu plan ${plan.displayName || plan.name} permite máximo ${plan.maxTicketTypesPerEvent} tipo(s) de entrada por evento.`,
            upgradeRequired: true,
            maxAllowed: plan.maxTicketTypesPerEvent
        };
    }

    return {
        allowed: true,
        maxAllowed: plan.maxTicketTypesPerEvent
    };
};

/**
 * Get subscription limits and current usage for a user.
 */
export const getSubscriptionLimits = async (userId: number): Promise<{
    plan: {
        id: number;
        name: string;
        displayName: string;
        commissionPercent: number;
        features: any;
    };
    limits: {
        maxEventsPerMonth: number;
        maxTicketTypesPerEvent: number;
        eventsCreatedThisMonth: number;
        eventsRemaining: number;
    };
    status: SubscriptionStatus;
    expiresAt: Date | null;
}> => {
    const subscription = await getActiveSubscription(userId);
    const plan = subscription.plan;
    const eventsThisMonth = await countEventsThisMonth(userId);

    return {
        plan: {
            id: plan.id,
            name: plan.name,
            displayName: plan.displayName || plan.name,
            commissionPercent: Number(plan.commissionPercent),
            features: plan.features
        },
        limits: {
            maxEventsPerMonth: plan.maxEventsPerMonth,
            maxTicketTypesPerEvent: plan.maxTicketTypesPerEvent,
            eventsCreatedThisMonth: eventsThisMonth,
            eventsRemaining: plan.maxEventsPerMonth === -1
                ? -1
                : Math.max(0, plan.maxEventsPerMonth - eventsThisMonth)
        },
        status: subscription.status,
        expiresAt: subscription.currentPeriodEnd
    };
};

/**
 * Upgrade a user to a specific plan (admin function).
 * For now, this is manual. Future: integrate with MP for payment.
 */
export const upgradeToPlan = async (
    userId: number,
    planId: number,
    durationMonths: number = 1
): Promise<UserSubscription> => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const planRepo = queryRunner.manager.getRepository(SubscriptionPlan);
        const subscriptionRepo = queryRunner.manager.getRepository(UserSubscription);

        const plan = await planRepo.findOne({ where: { id: planId, active: true } });
        if (!plan) {
            throw new Error('Plan not found or inactive');
        }

        // Deactivate current subscription
        await subscriptionRepo.update(
            { userId, status: SubscriptionStatus.ACTIVE },
            { status: SubscriptionStatus.EXPIRED }
        );

        // Create new subscription with safe date calculation
        const now = new Date();
        const periodEnd = safeAddMonths(now, durationMonths);

        const subscription = subscriptionRepo.create({
            userId,
            planId: plan.id,
            plan,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: now,
            currentPeriodEnd: plan.monthlyPrice > 0 ? periodEnd : null
        });

        await subscriptionRepo.save(subscription);
        await queryRunner.commitTransaction();
        return subscription;
    } catch (error) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        throw error;
    } finally {
        await queryRunner.release();
    }
};

function safeAddMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const day = result.getDate();
    result.setMonth(result.getMonth() + months);
    // If the day overflowed (e.g. Jan 31 + 1 month = Mar 3), clamp to last day of target month
    if (result.getDate() !== day) {
        result.setDate(0);
    }
    return result;
}
