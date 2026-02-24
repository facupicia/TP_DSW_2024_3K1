import { Request, Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import { PromoterGroup, PromoterEventAssignment } from "./promoter.entity";
import { Ticket } from "../ticket/ticket.entity";
import { Event } from "../event/event.entity";
import AppDataSource from "../db";

/**
 * Get sales statistics for all promoters of an organizer
 * GET /api/promoter/stats
 * Only organizers and admins can access
 */
export const getPromotersStats = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const hasRequiredRole = userRoles.includes('organizer') || userRoles.includes('admin');
        if (!hasRequiredRole) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Acceso denegado" });
        }

        const { eventId, startDate, endDate } = req.query;

        // Build query conditions
        let whereClause = "t.soldByPromoterId IS NOT NULL";
        const parameters: any[] = [];

        if (eventId) {
            whereClause += " AND tt.eventId = ?";
            parameters.push(parseInt(eventId as string));
        } else {
            // Filter by organizer's events if no specific event
            const organizerEvents = await Event.find({
                where: { user_id: organizerId },
                select: ["id"]
            });
            const eventIds = organizerEvents.map(e => e.id);
            if (eventIds.length > 0) {
                whereClause += ` AND tt.eventId IN (${eventIds.map(() => '?').join(',')})`;
                parameters.push(...eventIds);
            }
        }

        if (startDate) {
            whereClause += " AND t.createdAt >= ?";
            parameters.push(new Date(startDate as string));
        }
        if (endDate) {
            whereClause += " AND t.createdAt <= ?";
            parameters.push(new Date(endDate as string));
        }

        // Get statistics grouped by promoter
        const stats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .leftJoin("t.soldByPromoter", "p")
            .leftJoin("pg", "promoter_group", "pg.promoterId = t.soldByPromoterId")
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
            .where(whereClause, parameters)
            .groupBy("t.soldByPromoterId")
            .addGroupBy("p.firstname")
            .addGroupBy("p.lastname")
            .addGroupBy("p.email")
            .addGroupBy("pg.promoterCode")
            .getRawMany();

        return res.status(200).json({
            promoters: stats.map(s => ({
                promoterId: parseInt(s.promoterid),
                firstname: s.firstname,
                lastname: s.lastname,
                email: s.email,
                promoterCode: s.promotercode,
                totalTickets: parseInt(s.totaltickets) || 0,
                totalRevenue: parseFloat(s.totalrevenue) || 0,
                totalCommission: parseFloat(s.totalcommission) || 0,
                avgCommissionRate: parseFloat(s.avgcommissionrate) || 0
            })),
            summary: {
                totalPromoters: stats.length,
                totalTickets: stats.reduce((sum, s) => sum + (parseInt(s.totaltickets) || 0), 0),
                totalRevenue: stats.reduce((sum, s) => sum + (parseFloat(s.totalrevenue) || 0), 0),
                totalCommissions: stats.reduce((sum, s) => sum + (parseFloat(s.totalcommission) || 0), 0)
            }
        });

    } catch (error: any) {
        console.error("Error fetching promoters stats:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Get detailed statistics for a specific promoter
 * GET /api/promoter/:id/stats
 */
export const getPromoterStatsById = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];
        const promoterGroupId = parseInt(req.params.id);

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (isNaN(promoterGroupId)) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { id: promoterGroupId },
            relations: { promoter: true }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Promotor no encontrado" });
        }

        // Only the owner organizer or admin can view
        const isAdmin = userRoles.includes('admin');
        if (promoterGroup.organizerId !== organizerId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso" });
        }

        const { eventId, startDate, endDate } = req.query;

        // Build query conditions
        let whereClause = "t.soldByPromoterId = ?";
        const parameters: any[] = [promoterGroup.promoterId];

        if (eventId) {
            whereClause += " AND tt.eventId = ?";
            parameters.push(parseInt(eventId as string));
        }
        if (startDate) {
            whereClause += " AND t.createdAt >= ?";
            parameters.push(new Date(startDate as string));
        }
        if (endDate) {
            whereClause += " AND t.createdAt <= ?";
            parameters.push(new Date(endDate as string));
        }

        // Get overall statistics
        const overallStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .where(whereClause, parameters)
            .select([
                "COUNT(t.id) as totalTickets",
                "SUM(t.purchasePrice) as totalRevenue",
                "SUM(t.promoterCommissionAmount) as totalCommission",
                "AVG(t.promoterCommissionPercentage) as avgCommissionRate",
                "MIN(t.createdAt) as firstSale",
                "MAX(t.createdAt) as lastSale"
            ])
            .getRawOne();

        // Get statistics by event
        const eventStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .leftJoin("tt.event", "e")
            .where(whereClause, parameters)
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

        // Get recent sales
        const recentSales = await Ticket.find({
            where: { soldByPromoterId: promoterGroup.promoterId },
            relations: ['ticketType', 'ticketType.event'],
            order: { createdAt: "DESC" },
            take: 10
        });

        return res.status(200).json({
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
        });

    } catch (error: any) {
        console.error("Error fetching promoter stats:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Get own statistics (for logged in promoter)
 * GET /api/promoter/stats/me
 */
export const getMyPromoterStats = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (!userRoles.includes("rrpp")) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Solo promotores pueden acceder" });
        }

        const { eventId, startDate, endDate } = req.query;

        // Build query conditions
        let whereClause = "t.soldByPromoterId = ?";
        const parameters: any[] = [userId];

        if (eventId) {
            whereClause += " AND tt.eventId = ?";
            parameters.push(parseInt(eventId as string));
        }
        if (startDate) {
            whereClause += " AND t.createdAt >= ?";
            parameters.push(new Date(startDate as string));
        }
        if (endDate) {
            whereClause += " AND t.createdAt <= ?";
            parameters.push(new Date(endDate as string));
        }

        // Get overall statistics
        const overallStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .where(whereClause, parameters)
            .select([
                "COUNT(t.id) as totalTickets",
                "SUM(t.purchasePrice) as totalRevenue",
                "SUM(t.promoterCommissionAmount) as totalCommission",
                "AVG(t.promoterCommissionPercentage) as avgCommissionRate",
                "MIN(t.createdAt) as firstSale",
                "MAX(t.createdAt) as lastSale"
            ])
            .getRawOne();

        // Get statistics by event
        const eventStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .leftJoin("tt.event", "e")
            .where(whereClause, parameters)
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

        // Get monthly statistics (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .where("t.soldByPromoterId = :userId", { userId })
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

        // Get recent sales
        const recentSales = await Ticket.find({
            where: { soldByPromoterId: userId },
            relations: ['ticketType', 'ticketType.event', 'user'],
            order: { createdAt: "DESC" },
            take: 10
        });

        return res.status(200).json({
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
        });

    } catch (error: any) {
        console.error("Error fetching my promoter stats:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Get statistics for all events with promoter sales
 * GET /api/promoter/stats/events
 */
export const getEventsPromoterStats = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const hasRequiredRole = userRoles.includes('organizer') || userRoles.includes('admin');
        if (!hasRequiredRole) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Acceso denegado" });
        }

        // Get organizer's events with promoter sales
        const eventStats = await AppDataSource.getRepository(Event)
            .createQueryBuilder("e")
            .leftJoin("e.ticketTypes", "tt")
            .leftJoin("tt.tickets", "t")
            .leftJoin("t.soldByPromoter", "p")
            .where("e.user_id = :organizerId", { organizerId })
            .andWhere("t.soldByPromoterId IS NOT NULL")
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

        return res.status(200).json({
            events: eventStats.map(e => ({
                eventId: parseInt(e.eventid),
                eventTitle: e.eventtitle,
                eventDate: e.eventdate,
                activePromoters: parseInt(e.activepromoters) || 0,
                totalPromoterTickets: parseInt(e.totalpromotertickets) || 0,
                totalPromoterRevenue: parseFloat(e.totalpromoterrevenue) || 0,
                totalCommissionsPaid: parseFloat(e.totalcommissionspaid) || 0
            })),
            summary: {
                totalEvents: eventStats.length,
                totalTickets: eventStats.reduce((sum, e) => sum + (parseInt(e.totalpromotertickets) || 0), 0),
                totalRevenue: eventStats.reduce((sum, e) => sum + (parseFloat(e.totalpromoterrevenue) || 0), 0),
                totalCommissions: eventStats.reduce((sum, e) => sum + (parseFloat(e.totalcommissionspaid) || 0), 0)
            }
        });

    } catch (error: any) {
        console.error("Error fetching events promoter stats:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};
