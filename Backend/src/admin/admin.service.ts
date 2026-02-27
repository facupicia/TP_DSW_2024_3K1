import AppDataSource from '../config/database';
import { Between, MoreThanOrEqual } from 'typeorm';
import { UserSubscription, SubscriptionStatus } from '../subscription/user_subscription.entity';
import { PaymentLog, PaymentStatus } from '../payment/payment.entity';
import { User } from '../user/user.entity';
import { Event } from '../event/event.entity';
import { getCachedStats, invalidateStatsCache, LONG_TTL } from '../common/services/statsCache';

interface DateRange {
    startDate?: Date;
    endDate?: Date;
}

/**
 * NOTE: Date consistency across entities
 * - PaymentLog.createdAt: When payment was processed (used for revenue/comission metrics)
 * - Ticket.createdAt: When ticket was sold (used for ticket sales metrics)
 * - UserSubscription.createdAt: When subscription started
 * 
 * For marketplace metrics (revenue, commissions), we use PaymentLog.completedAt or createdAt
 * For ticket sales counts, we use Ticket.createdAt
 * This ensures accurate financial reporting even if payment processing is delayed.
 */

export interface SubscriptionMetrics {
    activeSubscriptions: {
        total: number;
        byPlan: Array<{ planName: string; count: number; displayName: string }>;
    };
    newSubscriptions: number;
    cancelledSubscriptions: number;
    churnRate: number;
    mrr: number;
    proUsers: number;
    freeUsers: number;
}

export interface MarketplaceMetrics {
    ticketsSold: number;
    grossRevenue: number;
    averageTicketPrice: number;
    totalTransactions: number;
    successfulPayments: number;
    failedPayments: number;
}

export interface CommissionMetrics {
    totalCommission: number;
    commissionByPeriod: number;
    averageCommissionPercent: number;
    topOrganizers: Array<{
        organizerId: number;
        organizerName: string;
        totalCommission: number;
        totalGmv: number;
        salesCount: number;
    }>;
}

export interface UserMetrics {
    totalUsers: number;
    newUsers: number;
    usersWithActiveSubscription: number;
    activeOrganizers: number;
}

export interface EventMetrics {
    totalEvents: number;
    activeEvents: number;
    inactiveEvents: number;
    featuredEvents: number;
    upcomingEvents: number;
    pastEvents: number;
    averageCapacityUtilization: number;
}

export interface RevenueOverview {
    totalRevenue: number;
    commissionRevenue: number;
    subscriptionRevenue: number;
    gmv: number;
}

export interface TrendDataPoint {
    period: string;
    commission: number;
    subscriptions: number;
    gmv: number;
    transactions: number;
}

export interface OrganizerRanking {
    organizerId: number;
    organizerName: string;
    totalCommission: number;
    totalGmv: number;
    salesCount: number;
}

export interface EventRanking {
    eventId: number;
    eventTitle: string;
    organizer: string;
    ticketsSold: number;
    totalRevenue: number;
    platformCommission: number;
}

export class AdminService {

    /**
     * Get subscription metrics
     */
    async getSubscriptionMetrics(dateRange?: DateRange): Promise<SubscriptionMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Active subscriptions by plan
            const activeSubsQuery = `
        SELECT 
          sp.name AS "planName",
          sp."displayName" AS "displayName",
          COUNT(*) AS count
        FROM user_subscription us
        INNER JOIN subscription_plan sp ON us."planId" = sp.id
        WHERE us.status = 'active'
        GROUP BY sp.id, sp.name, sp."displayName"
        ORDER BY count DESC
      `;
            const activeSubs = await queryRunner.query(activeSubsQuery);

            const totalActive = activeSubs.reduce((sum: number, item: any) => sum + parseInt(item.count), 0);

