import AppDataSource from "../db";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import { PromoterGroup } from "./promoter.entity";
import { Event } from "../event/event.entity";

class HttpError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// ============================================================================
// OVERVIEW STATS
// ============================================================================
export async function getPromotersStats(
    organizerId: number,
    isAdmin: boolean,
    filters: { eventId?: number; startDate?: Date; endDate?: Date }
) {
    const queryBuilder = AppDataSource.getRepository(Ticket)
        .createQueryBuilder("t")
        .leftJoin("t.ticketType", "tt")
        .leftJoin("tt.event", "e")
        .leftJoin("t.soldByPromoter", "p")
        .leftJoin(PromoterGroup, "pg", "pg.promoterId = t.soldByPromoterId AND pg.organizerId = :organizerId", { organizerId })
        .where("t.soldByPromoterId IS NOT NULL")
        .andWhere("t.status != :cancelled", { cancelled: TicketStatus.CANCELLED });

    if (filters.eventId) {
        queryBuilder.andWhere("tt.eventId = :eventId", { eventId: filters.eventId });
        if (!isAdmin) {
            queryBuilder.andWhere("e.user_id = :organizerId", { organizerId });
        }
    } else {
        queryBuilder.andWhere("e.user_id = :organizerId", { organizerId });
    }

    if (filters.startDate) {
        queryBuilder.andWhere("t.createdAt >= :startDate", { startDate: filters.startDate });
    }
    if (filters.endDate) {
        queryBuilder.andWhere("t.createdAt <= :endDate", { endDate: filters.endDate });
    }

    const stats = await queryBuilder
        .select([
            "t.soldByPromoterId as promoterId",
            "p.firstname as firstname",
            "p.lastname as lastname",
            "p.email as email",
            "pg.promoterCode as promoterCode",
            "COUNT(t.id) as totalTickets",
            "SUM(t.purchasePrice) as totalRevenue",
            "SUM(t.promoterCommissionAmount) as totalCommission",
            "AVG(t.promoterCommissionPercentage) as avgCommissionRate"
        ])
        .groupBy("t.soldByPromoterId")
        .addGroupBy("p.firstname")
        .addGroupBy("p.lastname")
        .addGroupBy("p.email")
        .addGroupBy("pg.promoterCode")
        .getRawMany();

    const promoters = stats.map(s => ({
        promoterId: parseInt(s.promoterid),
        firstname: s.firstname,
        lastname: s.lastname,
        email: s.email,
        promoterCode: s.promotercode,
        totalTickets: parseInt(s.totaltickets) || 0,
        totalRevenue: parseFloat(s.totalrevenue) || 0,
        totalCommission: parseFloat(s.totalcommission) || 0,
        avgCommissionRate: parseFloat(s.avgcommissionrate) || 0
    }));

    return {
        promoters,
        summary: {
            totalPromoters: promoters.length,
            totalTickets: promoters.reduce((sum, p) => sum + p.totalTickets, 0),
            totalRevenue: promoters.reduce((sum, p) => sum + p.totalRevenue, 0),
            totalCommissions: promoters.reduce((sum, p) => sum + p.totalCommission, 0)
        }
    };
}

