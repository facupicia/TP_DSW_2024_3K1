import { Request, Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import { PromoterGroup, PromoterEventAssignment } from "./promoter.entity";
import { Ticket } from "../ticket/ticket.entity";
import { Event } from "../event/event.entity";
import AppDataSource from "../db";
import PDFDocument from "pdfkit";

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

        // Build query using QueryBuilder with named parameters
        const queryBuilder = AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .leftJoin("t.soldByPromoter", "p")
            .leftJoin(PromoterGroup, "pg", "pg.promoterId = t.soldByPromoterId AND pg.organizerId = :organizerId", { organizerId })
            .where("t.soldByPromoterId IS NOT NULL");

        if (eventId) {
            queryBuilder.andWhere("tt.eventId = :eventId", { eventId: parseInt(eventId as string) });
        } else {
            // Filter by organizer's events if no specific event
            const organizerEvents = await Event.find({
                where: { user_id: organizerId },
                select: ["id"]
            });
            const eventIds = organizerEvents.map(e => e.id);
            if (eventIds.length > 0) {
                queryBuilder.andWhere("tt.eventId IN (:...eventIds)", { eventIds });
            }
        }

        if (startDate) {
            queryBuilder.andWhere("t.createdAt >= :startDate", { startDate: new Date(startDate as string) });
        }
        if (endDate) {
            queryBuilder.andWhere("t.createdAt <= :endDate", { endDate: new Date(endDate as string) });
        }

        // Get statistics grouped by promoter
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
        const promoterId = promoterGroup.promoterId;

        // Build query using QueryBuilder with named parameters
        const queryBuilder = AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .where("t.soldByPromoterId = :promoterId", { promoterId });

        if (eventId) {
            queryBuilder.andWhere("tt.eventId = :eventId", { eventId: parseInt(eventId as string) });
        }
        if (startDate) {
            queryBuilder.andWhere("t.createdAt >= :startDate", { startDate: new Date(startDate as string) });
        }
        if (endDate) {
            queryBuilder.andWhere("t.createdAt <= :endDate", { endDate: new Date(endDate as string) });
        }

        // Get overall statistics
        const overallStats = await queryBuilder
            .clone()
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
        const eventStats = await queryBuilder
            .clone()
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

        // Build query using QueryBuilder with named parameters
        const queryBuilder = AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .where("t.soldByPromoterId = :userId", { userId });

        if (eventId) {
            queryBuilder.andWhere("tt.eventId = :eventId", { eventId: parseInt(eventId as string) });
        }
        if (startDate) {
            queryBuilder.andWhere("t.createdAt >= :startDate", { startDate: new Date(startDate as string) });
        }
        if (endDate) {
            queryBuilder.andWhere("t.createdAt <= :endDate", { endDate: new Date(endDate as string) });
        }

        // Get overall statistics
        const overallStats = await queryBuilder
            .clone()
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
        const eventStats = await queryBuilder
            .clone()
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

/**
 * Export promoter statistics for a specific event to PDF
 * GET /api/promoter/stats/export/:eventId
 */
export const exportPromotersStatsPdf = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];
        const eventId = parseInt(req.params.eventId);

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const hasRequiredRole = userRoles.includes('organizer') || userRoles.includes('admin');
        if (!hasRequiredRole) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Acceso denegado" });
        }

        if (isNaN(eventId)) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de evento inválido" });
        }

        // Verify event belongs to organizer
        const event = await Event.findOne({
            where: { id: eventId, user_id: organizerId },
            relations: ['category']
        });

        if (!event) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Evento no encontrado" });
        }

        // Get promoter stats for this event
        const stats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder("t")
            .leftJoin("t.ticketType", "tt")
            .leftJoin("t.soldByPromoter", "p")
            .leftJoin(PromoterGroup, "pg", "pg.promoterId = t.soldByPromoterId AND pg.organizerId = :organizerId", { organizerId })
            .where("t.soldByPromoterId IS NOT NULL")
            .andWhere("tt.eventId = :eventId", { eventId })
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

        // Format data
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

        // Generate PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="estadisticas-rrpp-${eventId}.pdf"`);
        
        // Pipe PDF to response
        doc.pipe(res);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('EventLife', 50, 50);
        doc.fontSize(12).font('Helvetica').text('Reporte de Estadísticas de Promotores', 50, 80);
        doc.moveDown(2);

        // Event Info
        doc.fontSize(16).font('Helvetica-Bold').text('Información del Evento', 50, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');
        doc.text(`Título: ${event.title}`);
        doc.text(`Fecha: ${new Date(event.date).toLocaleDateString('es-AR')}`);
        doc.text(`Ubicación: ${event.ciudad || event.direccion || 'No especificada'}`);
        doc.text(`Categoría: ${event.category?.name || 'No especificada'}`);
        doc.moveDown(1.5);

        // Summary Box
        doc.fontSize(16).font('Helvetica-Bold').text('Resumen General', 50, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
        
        const summaryY = doc.y;
        doc.rect(50, summaryY, 500, 80).stroke('#cccccc');
        doc.text(`Total de Promotores: ${summary.totalPromoters}`, 60, summaryY + 10);
        doc.text(`Total de Tickets Vendidos: ${summary.totalTickets}`, 60, summaryY + 30);
        doc.text(`Ingresos Totales: $${summary.totalRevenue.toFixed(2)}`, 60, summaryY + 50);
        doc.text(`Comisiones Totales: $${summary.totalCommissions.toFixed(2)}`, 300, summaryY + 50);
        doc.moveDown(5);

        // Promoters Table
        if (promoters.length > 0) {
            doc.fontSize(16).font('Helvetica-Bold').text('Detalle por Promotor', 50, doc.y);
            doc.moveDown(1);

            // Table header
            const tableTop = doc.y;
            doc.fontSize(10).font('Helvetica-Bold');
            doc.fillColor('#333333');
            
            // Header background
            doc.rect(50, tableTop, 500, 20).fill('#f0f0f0');
            doc.fillColor('#333333');
            
            // Header columns
            doc.text('Promotor', 55, tableTop + 5, { width: 120 });
            doc.text('Código', 180, tableTop + 5, { width: 80 });
            doc.text('Tickets', 265, tableTop + 5, { width: 50, align: 'center' });
            doc.text('Ingresos', 320, tableTop + 5, { width: 80, align: 'right' });
            doc.text('Comisión', 405, tableTop + 5, { width: 70, align: 'right' });
            doc.text('% Com.', 480, tableTop + 5, { width: 60, align: 'right' });
            
            doc.moveDown(1);
            
            // Table rows
            let rowY = doc.y;
            doc.fontSize(9).font('Helvetica');
            
            promoters.forEach((promoter, index) => {
                // Alternate row background
                if (index % 2 === 0) {
                    doc.rect(50, rowY - 2, 500, 18).fill('#fafafa');
                }
                
                doc.fillColor('#333333');
                doc.text(promoter.name.substring(0, 20), 55, rowY, { width: 120 });
                doc.text(promoter.promoterCode, 180, rowY, { width: 80 });
                doc.text(String(promoter.totalTickets), 265, rowY, { width: 50, align: 'center' });
                doc.text(`$${promoter.totalRevenue.toFixed(2)}`, 320, rowY, { width: 80, align: 'right' });
                doc.text(`$${promoter.totalCommission.toFixed(2)}`, 405, rowY, { width: 70, align: 'right' });
                doc.text(`${promoter.avgCommissionRate.toFixed(1)}%`, 480, rowY, { width: 60, align: 'right' });
                
                rowY += 18;
                
                // Add new page if needed
                if (rowY > 700) {
                    doc.addPage();
                    rowY = 50;
                }
            });

            // Table border
            doc.rect(50, tableTop, 500, rowY - tableTop).stroke('#cccccc');
            
            // Vertical lines
            doc.moveTo(175, tableTop).lineTo(175, rowY).stroke('#cccccc');
            doc.moveTo(260, tableTop).lineTo(260, rowY).stroke('#cccccc');
            doc.moveTo(315, tableTop).lineTo(315, rowY).stroke('#cccccc');
            doc.moveTo(400, tableTop).lineTo(400, rowY).stroke('#cccccc');
            doc.moveTo(475, tableTop).lineTo(475, rowY).stroke('#cccccc');
        } else {
            doc.fontSize(12).font('Helvetica-Oblique').text('No hay ventas de promotores registradas para este evento.', 50, doc.y);
        }

        // Footer
        doc.fontSize(9).font('Helvetica');
        doc.fillColor('#666666');
        doc.text(
            `Reporte generado el ${new Date().toLocaleDateString('es-AR')} a las ${new Date().toLocaleTimeString('es-AR')}`,
            50,
            750,
            { align: 'center', width: 500 }
        );

        // Finalize PDF
        doc.end();

    } catch (error: any) {
        console.error("Error exporting promoters stats PDF:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};