            // MRR calculation (excluding FREE plan)
            // For annual subscriptions, we divide by 12 to get monthly equivalent
            const mrrQuery = `
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN us."billingCycle" = 'annual' THEN sp."monthlyPrice" / 12.0
              ELSE sp."monthlyPrice"
            END
          ), 0) AS mrr
        FROM user_subscription us
        INNER JOIN subscription_plan sp ON us."planId" = sp.id
        WHERE us.status = 'active'
          AND sp.name != 'FREE'
      `;
            const mrrResult = await queryRunner.query(mrrQuery);
            const mrr = parseFloat(mrrResult[0]?.mrr || 0);

            // New subscriptions in date range
            let newSubsCount = 0;
            if (dateRange?.startDate && dateRange?.endDate) {
                const newSubsQuery = `
          SELECT COUNT(*) AS count
          FROM user_subscription
          WHERE "createdAt" >= $1 AND "createdAt" <= $2
        `;
                const newSubsResult = await queryRunner.query(newSubsQuery, [dateRange.startDate, dateRange.endDate]);
                newSubsCount = parseInt(newSubsResult[0]?.count || 0);
            }

            // Cancelled subscriptions in date range (churn calculation)
            let cancelledCount = 0;
            let churnRate = 0;
            let startPeriodTotal = 0;
            
            if (dateRange?.startDate && dateRange?.endDate) {
                const cancelledQuery = `
          SELECT COUNT(*) AS count
          FROM user_subscription
          WHERE status = 'cancelled'
            AND "cancelledAt" >= $1
            AND "cancelledAt" <= $2
        `;
                const cancelledResult = await queryRunner.query(cancelledQuery, [dateRange.startDate, dateRange.endDate]);
                cancelledCount = parseInt(cancelledResult[0]?.count || 0);

                // Get total subscriptions at START of period for accurate churn calculation
                const startPeriodQuery = `
          SELECT COUNT(*) AS count
          FROM user_subscription
          WHERE "createdAt" < $1
            AND (status != 'cancelled' OR "cancelledAt" >= $1)
        `;
                const startPeriodResult = await queryRunner.query(startPeriodQuery, [dateRange.startDate]);
                startPeriodTotal = parseInt(startPeriodResult[0]?.count || 0);

                // Churn rate calculation: Cancelled / Total at start of period
                if (startPeriodTotal > 0) {
                    churnRate = (cancelledCount / startPeriodTotal) * 100;
                }
            }

            // PRO vs FREE split
            const proUsers = activeSubs.find((s: any) => s.planName === 'PRO')?.count || 0;
            const freeUsers = activeSubs.find((s: any) => s.planName === 'FREE')?.count || 0;

            return {
                activeSubscriptions: {
                    total: totalActive,
                    byPlan: activeSubs.map((s: any) => ({
                        planName: s.planName,
                        displayName: s.displayName,
                        count: parseInt(s.count)
                    }))
                },
                newSubscriptions: newSubsCount,
                cancelledSubscriptions: cancelledCount,
                churnRate: parseFloat(churnRate.toFixed(2)),
                mrr: parseFloat(mrr.toFixed(2)),
                proUsers: parseInt(proUsers),
                freeUsers: parseInt(freeUsers)
            };

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get marketplace/ticket sales metrics
     */
    async getMarketplaceMetrics(dateRange?: DateRange): Promise<MarketplaceMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            let whereClause = `WHERE pl.status = 'completed'`;
            const params: any[] = [];