// ============================================================================
// STATS BY ID
// ============================================================================
export async function getPromoterStatsById(
    promoterGroupId: number,
    organizerId: number,
    isAdmin: boolean,
    filters: { eventId?: number; startDate?: Date; endDate?: Date }
) {
    const promoterGroup = await PromoterGroup.findOne({
        where: { id: promoterGroupId },
        relations: { promoter: true }
    });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'Promotor no encontrado');
    }
    if (promoterGroup.organizerId !== organizerId && !isAdmin) {
        throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso');
    }

    const promoterId = promoterGroup.promoterId;

    const queryBuilder = AppDataSource.getRepository(Ticket)
        .createQueryBuilder("t")
        .leftJoin("t.ticketType", "tt")
        .where("t.soldByPromoterId = :promoterId", { promoterId })
        .andWhere("t.status != :cancelled", { cancelled: TicketStatus.CANCELLED });

    if (filters.eventId) {
        queryBuilder.andWhere("tt.eventId = :eventId", { eventId: filters.eventId });
    }
    if (filters.startDate) {
        queryBuilder.andWhere("t.createdAt >= :startDate", { startDate: filters.startDate });
    }
    if (filters.endDate) {
        queryBuilder.andWhere("t.createdAt <= :endDate", { endDate: filters.endDate });
    }

    const overallStats = await queryBuilder.clone()
        .select([
            "COUNT(t.id) as totalTickets",
            "SUM(t.purchasePrice) as totalRevenue",
            "SUM(t.promoterCommissionAmount) as totalCommission",
            "AVG(t.promoterCommissionPercentage) as avgCommissionRate",
            "MIN(t.createdAt) as firstSale",
            "MAX(t.createdAt) as lastSale"
        ])
        .getRawOne();

    const eventStats = await queryBuilder.clone()
        .leftJoin("tt.event", "e")
        .select([
            "e.id as eventId",
            "e.title as eventTitle",
            "e.date as eventDate",
            "COUNT(t.id) as ticketsSold",
            "SUM(t.purchasePrice) as revenue",
            "SUM(t.promoterCommissionAmount) as commission"
        ])
        .groupBy("e.id")
        .addGroupBy("e.title")
        .addGroupBy("e.date")
        .orderBy("e.date", "DESC")
        .getRawMany();

    const recentSales = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder("ticket")
        .leftJoinAndSelect("ticket.ticketType", "ticketType")
        .leftJoinAndSelect("ticketType.event", "event")
        .select([
            "ticket.id",
            "ticket.purchasePrice",
            "ticket.promoterCommissionAmount",
            "ticket.promoterCommissionPercentage",
            "ticket.createdAt",
            "ticket.soldByPromoterId",
            "ticketType.id",
            "ticketType.name",
            "event.id",
            "event.title"
        ])
        .where("ticket.soldByPromoterId = :promoterId", { promoterId })
        .andWhere("ticket.status != :cancelled", { cancelled: TicketStatus.CANCELLED })
        .orderBy("ticket.createdAt", "DESC")
        .take(10)
        .getMany();

    return {
        promoter: {
            id: promoterGroup.id,
            promoterId: promoterGroup.promoterId,
            firstname: promoterGroup.promoter?.firstname,
            lastname: promoterGroup.promoter?.lastname,
            email: promoterGroup.promoter?.email,
            promoterCode: promoterGroup.promoterCode,
            commissionPercentage: promoterGroup.commissionPercentage
        },
        overallStats: {
            totalTickets: parseInt(overallStats?.totaltickets) || 0,
            totalRevenue: parseFloat(overallStats?.totalrevenue) || 0,
            totalCommission: parseFloat(overallStats?.totalcommission) || 0,
            avgCommissionRate: parseFloat(overallStats?.avgcommissionrate) || 0,
            firstSale: overallStats?.firstsale,
            lastSale: overallStats?.lastsale
        },
        eventStats: eventStats.map(e => ({
            eventId: parseInt(e.eventid),
            eventTitle: e.eventtitle,
            eventDate: e.eventdate,
            ticketsSold: parseInt(e.ticketssold) || 0,
            revenue: parseFloat(e.revenue) || 0,
            commission: parseFloat(e.commission) || 0
        })),
        recentSales: recentSales.map(s => ({
            ticketId: s.id,
            eventTitle: s.ticketType?.event?.title,
            ticketTypeName: s.ticketType?.name,
            purchasePrice: s.purchasePrice,
            commissionAmount: s.promoterCommissionAmount,
            commissionPercentage: s.promoterCommissionPercentage,
            soldAt: s.createdAt
        }))
    };
}

