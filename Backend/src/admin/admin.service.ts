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
    extrasSold: number;
    extrasRevenue: number;
    totalItemsSold: number;
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
    extrasRevenue: number;
}

export interface ExtrasMetrics {
    extrasSold: number;
    extrasRevenue: number;
    topProducts: Array<{ name: string; category: string; totalSold: number; revenue: number }>;
    revenueByCategory: Array<{ category: string; revenue: number; count: number }>;
    voucherStatus: { active: number; used: number; cancelled: number };
    topOrganizersWithExtras: Array<{ organizerName: string; extrasSold: number; revenue: number }>;
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
    extrasSold: number;
    extrasRevenue: number;
}

export class AdminService {

    /**
     * Get subscription metrics
     */
    async getSubscriptionMetrics(dateRange?: DateRange): Promise<SubscriptionMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();
        const params: any[] = [];

        try {
            // Combined query 1: Active subs by plan + MRR + pro/free counts
            const activeStatsQuery = `
        WITH active_stats AS (
          SELECT 
            sp.name AS "planName",
            sp."displayName" AS "displayName",
            COUNT(*) AS count,
            COALESCE(SUM(
              CASE WHEN sp.name != 'FREE' THEN
                CASE WHEN us."billingCycle" = 'annual' THEN sp."monthlyPrice" / 12.0 ELSE sp."monthlyPrice" END
              ELSE 0 END
            ), 0) AS "planMrr"
          FROM user_subscription us
          INNER JOIN subscription_plan sp ON us."planId" = sp.id
          WHERE us.status = 'active'
          GROUP BY sp.id, sp.name, sp."displayName"
          ORDER BY count DESC
        )
        SELECT *, SUM("planMrr") OVER () AS "totalMrr" FROM active_stats
      `;
            const activeSubs = await queryRunner.query(activeStatsQuery);

            const totalActive = activeSubs.reduce((sum: number, item: any) => sum + parseInt(item.count), 0);
            const mrr = parseFloat(activeSubs[0]?.totalMrr || 0);
            const proUsers = parseInt(activeSubs.find((s: any) => s.planName === 'PRO')?.count || 0);
            const freeUsers = parseInt(activeSubs.find((s: any) => s.planName === 'FREE')?.count || 0);

            // Combined query 2: New, cancelled, startPeriod counts (only when dateRange present)
            let newSubsCount = 0;
            let cancelledCount = 0;
            let churnRate = 0;

            if (dateRange?.startDate && dateRange?.endDate) {
                const dateMetricsQuery = `
          SELECT 
            COUNT(*) FILTER (WHERE "createdAt" >= $1 AND "createdAt" <= $2) AS "newSubs",
            COUNT(*) FILTER (WHERE status = 'cancelled' AND "cancelledAt" >= $1 AND "cancelledAt" <= $2) AS "cancelled",
            COUNT(*) FILTER (WHERE "createdAt" < $1 AND (status != 'cancelled' OR "cancelledAt" >= $1)) AS "startPeriod"
          FROM user_subscription
        `;
                const dateResult = await queryRunner.query(dateMetricsQuery, [dateRange.startDate, dateRange.endDate]);
                newSubsCount = parseInt(dateResult[0]?.newSubs || 0);
                cancelledCount = parseInt(dateResult[0]?.cancelled || 0);
                const startPeriodTotal = parseInt(dateResult[0]?.startPeriod || 0);

                if (startPeriodTotal > 0) {
                    churnRate = (cancelledCount / startPeriodTotal) * 100;
                }
            }

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
                proUsers,
                freeUsers
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
            let dateFilter = `WHERE 1=1`;
            const params: any[] = [];

            if (dateRange?.startDate && dateRange?.endDate) {
                dateFilter = `WHERE "createdAt" >= $1 AND "createdAt" <= $2`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            // Combined query: completed metrics + payment status breakdown
            const metricsQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'completed') AS "totalTransactions",
          COALESCE(SUM(quantity) FILTER (WHERE status = 'completed'), 0) AS "ticketsSold",
          COALESCE(SUM("totalAmount") FILTER (WHERE status = 'completed'), 0) AS "grossRevenue",
          COUNT(*) FILTER (WHERE status = 'completed') AS "successfulPayments",
          COUNT(*) FILTER (WHERE status = 'failed') AS "failedPayments"
        FROM payment_log
        ${dateFilter}
      `;

            // Extras metrics (parallel query)
            let extrasDateFilter = `WHERE status != 'cancelled' AND "deletedAt" IS NULL`;
            const extrasParams: any[] = [];
            if (dateRange?.startDate && dateRange?.endDate) {
                extrasDateFilter += ` AND "createdAt" >= $1 AND "createdAt" <= $2`;
                extrasParams.push(dateRange.startDate, dateRange.endDate);
            }
            const extrasQuery = `
        SELECT 
          COALESCE(SUM(quantity), 0) AS "extrasSold",
          COALESCE(SUM("purchasePrice" * quantity), 0) AS "extrasRevenue"
        FROM extra_item
        ${extrasDateFilter}
      `;

            const [result, extrasResult] = await Promise.all([
                queryRunner.query(metricsQuery, params),
                queryRunner.query(extrasQuery, extrasParams)
            ]);
            const data = result[0];
            const extrasData = extrasResult[0];

            const ticketsSold = parseInt(data?.ticketsSold || 0);
            const grossRevenue = parseFloat(data?.grossRevenue || 0);
            const totalTransactions = parseInt(data?.totalTransactions || 0);
            const averageTicketPrice = ticketsSold > 0 ? grossRevenue / ticketsSold : 0;
            const extrasSold = parseInt(extrasData?.extrasSold || 0);
            const extrasRevenue = parseFloat(extrasData?.extrasRevenue || 0);

            return {
                ticketsSold,
                grossRevenue: parseFloat(grossRevenue.toFixed(2)),
                averageTicketPrice: parseFloat(averageTicketPrice.toFixed(2)),
                totalTransactions,
                successfulPayments: parseInt(data?.successfulPayments || 0),
                failedPayments: parseInt(data?.failedPayments || 0),
                extrasSold,
                extrasRevenue: parseFloat(extrasRevenue.toFixed(2)),
                totalItemsSold: ticketsSold + extrasSold
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

            const limitParam = params.length + 1;

            // Single CTE query: grand totals + top organizers in one round trip
            const query = `
        WITH totals AS (
          SELECT 
            SUM("commissionAmount") AS "grandTotalCommission",
            AVG("commissionPercent") AS "avgCommissionPercent"
          FROM payment_log pl
          ${whereClause}
        ),
        top_orgs AS (
          SELECT 
            pl."organizerId",
            u.firstname || ' ' || u.lastname AS "organizerName",
            SUM(pl."commissionAmount") AS "totalCommission",
            SUM(pl."totalAmount") AS "totalGmv",
            COUNT(*) AS "salesCount"
          FROM payment_log pl
          INNER JOIN "user" u ON pl."organizerId" = u.id
          ${whereClause}
          GROUP BY pl."organizerId", u.firstname, u.lastname
          ORDER BY "totalCommission" DESC
          LIMIT $${limitParam}
        )
        SELECT t.*, org.*
        FROM totals t
        LEFT JOIN top_orgs org ON true
      `;
            const result = await queryRunner.query(query, [...params, limit]);

            const totalCommission = parseFloat(result[0]?.grandTotalCommission || 0);
            const avgCommissionPercent = parseFloat(result[0]?.avgCommissionPercent || 0);

            const topOrganizers = result
                .filter((row: any) => row.organizerId != null)
                .map((org: any) => ({
                    organizerId: org.organizerId,
                    organizerName: org.organizerName,
                    totalCommission: parseFloat(org.totalCommission),
                    totalGmv: parseFloat(org.totalGmv),
                    salesCount: parseInt(org.salesCount)
                }));

            return {
                totalCommission: parseFloat(totalCommission.toFixed(2)),
                commissionByPeriod: parseFloat(totalCommission.toFixed(2)),
                averageCommissionPercent: parseFloat(avgCommissionPercent.toFixed(2)),
                topOrganizers
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
        const params: any[] = [];

        try {
            let newUsersFilter = '0';
            if (dateRange?.startDate && dateRange?.endDate) {
                newUsersFilter = `(SELECT COUNT(*) FROM "user" WHERE "createdAt" >= $1 AND "createdAt" <= $2)`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            const nextParam = () => params.length + 1;

            const query = `
        SELECT 
          (SELECT COUNT(*) FROM "user" WHERE active = true) AS "totalUsers",
          ${newUsersFilter} AS "newUsers",
          (SELECT COUNT(DISTINCT us."userId") FROM user_subscription us INNER JOIN subscription_plan sp ON us."planId" = sp.id WHERE us.status = 'active' AND sp.name != 'FREE') AS "usersWithActiveSubscription",
          (SELECT COUNT(DISTINCT e."user_id") FROM event e INNER JOIN "user" u ON e."user_id" = u.id WHERE e."deletedAt" IS NULL AND u.active = true) AS "activeOrganizers"
      `;

            const result = await queryRunner.query(query, params);
            const data = result[0];

            return {
                totalUsers: parseInt(data?.totalUsers || 0),
                newUsers: parseInt(data?.newUsers || 0),
                usersWithActiveSubscription: parseInt(data?.usersWithActiveSubscription || 0),
                activeOrganizers: parseInt(data?.activeOrganizers || 0)
            };

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get event metrics, optionally filtered by date range (event.createdAt)
     */
    async getEventMetrics(dateRange?: DateRange): Promise<EventMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            let dateClause = '';
            const params: any[] = [];

            if (dateRange?.startDate && dateRange?.endDate) {
                dateClause = ` AND e."createdAt" >= $1 AND e."createdAt" <= $2`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            const nextParam = () => params.length + 1;
            const now = new Date();

            // Combined query: basic counts + upcoming/past split
            const basicQuery = `
        SELECT 
          COUNT(*) AS "totalEvents",
          COUNT(*) FILTER (WHERE e.active = true AND e."deletedAt" IS NULL) AS "activeEvents",
          COUNT(*) FILTER (WHERE e.active = false OR e."deletedAt" IS NOT NULL) AS "inactiveEvents",
          COUNT(*) FILTER (WHERE e.destacado = true AND e.active = true) AS "featuredEvents",
          COUNT(*) FILTER (WHERE e.active = true AND e."deletedAt" IS NULL AND e.date >= $${nextParam()}) AS "upcomingEvents",
          COUNT(*) FILTER (WHERE e.active = true AND e."deletedAt" IS NULL AND e.date < $${nextParam()}) AS "pastEvents"
        FROM event e
        WHERE 1=1 ${dateClause}
      `;
            const basicResult = await queryRunner.query(basicQuery, [...params, now]);
            const basic = basicResult[0];

            // Average capacity utilization (optionally filtered by event creation date)
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
          WHERE e.active = true AND e."deletedAt" IS NULL ${dateClause}
          GROUP BY e.id
        ) AS event_utilization
      `;
            const utilizationResult = await queryRunner.query(utilizationQuery, params);
            const avgUtilization = parseFloat(utilizationResult[0]?.avgUtilization || 0);

            return {
                totalEvents: parseInt(basic.totalEvents || 0),
                activeEvents: parseInt(basic.activeEvents || 0),
                inactiveEvents: parseInt(basic.inactiveEvents || 0),
                featuredEvents: parseInt(basic.featuredEvents || 0),
                upcomingEvents: parseInt(basic.upcomingEvents || 0),
                pastEvents: parseInt(basic.pastEvents || 0),
                averageCapacityUtilization: parseFloat(avgUtilization.toFixed(2))
            };

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get revenue overview (combined metrics) from pre-computed sub-metrics.
     * This avoids re-querying the same data that getOverview already fetches.
     */
    deriveRevenueOverview(
        commissionMetrics: CommissionMetrics,
        marketplaceMetrics: MarketplaceMetrics,
        subscriptionMetrics: SubscriptionMetrics
    ): RevenueOverview {
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
            const safeLast = Number.isFinite(last) ? Math.min(Math.max(Math.floor(last), 1), 365) : 30;
            let truncate = 'day';
            let interval = `${safeLast} days`;

            if (period === 'week') {
                truncate = 'week';
                interval = `${safeLast} weeks`;
            } else if (period === 'month') {
                truncate = 'month';
                interval = `${safeLast} months`;
            }

            const query = `
        SELECT 
          DATE_TRUNC($1, pl."createdAt") AS period,
          SUM(pl."commissionAmount") AS commission,
          SUM(pl."totalAmount") AS gmv,
          COUNT(*) AS transactions
        FROM payment_log pl
        WHERE pl.status = 'completed'
          AND pl."createdAt" >= NOW() - ($2::interval)
        GROUP BY period
        ORDER BY period ASC
      `;

            const extrasQuery = `
        SELECT 
          DATE_TRUNC($1, ei."createdAt") AS period,
          COALESCE(SUM(ei."purchasePrice" * ei.quantity), 0) AS "extrasRevenue"
        FROM extra_item ei
        WHERE ei.status != 'cancelled' AND ei."deletedAt" IS NULL
          AND ei."createdAt" >= NOW() - ($2::interval)
        GROUP BY period
        ORDER BY period ASC
      `;

            const [result, extrasResult] = await Promise.all([
                queryRunner.query(query, [truncate, interval]),
                queryRunner.query(extrasQuery, [truncate, interval])
            ]);

            // Merge extras into main result by period
            const extrasMap = new Map<string, number>();
            extrasResult.forEach((row: any) => {
                extrasMap.set(row.period, parseFloat(row.extrasRevenue || 0));
            });

            return result.map((row: any) => ({
                period: row.period,
                commission: parseFloat(row.commission || 0),
                subscriptions: 0, // TODO: Calculate subscription revenue per period
                gmv: parseFloat(row.gmv || 0),
                transactions: parseInt(row.transactions || 0),
                extrasRevenue: extrasMap.get(row.period) || 0
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
            let dateClause = '';
            const params: any[] = [];

            if (dateRange?.startDate && dateRange?.endDate) {
                dateClause = ` AND pl."createdAt" >= $1 AND pl."createdAt" <= $2`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            // PaymentLog does not have a direct ticketTypeId column.
            // We use ticket -> ticket_type -> event as the bridge.
            // To avoid double-counting payment amounts when one payment_log
            // has multiple tickets, we group by payment_log.id first (event_payments CTE)
            // and then aggregate by event.
            const query = `
        WITH event_payments AS (
          SELECT
            pl.id,
            pl."totalAmount",
            pl."commissionAmount",
            MIN(tt."eventId") AS "eventId"
          FROM payment_log pl
          INNER JOIN ticket t ON t."paymentLogId" = pl.id
          INNER JOIN ticket_type tt ON t."ticketTypeId" = tt.id
          WHERE pl.status = 'completed' ${dateClause}
          GROUP BY pl.id, pl."totalAmount", pl."commissionAmount"
        ),
        event_tickets AS (
          SELECT
            tt."eventId",
            COUNT(t.id) AS "ticketsSold"
          FROM ticket t
          INNER JOIN ticket_type tt ON t."ticketTypeId" = tt.id
          WHERE t."paymentLogId" IS NOT NULL
          GROUP BY tt."eventId"
        )
        SELECT
          e.id AS "eventId",
          e.title AS "eventTitle",
          CONCAT(u.firstname, ' ', u.lastname) AS organizer,
          COALESCE(et."ticketsSold", 0) AS "ticketsSold",
          COALESCE(ep."totalRevenue", 0) AS "totalRevenue",
          COALESCE(ep."platformCommission", 0) AS "platformCommission",
          COALESCE(ee."extrasSold", 0) AS "extrasSold",
          COALESCE(ee."extrasRevenue", 0) AS "extrasRevenue"
        FROM event e
        LEFT JOIN "user" u ON u.id = e."user_id"
        LEFT JOIN (
          SELECT "eventId", SUM("totalAmount") AS "totalRevenue", SUM("commissionAmount") AS "platformCommission"
          FROM event_payments
          GROUP BY "eventId"
        ) ep ON ep."eventId" = e.id
        LEFT JOIN event_tickets et ON et."eventId" = e.id
        LEFT JOIN (
          SELECT ep."eventId", COUNT(ei.id) AS "extrasSold", SUM(ei."purchasePrice" * ei.quantity) AS "extrasRevenue"
          FROM extra_item ei
          INNER JOIN event_product ep ON ei."eventProductId" = ep.id
          WHERE ei.status != 'cancelled' AND ei."deletedAt" IS NULL
          GROUP BY ep."eventId"
        ) ee ON ee."eventId" = e.id
        WHERE ep."eventId" IS NOT NULL
        ORDER BY ep."totalRevenue" DESC
        LIMIT $${params.length + 1}
      `;

            const result = await queryRunner.query(query, [...params, limit]);

            return result.map((row: any) => ({
                eventId: row.eventId,
                eventTitle: row.eventTitle,
                organizer: row.organizer,
                ticketsSold: parseInt(row.ticketsSold),
                totalRevenue: parseFloat(row.totalRevenue),
                platformCommission: parseFloat(row.platformCommission),
                extrasSold: parseInt(row.extrasSold || 0),
                extrasRevenue: parseFloat(row.extrasRevenue || 0)
            }));

        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get extras/vouchers metrics
     */
    async getExtrasMetrics(dateRange?: DateRange): Promise<ExtrasMetrics> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            let dateClause = '';
            const params: any[] = [];

            if (dateRange?.startDate && dateRange?.endDate) {
                dateClause = `AND ei."createdAt" >= $1 AND ei."createdAt" <= $2`;
                params.push(dateRange.startDate, dateRange.endDate);
            }

            const topProductsQuery = `
        SELECT p.name, p.category, COUNT(ei.id) as "totalSold",
          COALESCE(SUM(ei."purchasePrice" * ei.quantity), 0) as revenue
        FROM extra_item ei
        INNER JOIN event_product ep ON ei."eventProductId" = ep.id
        INNER JOIN product p ON ep."productId" = p.id
        WHERE ei.status != 'cancelled' AND ei."deletedAt" IS NULL ${dateClause}
        GROUP BY p.id, p.name, p.category
        ORDER BY "totalSold" DESC
        LIMIT 10
      `;

            const revenueByCategoryQuery = `
        SELECT p.category, COUNT(ei.id) as count,
          COALESCE(SUM(ei."purchasePrice" * ei.quantity), 0) as revenue
        FROM extra_item ei
        INNER JOIN event_product ep ON ei."eventProductId" = ep.id
        INNER JOIN product p ON ep."productId" = p.id
        WHERE ei.status != 'cancelled' AND ei."deletedAt" IS NULL ${dateClause}
        GROUP BY p.category
      `;

            const voucherStatusQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'used') as used,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
        FROM extra_item
        WHERE "deletedAt" IS NULL
      `;

            const topOrganizersQuery = `
        SELECT u.firstname || ' ' || u.lastname as "organizerName",
          COUNT(ei.id) as "extrasSold",
          COALESCE(SUM(ei."purchasePrice" * ei.quantity), 0) as revenue
        FROM extra_item ei
        INNER JOIN event_product ep ON ei."eventProductId" = ep.id
        INNER JOIN event e ON ep."eventId" = e.id
        INNER JOIN "user" u ON e."user_id" = u.id
        WHERE ei.status != 'cancelled' AND ei."deletedAt" IS NULL ${dateClause}
        GROUP BY u.id, u.firstname, u.lastname
        ORDER BY "extrasSold" DESC
        LIMIT 5
      `;

            const totalsQuery = `
        SELECT 
          COALESCE(SUM(quantity), 0) as "extrasSold",
          COALESCE(SUM("purchasePrice" * quantity), 0) as "extrasRevenue"
        FROM extra_item
        WHERE status != 'cancelled' AND "deletedAt" IS NULL
          ${dateClause.replace(/ei\./g, '')}
      `;

            const [topProducts, revenueByCategory, voucherStatus, topOrganizers, totals] = await Promise.all([
                queryRunner.query(topProductsQuery, [...params]),
                queryRunner.query(revenueByCategoryQuery, [...params]),
                queryRunner.query(voucherStatusQuery),
                queryRunner.query(topOrganizersQuery, [...params]),
                queryRunner.query(totalsQuery, [...params])
            ]);

            const totalsData = totals[0] || {};

            return {
                extrasSold: parseInt(totalsData.extrasSold || 0),
                extrasRevenue: parseFloat(totalsData.extrasRevenue || 0),
                topProducts: topProducts.map((p: any) => ({
                    name: p.name,
                    category: p.category,
                    totalSold: parseInt(p.totalSold || 0),
                    revenue: parseFloat(p.revenue || 0)
                })),
                revenueByCategory: revenueByCategory.map((c: any) => ({
                    category: c.category,
                    count: parseInt(c.count || 0),
                    revenue: parseFloat(c.revenue || 0)
                })),
                voucherStatus: {
                    active: parseInt(voucherStatus[0]?.active || 0),
                    used: parseInt(voucherStatus[0]?.used || 0),
                    cancelled: parseInt(voucherStatus[0]?.cancelled || 0)
                },
                topOrganizersWithExtras: topOrganizers.map((o: any) => ({
                    organizerName: o.organizerName,
                    extrasSold: parseInt(o.extrasSold || 0),
                    revenue: parseFloat(o.revenue || 0)
                }))
            };

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
                    extrasMetrics
                ] = await Promise.all([
                    this.getSubscriptionMetrics(dateRange),
                    this.getMarketplaceMetrics(dateRange),
                    this.getCommissionMetrics(dateRange, 5),
                    this.getUserMetrics(dateRange),
                    this.getEventMetrics(dateRange),
                    this.getExtrasMetrics(dateRange)
                ]);

                const revenueOverview = this.deriveRevenueOverview(
                    commissionMetrics,
                    marketplaceMetrics,
                    subscriptionMetrics
                );

                return {
                    revenue: revenueOverview,
                    subscriptions: subscriptionMetrics,
                    marketplace: marketplaceMetrics,
                    commissions: commissionMetrics,
                    users: userMetrics,
                    events: eventMetrics,
                    extras: extrasMetrics,
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