            if (dateRange?.startDate && dateRange?.endDate) {
                whereClause += ` AND pl."createdAt" >= $1 AND pl."createdAt" <= $2`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            const metricsQuery = `
        SELECT 
          COUNT(*) AS "totalTransactions",
          SUM(pl.quantity) AS "ticketsSold",
          SUM(pl."totalAmount") AS "grossRevenue"
        FROM payment_log pl
        ${whereClause}
      `;

            const result = await queryRunner.query(metricsQuery, params);
            const data = result[0];

            const ticketsSold = parseInt(data?.ticketsSold || 0);
            const grossRevenue = parseFloat(data?.grossRevenue || 0);
            const totalTransactions = parseInt(data?.totalTransactions || 0);
            const averageTicketPrice = ticketsSold > 0 ? grossRevenue / ticketsSold : 0;

            // Count successful vs failed payments
            const statusQuery = `
        SELECT 
          status,
          COUNT(*) AS count
        FROM payment_log
        ${whereClause.replace('pl.', '')}
        GROUP BY status
      `;
            const statusResult = await queryRunner.query(statusQuery, params);

            const successfulPayments = parseInt(statusResult.find((s: any) => s.status === 'completed')?.count || 0);
            const failedPayments = parseInt(statusResult.find((s: any) => s.status === 'failed')?.count || 0);

            return {
                ticketsSold,
                grossRevenue: parseFloat(grossRevenue.toFixed(2)),
                averageTicketPrice: parseFloat(averageTicketPrice.toFixed(2)),
                totalTransactions,
                successfulPayments,
                failedPayments
            };

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get commission metrics (CRITICAL)
     */
    async getCommissionMetrics(dateRange?: DateRange, limit: number = 10): Promise<CommissionMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            let whereClause = `WHERE pl.status = 'completed'`;
            const params: any[] = [];

            if (dateRange?.startDate && dateRange?.endDate) {
                whereClause += ` AND pl."createdAt" >= $1 AND pl."createdAt" <= $2`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            // Total commission
            const totalQuery = `
        SELECT 
          SUM(pl."commissionAmount") AS "totalCommission",
          AVG(pl."commissionPercent") AS "avgCommissionPercent"
        FROM payment_log pl
        ${whereClause}
      `;
            const totalResult = await queryRunner.query(totalQuery, params);
            const totalCommission = parseFloat(totalResult[0]?.totalCommission || 0);
            const avgCommissionPercent = parseFloat(totalResult[0]?.avgCommissionPercent || 0);

            // Top organizers by commission
            const topOrganizersQuery = `
        SELECT 
          pl."organizerId",
          u.firstname || ' ' || u.lastname AS "organizerName",
          SUM(pl."commissionAmount") AS "totalCommission",
          SUM(pl."totalAmount") AS "totalGmv",
          COUNT(*) AS "salesCount"
        FROM payment_log pl
        INNER JOIN "user" u ON pl."organizerId" = u.id
        ${whereClause}
        GROUP BY pl."organizerId", "organizerName"
        ORDER BY "totalCommission" DESC
        LIMIT $${params.length + 1}
      `;
            const topOrganizers = await queryRunner.query(topOrganizersQuery, [...params, limit]);

            return {
                totalCommission: parseFloat(totalCommission.toFixed(2)),
                commissionByPeriod: parseFloat(totalCommission.toFixed(2)),
                averageCommissionPercent: parseFloat(avgCommissionPercent.toFixed(2)),
                topOrganizers: topOrganizers.map((org: any) => ({
                    organizerId: org.organizerId,
                    organizerName: org.organizerName,
                    totalCommission: parseFloat(org.totalCommission),
                    totalGmv: parseFloat(org.totalGmv),
                    salesCount: parseInt(org.salesCount)
                }))
            };

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get user growth metrics
     */
    async getUserMetrics(dateRange?: DateRange): Promise<UserMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Total users
            const totalUsersResult = await queryRunner.query(`SELECT COUNT(*) AS count FROM "user" WHERE active = true`);
            const totalUsers = parseInt(totalUsersResult[0]?.count || 0);

            // New users in date range
            let newUsers = 0;
            if (dateRange?.startDate && dateRange?.endDate) {
                const newUsersResult = await queryRunner.query(
                    `SELECT COUNT(*) AS count FROM "user" WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
                    [dateRange.startDate, dateRange.endDate]
                );
                newUsers = parseInt(newUsersResult[0]?.count || 0);
            }

            // Users with active subscription (non-FREE)
            const activeSubsResult = await queryRunner.query(`
        SELECT COUNT(DISTINCT us."userId") AS count
        FROM user_subscription us
        INNER JOIN subscription_plan sp ON us."planId" = sp.id
        WHERE us.status = 'active' AND sp.name != 'FREE'
      `);
            const usersWithActiveSubscription = parseInt(activeSubsResult[0]?.count || 0);

            // Active organizers (users who have created events)
            const activeOrganizersResult = await queryRunner.query(`
        SELECT COUNT(DISTINCT "user_id") AS count
        FROM event
        WHERE "deletedAt" IS NULL
      `);
            const activeOrganizers = parseInt(activeOrganizersResult[0]?.count || 0);

            return {
                totalUsers,
                newUsers,
                usersWithActiveSubscription,
                activeOrganizers
            };

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get event metrics
     */
    async getEventMetrics(): Promise<EventMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Basic event counts
            const basicQuery = `
        SELECT 
          COUNT(*) AS "totalEvents",
          COUNT(*) FILTER (WHERE active = true AND "deletedAt" IS NULL) AS "activeEvents",
          COUNT(*) FILTER (WHERE active = false OR "deletedAt" IS NOT NULL) AS "inactiveEvents",
          COUNT(*) FILTER (WHERE destacado = true AND active = true) AS "featuredEvents"
        FROM event
      `;
            const basicResult = await queryRunner.query(basicQuery);
            const basic = basicResult[0];

            // Upcoming vs past events
            const now = new Date();
            const dateQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE date >= $1) AS "upcomingEvents",
          COUNT(*) FILTER (WHERE date < $1) AS "pastEvents"
        FROM event
        WHERE active = true AND "deletedAt" IS NULL
      `;
            const dateResult = await queryRunner.query(dateQuery, [now]);
            const dates = dateResult[0];

            // Average capacity utilization
            const utilizationQuery = `
        SELECT 
          AVG(utilization) AS "avgUtilization"
        FROM (
          SELECT 
            CASE 
              WHEN SUM(tt.capacity) > 0 
              THEN (SUM(tt."soldCount")::DECIMAL / SUM(tt.capacity)) * 100
              ELSE 0
            END AS utilization
          FROM event e
          INNER JOIN ticket_type tt ON e.id = tt."eventId"
          WHERE e.active = true AND e."deletedAt" IS NULL
          GROUP BY e.id
        ) AS event_utilization
      `;
            const utilizationResult = await queryRunner.query(utilizationQuery);
            const avgUtilization = parseFloat(utilizationResult[0]?.avgUtilization || 0);

            return {
                totalEvents: parseInt(basic.totalEvents || 0),
                activeEvents: parseInt(basic.activeEvents || 0),
                inactiveEvents: parseInt(basic.inactiveEvents || 0),
                featuredEvents: parseInt(basic.featuredEvents || 0),
                upcomingEvents: parseInt(dates.upcomingEvents || 0),
                pastEvents: parseInt(dates.pastEvents || 0),
                averageCapacityUtilization: parseFloat(avgUtilization.toFixed(2))
            };

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get revenue overview (combined metrics)
     */
    async getRevenueOverview(dateRange?: DateRange): Promise<RevenueOverview> {
        const [commissionMetrics, marketplaceMetrics, subscriptionMetrics] = await Promise.all([
            this.getCommissionMetrics(dateRange),
            this.getMarketplaceMetrics(dateRange),
            this.getSubscriptionMetrics(dateRange)
        ]);

        const commissionRevenue = commissionMetrics.totalCommission;
        const subscriptionRevenue = subscriptionMetrics.mrr;
        const gmv = marketplaceMetrics.grossRevenue;
        const totalRevenue = commissionRevenue + subscriptionRevenue;

        return {
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            commissionRevenue: parseFloat(commissionRevenue.toFixed(2)),
            subscriptionRevenue: parseFloat(subscriptionRevenue.toFixed(2)),
            gmv: parseFloat(gmv.toFixed(2))
        };
    }

    /**
     * Get revenue trend data for charts
     */
    async getRevenueTrendData(period: 'day' | 'week' | 'month', last: number): Promise<TrendDataPoint[]> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            let truncate = 'day';
            let interval = `${last} days`;

            if (period === 'week') {
                truncate = 'week';
                interval = `${last} weeks`;
            } else if (period === 'month') {
                truncate = 'month';
                interval = `${last} months`;
            }

            const query = `
        SELECT 
          DATE_TRUNC('${truncate}', pl."createdAt") AS period,
          SUM(pl."commissionAmount") AS commission,
          SUM(pl."totalAmount") AS gmv,
          COUNT(*) AS transactions
        FROM payment_log pl
        WHERE pl.status = 'completed'
          AND pl."createdAt" >= NOW() - INTERVAL '${interval}'
        GROUP BY period
        ORDER BY period ASC
      `;

            const result = await queryRunner.query(query);

            return result.map((row: any) => ({
                period: row.period,
                commission: parseFloat(row.commission || 0),
                subscriptions: 0, // TODO: Calculate subscription revenue per period
                gmv: parseFloat(row.gmv || 0),
                transactions: parseInt(row.transactions || 0)
            }));

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get top events by revenue
     */
    async getTopEvents(limit: number = 10, dateRange?: DateRange): Promise<EventRanking[]> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            let whereClause = `WHERE pl.status = 'completed'`;
            const params: any[] = [];

            if (dateRange?.startDate && dateRange?.endDate) {
                whereClause += ` AND pl."createdAt" >= $1 AND pl."createdAt" <= $2`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            const query = `
        SELECT 
          e.id AS "eventId",
          e.title AS "eventTitle",
          e.organizer,
          COUNT(pl.id) AS "ticketsSold",
          SUM(pl."totalAmount") AS "totalRevenue",
          SUM(pl."commissionAmount") AS "platformCommission"
        FROM payment_log pl
        INNER JOIN ticket_type tt ON pl."ticketTypeId" = tt.id
        INNER JOIN event e ON tt."eventId" = e.id
        ${whereClause}
        GROUP BY e.id, e.title, e.organizer
        ORDER BY "totalRevenue" DESC
        LIMIT $${params.length + 1}
      `;

            const result = await queryRunner.query(query, [...params, limit]);

            return result.map((row: any) => ({
                eventId: row.eventId,
                eventTitle: row.eventTitle,
                organizer: row.organizer,
                ticketsSold: parseInt(row.ticketsSold),
                totalRevenue: parseFloat(row.totalRevenue),
                platformCommission: parseFloat(row.platformCommission)
            }));

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get comprehensive overview for dashboard (with caching)
     */
    async getOverview(dateRange?: DateRange) {
        const cacheKey = {
            start: dateRange?.startDate?.toISOString() || 'all',
            end: dateRange?.endDate?.toISOString() || 'all'
        };

        return getCachedStats(
            'overview',
            cacheKey,
            async () => {
                const [
                    subscriptionMetrics,
                    marketplaceMetrics,
                    commissionMetrics,
                    userMetrics,
                    eventMetrics,
                    revenueOverview
                ] = await Promise.all([
                    this.getSubscriptionMetrics(dateRange),
                    this.getMarketplaceMetrics(dateRange),
                    this.getCommissionMetrics(dateRange, 5),
                    this.getUserMetrics(dateRange),
                    this.getEventMetrics(),
                    this.getRevenueOverview(dateRange)
                ]);

                return {
                    revenue: revenueOverview,
                    subscriptions: subscriptionMetrics,
                    marketplace: marketplaceMetrics,
                    commissions: commissionMetrics,
                    users: userMetrics,
                    events: eventMetrics,
                    period: dateRange || { startDate: null, endDate: null }
                };
            },
            LONG_TTL
        );
    }

    /**
     * Invalidate all admin stats cache
     * Call this when data changes (new payments, subscriptions, etc.)
     */
    async invalidateCache(): Promise<void> {
        await invalidateStatsCache('');
    }
}