// ============================================================================
// MY STATS
// ============================================================================
export async function getMyPromoterStats(
    userId: number,
    filters: { eventId?: number; startDate?: Date; endDate?: Date }
) {
    const queryBuilder = AppDataSource.getRepository(Ticket)
        .createQueryBuilder("t")
        .leftJoin("t.ticketType", "tt")
        .where("t.soldByPromoterId = :userId", { userId })
        .andWhere("t.status != :cancelled", { cancelled: TicketStatus.CANCELLED });

    if (filters.eventId) {
        queryBuilder.andWhere("tt.eventId = :eventId", { eventId: filters.eventId });
    }
    if (filters.startDate) {
        queryBuilder.andWhere("t.createdAt >= :startDate", { startDate: filters.startDate });
    }
    if (filters.endDate) {
        queryBuilder.andWhere("t.createdAt <= :endDate", { endDate: filters.endDate });
    }

    const overallStats = await queryBuilder.clone()
        .select([
            "COUNT(t.id) as totalTickets",
            "SUM(t.purchasePrice) as totalRevenue",
            "SUM(t.promoterCommissionAmount) as totalCommission",
            "AVG(t.promoterCommissionPercentage) as avgCommissionRate",
            "MIN(t.createdAt) as firstSale",
            "MAX(t.createdAt) as lastSale"
        ])
        .getRawOne();

    const eventStats = await queryBuilder.clone()
        .leftJoin("tt.event", "e")
        .select([
            "e.id as eventId",
            "e.title as eventTitle",
            "e.date as eventDate",
            "COUNT(t.id) as ticketsSold",
            "SUM(t.purchasePrice) as revenue",
            "SUM(t.promoterCommissionAmount) as commission"
        ])
        .groupBy("e.id")
        .addGroupBy("e.title")
        .addGroupBy("e.date")
        .orderBy("e.date", "DESC")
        .getRawMany();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder("t")
        .leftJoin("t.ticketType", "tt")
        .where("t.soldByPromoterId = :userId", { userId })
        .andWhere("t.status != :cancelled", { cancelled: TicketStatus.CANCELLED })
        .andWhere("t.createdAt >= :date", { date: sixMonthsAgo })
        .select([
            "DATE_TRUNC('month', t.createdAt) as month",
            "COUNT(t.id) as ticketsSold",
            "SUM(t.purchasePrice) as revenue",
            "SUM(t.promoterCommissionAmount) as commission"
        ])
        .groupBy("DATE_TRUNC('month', t.createdAt)")
        .orderBy("month", "ASC")
        .getRawMany();

    const recentSales = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder("ticket")
        .leftJoinAndSelect("ticket.ticketType", "ticketType")
        .leftJoinAndSelect("ticketType.event", "event")
        .leftJoinAndSelect("ticket.user", "user")
        .select([
            "ticket.id",
            "ticket.purchasePrice",
            "ticket.promoterCommissionAmount",
            "ticket.promoterCommissionPercentage",
            "ticket.createdAt",
            "ticket.soldByPromoterId",
            "ticketType.id",
            "ticketType.name",
            "event.id",
            "event.title",
            "user.id",
            "user.firstname",
            "user.lastname"
        ])
        .where("ticket.soldByPromoterId = :userId", { userId })
        .andWhere("ticket.status != :cancelled", { cancelled: TicketStatus.CANCELLED })
        .orderBy("ticket.createdAt", "DESC")
        .take(10)
        .getMany();

    return {
        overallStats: {
            totalTickets: parseInt(overallStats?.totaltickets) || 0,
            totalRevenue: parseFloat(overallStats?.totalrevenue) || 0,
            totalCommission: parseFloat(overallStats?.totalcommission) || 0,
            avgCommissionRate: parseFloat(overallStats?.avgcommissionrate) || 0,
            firstSale: overallStats?.firstsale,
            lastSale: overallStats?.lastsale
        },
        eventStats: eventStats.map(e => ({
            eventId: parseInt(e.eventid),
            eventTitle: e.eventtitle,
            eventDate: e.eventdate,
            ticketsSold: parseInt(e.ticketssold) || 0,
            revenue: parseFloat(e.revenue) || 0,
            commission: parseFloat(e.commission) || 0
        })),
        monthlyStats: monthlyStats.map(m => ({
            month: m.month,
            ticketsSold: parseInt(m.ticketssold) || 0,
            revenue: parseFloat(m.revenue) || 0,
            commission: parseFloat(m.commission) || 0
        })),
        recentSales: recentSales.map(s => ({
            ticketId: s.id,
            eventTitle: s.ticketType?.event?.title,
            ticketTypeName: s.ticketType?.name,
            buyerName: s.user ? `${s.user.firstname} ${s.user.lastname}` : null,
            purchasePrice: s.purchasePrice,
            commissionAmount: s.promoterCommissionAmount,
            commissionPercentage: s.promoterCommissionPercentage,
            soldAt: s.createdAt
        }))
    };
}

// ============================================================================
// EVENT STATS
// ============================================================================
export async function getEventsPromoterStats(organizerId: number) {
    const eventStats = await AppDataSource.getRepository(Event)
        .createQueryBuilder("e")
        .leftJoin("e.ticketTypes", "tt")
        .leftJoin("tt.tickets", "t")
        .leftJoin("t.soldByPromoter", "p")
        .where("e.user_id = :organizerId", { organizerId })
        .andWhere("t.soldByPromoterId IS NOT NULL")
        .andWhere("t.status != :cancelled", { cancelled: TicketStatus.CANCELLED })
        .select([
            "e.id as eventId",
            "e.title as eventTitle",
            "e.date as eventDate",
            "COUNT(DISTINCT t.soldByPromoterId) as activePromoters",
            "COUNT(t.id) as totalPromoterTickets",
            "SUM(t.purchasePrice) as totalPromoterRevenue",
            "SUM(t.promoterCommissionAmount) as totalCommissionsPaid"
        ])
        .groupBy("e.id")
        .addGroupBy("e.title")
        .addGroupBy("e.date")
        .orderBy("e.date", "DESC")
        .getRawMany();

    const events = eventStats.map(e => ({
        eventId: parseInt(e.eventid),
        eventTitle: e.eventtitle,
        eventDate: e.eventdate,
        activePromoters: parseInt(e.activepromoters) || 0,
        totalPromoterTickets: parseInt(e.totalpromotertickets) || 0,
        totalPromoterRevenue: parseFloat(e.totalpromoterrevenue) || 0,
        totalCommissionsPaid: parseFloat(e.totalcommissionspaid) || 0
    }));

    return {
        events,
        summary: {
            totalEvents: events.length,
            totalTickets: events.reduce((sum, e) => sum + e.totalPromoterTickets, 0),
            totalRevenue: events.reduce((sum, e) => sum + e.totalPromoterRevenue, 0),
            totalCommissions: events.reduce((sum, e) => sum + e.totalCommissionsPaid, 0)
        }
    };
}

// ============================================================================
// EXPORT PDF DATA
// ============================================================================
export async function getPromoterStatsForExport(
    organizerId: number,
    eventId: number
) {
    const event = await Event.findOne({
        where: { id: eventId, user_id: organizerId },
        relations: ['category']
    });
    if (!event) {
        throw new HttpError(404, 'NOT_FOUND', 'Evento no encontrado');
    }

    const stats = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder("t")
        .leftJoin("t.ticketType", "tt")
        .leftJoin("t.soldByPromoter", "p")
        .leftJoin(PromoterGroup, "pg", "pg.promoterId = t.soldByPromoterId AND pg.organizerId = :organizerId", { organizerId })
        .where("t.soldByPromoterId IS NOT NULL")
        .andWhere("tt.eventId = :eventId", { eventId })
        .andWhere("t.status != :cancelled", { cancelled: TicketStatus.CANCELLED })
        .select([
            "t.soldByPromoterId as promoterId",
            "p.firstname as firstname",
            "p.lastname as lastname",
            "p.email as email",
            "pg.promoterCode as promoterCode",
            "COUNT(t.id) as totalTickets",
            "SUM(t.purchasePrice) as totalRevenue",
            "SUM(t.promoterCommissionAmount) as totalCommission",
            "AVG(t.promoterCommissionPercentage) as avgCommissionRate"
        ])
        .groupBy("t.soldByPromoterId")
        .addGroupBy("p.firstname")
        .addGroupBy("p.lastname")
        .addGroupBy("p.email")
        .addGroupBy("pg.promoterCode")
        .getRawMany();

    const promoters = stats.map(s => ({
        promoterId: parseInt(s.promoterid),
        name: `${s.firstname || ''} ${s.lastname || ''}`.trim() || 'Desconocido',
        email: s.email || '-',
        promoterCode: s.promotercode || '-',
        totalTickets: parseInt(s.totaltickets) || 0,
        totalRevenue: parseFloat(s.totalrevenue) || 0,
        totalCommission: parseFloat(s.totalcommission) || 0,
        avgCommissionRate: parseFloat(s.avgcommissionrate) || 0
    }));

    const summary = {
        totalPromoters: promoters.length,
        totalTickets: promoters.reduce((sum, p) => sum + p.totalTickets, 0),
        totalRevenue: promoters.reduce((sum, p) => sum + p.totalRevenue, 0),
        totalCommissions: promoters.reduce((sum, p) => sum + p.totalCommission, 0)
    };

    return { event, promoters, summary };
}
