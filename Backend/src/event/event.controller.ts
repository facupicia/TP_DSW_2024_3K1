import { Request, Response } from "express";
import { logger } from "../common/services/logger";
import { CustomRequest } from "../common/middleware/authToken";
import { Event } from "./event.entity";
import { User } from "../user/user.entity";
import PDFDocument from "pdfkit";
import * as eventService from "./event.service";
import { getPagination } from "../common/services/pagination";

class HttpError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function handleServiceError(error: any, res: Response) {
    if (error instanceof HttpError) {
        return res.status(error.status).json({ code: error.code, message: error.message });
    }
    logger.error("EVENT_CONTROLLER_ERROR", { error: error?.message });
    const isDev = process.env.NODE_ENV === 'development';
    return res.status(500).json({ message: isDev ? (error?.message || "Internal server error") : "Internal server error" });
}

// SSE connection limiter (per-user, per-process)
const sseConnections = new Map<number, number>();
const MAX_SSE_PER_USER = 3;

/* ======================================================
   CREATE EVENT
   ====================================================== */
export const createEvent = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ code: 'UNAUTHORIZED', message: "Unauthorized" });

        const result = await eventService.create(userId, req.body);

        const response: any = { ...result.event };
        if (response.ticketTypes) {
            response.ticketTypes = response.ticketTypes.map((tt: any) => {
                const { event: _event, ...clean } = tt;
                return clean;
            });
        }
        if (result.newToken) response.token = result.newToken;

        return res.status(201).json(response);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

/* ======================================================
   UPDATE EVENT
   ====================================================== */
export const updateEvent = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes('admin');
        if (!userId) return res.status(401).json({ code: 'UNAUTHORIZED', message: "Unauthorized" });

        const idNum = Number(req.params.id);
        if (isNaN(idNum) || idNum <= 0) {
            return res.status(400).json({ code: 'INVALID_EVENT_ID', message: "Invalid event id" });
        }

        const updatedEvent = await eventService.update(userId, isAdmin, idNum, req.body);
        return res.json(updatedEvent);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

/* ======================================================
   DELETE EVENT (SOFT LOGIC)
   ====================================================== */
export const deleteEvent = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes('admin');
        if (!userId) return res.status(401).json({ code: 'UNAUTHORIZED', message: "Unauthorized" });

        const idNum = Number(req.params.id);
        if (isNaN(idNum) || idNum <= 0) {
            return res.status(400).json({ code: 'INVALID_EVENT_ID', message: "Invalid event id" });
        }

        await eventService.remove(userId, isAdmin, idNum);
        return res.sendStatus(204);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

/* ======================================================
   GET EVENT
   ====================================================== */
export const getEvent = async (req: Request, res: Response) => {
    try {
        const idNum = Number(req.params.id);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ message: "Invalid event id" });

        const event = await eventService.findById(idNum);
        if (!event) return res.status(404).json({ message: "Event not found" });

        const safeUser = event.user ? { id: event.user.id, firstname: event.user.firstname, lastname: event.user.lastname, imgPerfil: event.user.imgPerfil } : null;
        const checkoutPricing = await eventService.getCheckoutPricing(event.user_id);

        return res.json({ ...event, user: safeUser, checkoutPricing });
    } catch (error) {
        logger.error(error);
        return res.status(500).json({ message: "Error retrieving event" });
    }
};

/* ======================================================
   GET EVENTS (PUBLIC LISTING)
   ====================================================== */
export const getEvents = async (req: Request, res: Response) => {
    try {
        const { skip, take, page, limit } = getPagination(req.query, 50, 200);
        const result = await eventService.findPublic({ skip, take, page, limit });

        res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
        return res.json(result);
    } catch (error) {
        logger.error(error);
        return res.status(500).json({ message: error.message || "Error fetching events" });
    }
};

/* ======================================================
   GET EVENTS COUNT
   ====================================================== */
export const getEventsNumber = async (_req: Request, res: Response) => {
    try {
        const count = await eventService.countActive();
        return res.json({ activeEvents: count });
    } catch (error) {
        logger.error(error);
        return res.status(500).json({ message: "Error fetching events count" });
    }
};

/* ======================================================
   GET EVENT BY NAME
   ====================================================== */
export const getEventByName = async (req: Request, res: Response) => {
    try {
        const rawTitle = req.query.title || req.query.search;
        const { skip, take, page, limit } = getPagination(req.query, 50, 100);
        if (!rawTitle) return res.json({ data: [], total: 0, page, limit, totalPages: 1 });

        const result = await eventService.searchByName(String(rawTitle), { skip, take, page, limit });
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ message: "Error searching events" });
    }
};

/* ======================================================
   GET EVENTS BY USER (ORGANIZER)
   ====================================================== */
export const getEventsByUser = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });
        const { skip, take } = getPagination(req.query, 50, 100);

        const [events, total] = await eventService.findByOrganizer(userId, { skip, take });
        return res.json({ data: events, total });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching user events" });
    }
};

/* ======================================================
   CREATOR STATS
   ====================================================== */
export const getCreatorStats = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const period = (req.query.period as string) || 'month';
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const result = await eventService.getCreatorStats(userId, period);
        return res.json(result);
    } catch (error) {
        logger.error("Error getting creator stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas del creador" });
    }
};

/* ======================================================
   CREATOR STATS COMPARATIVE
   ====================================================== */
export const getCreatorStatsComparative = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const comparative = await eventService.getComparativeStats(userId);
        return res.json({ comparative });
    } catch (error) {
        logger.error("Error getting comparative stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas comparativas" });
    }
};

/* ======================================================
   SSE STREAMING
   ====================================================== */
export const streamCreatorStats = async (req: CustomRequest, res: Response) => {
    let interval: NodeJS.Timeout | null = null;
    let userId: number | undefined;

    try {
        userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const currentCount = sseConnections.get(userId) || 0;
        if (currentCount >= MAX_SSE_PER_USER) {
            return res.status(429).json({ message: "Too many SSE connections. Close other dashboard tabs." });
        }
        sseConnections.set(userId, currentCount + 1);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let currentData = await eventService.getSSEInitialData(userId);
        res.write(`data: ${JSON.stringify({ type: 'initial', data: currentData })}\n\n`);

        interval = setInterval(async () => {
            try {
                const newData = await eventService.getSSEUpdatedData(userId!);
                if (newData.lastSaleAt && (!currentData.lastSaleAt || newData.lastSaleAt > currentData.lastSaleAt)) {
                    currentData = newData;
                    res.write(`data: ${JSON.stringify({ type: 'update', data: newData })}\n\n`);
                }
            } catch (err) {
                logger.error('Error in stats stream:', err);
            }
        }, 30000);

        const cleanup = () => {
            if (interval) { clearInterval(interval); interval = null; }
            if (userId) {
                const count = sseConnections.get(userId) || 0;
                if (count > 1) sseConnections.set(userId, count - 1);
                else sseConnections.delete(userId);
            }
            res.end();
        };

        req.on('close', cleanup);
        req.on('error', cleanup);
        req.on('aborted', cleanup);
    } catch (error) {
        if (interval) clearInterval(interval);
        if (userId) {
            const count = sseConnections.get(userId) || 0;
            if (count > 1) sseConnections.set(userId, count - 1);
            else sseConnections.delete(userId);
        }
        logger.error("Error in stream:", error);
        return res.status(500).json({ message: "Error en streaming de estadísticas" });
    }
};

/* ======================================================
   EXPORT PDF
   ====================================================== */
export const exportCreatorStatsPdf = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const period = (req.query.period as string) || 'all';
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const user = await User.findOne({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: "User not found" });

        const comparative = await eventService.getCreatorStatsData(userId, period);
        const totalRevenue = comparative.reduce((sum, e) => sum + e.revenue, 0);
        const totalTickets = comparative.reduce((sum, e) => sum + e.participants, 0);

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="estadisticas-creador-${period}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('EventLife', 50, 50);
        doc.fontSize(14).font('Helvetica').text('Reporte de Estadísticas del Creador', 50, 80);
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, 50, doc.y);
        doc.text(`Creador: ${user.firstname} ${user.lastname}`, 50, doc.y);
        doc.text(`Período: ${period.toUpperCase()}`, 50, doc.y);
        doc.moveDown(2);

        // Summary
        doc.fontSize(16).font('Helvetica-Bold').text('Resumen General', 50, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
        const summaryY = doc.y;
        doc.rect(50, summaryY, 500, 60).stroke('#cccccc');
        doc.text(`Total de Eventos: ${comparative.length}`, 60, summaryY + 10);
        doc.text(`Ingresos Totales: $${totalRevenue.toLocaleString('es-AR')}`, 60, summaryY + 30);
        doc.text(`Tickets Vendidos: ${totalTickets}`, 300, summaryY + 10);
        doc.text(`Ticket Promedio: $${totalTickets > 0 ? (totalRevenue / totalTickets).toFixed(2) : '0.00'}`, 300, summaryY + 30);
        doc.moveDown(4);

        // Events Table
        if (comparative.length > 0) {
            doc.fontSize(16).font('Helvetica-Bold').text('Detalle por Evento', 50, doc.y);
            doc.moveDown(1);
            const tableTop = doc.y;
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
            doc.rect(50, tableTop, 500, 25).fill('#f0f0f0');
            doc.fillColor('#333333');
            doc.text('Evento', 55, tableTop + 7, { width: 150 });
            doc.text('Fecha', 210, tableTop + 7, { width: 70 });
            doc.text('Tickets', 285, tableTop + 7, { width: 50, align: 'center' });
            doc.text('Ingresos', 340, tableTop + 7, { width: 80, align: 'right' });
            doc.text('Asistencia', 425, tableTop + 7, { width: 60, align: 'right' });
            doc.moveDown(1.5);
            let rowY = doc.y;
            doc.fontSize(8).font('Helvetica');
            comparative.forEach((event, index) => {
                if (index % 2 === 0) doc.rect(50, rowY - 2, 500, 20).fill('#fafafa');
                doc.fillColor('#333333');
                doc.text(event.title.substring(0, 25), 55, rowY, { width: 150 });
                doc.text(new Date(event.date).toLocaleDateString('es-AR'), 210, rowY, { width: 70 });
                doc.text(String(event.participants), 285, rowY, { width: 50, align: 'center' });
                doc.text(`$${event.revenue.toLocaleString('es-AR')}`, 340, rowY, { width: 80, align: 'right' });
                doc.text(`${(event.attendanceRate * 100).toFixed(0)}%`, 425, rowY, { width: 60, align: 'right' });
                rowY += 20;
                if (rowY > 700) { doc.addPage(); rowY = 50; }
            });
            doc.rect(50, tableTop, 500, rowY - tableTop).stroke('#cccccc');
            doc.moveTo(205, tableTop).lineTo(205, rowY).stroke('#cccccc');
            doc.moveTo(280, tableTop).lineTo(280, rowY).stroke('#cccccc');
            doc.moveTo(335, tableTop).lineTo(335, rowY).stroke('#cccccc');
            doc.moveTo(420, tableTop).lineTo(420, rowY).stroke('#cccccc');
        }

        doc.fontSize(8).font('Helvetica').fillColor('#666666');
        doc.text(`Reporte generado por EventLife - ${new Date().toLocaleString('es-AR')}`, 50, 750, { align: 'center', width: 500 });
        doc.end();
    } catch (error) {
        logger.error("Error exporting PDF:", error);
        return res.status(500).json({ message: "Error al generar PDF" });
    }
};

/* ======================================================
   PLATFORM STATS (ADMIN)
   ====================================================== */
export const getPlatformStats = async (req: CustomRequest, res: Response) => {
    try {
        const userRoles = req.user?.roles || [];
        if (!userRoles.includes('admin')) return res.status(403).json({ message: "Admin access required" });

        const period = (req.query.period as string) || 'month';
        const result = await eventService.getPlatformStats(period);
        return res.json(result);
    } catch (error) {
        logger.error("Error getting platform stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas de la plataforma" });
    }
};

/* ======================================================
   EVENT STATS
   ====================================================== */
export const getEventStats = async (req: CustomRequest, res: Response) => {
    try {
        const eventId = parseInt(req.params.id);
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes('admin');

        if (!isAdmin && !userId) return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        if (isNaN(eventId) || eventId <= 0) return res.status(400).json({ message: "ID de evento inválido" });

        const event = await Event.findOne({
            where: isAdmin ? { id: eventId } : { id: eventId, user_id: userId },
            relations: ['ticketTypes']
        });
        if (!event) return res.status(404).json({ message: "Evento no encontrado" });

        const result = await eventService.getEventStats(eventId);
        return res.json(result);
    } catch (error) {
        logger.error("Error getting event stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas" });
    }
};

/* ======================================================
   EXPORT CSV
   ====================================================== */
export const exportCreatorStatsCsv = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const period = (req.query.period as string) || 'all';
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const comparative = await eventService.getCreatorStatsData(userId, period);
        const totalRevenue = comparative.reduce((sum, e) => sum + e.revenue, 0);
        const totalTickets = comparative.reduce((sum, e) => sum + e.participants, 0);

        const headers = ['ID', 'Evento', 'Fecha', 'Categoría', 'Tickets Vendidos', 'Ingresos', 'Tasa de Asistencia'];
        const rows = comparative.map(e => [
            e.eventId,
            `"${e.title.replace(/"/g, '""')}"`,
            new Date(e.date).toISOString().split('T')[0],
            `"${String(e.category).replace(/"/g, '""')}"`,
            e.participants,
            e.revenue.toFixed(2),
            (e.attendanceRate * 100).toFixed(1) + '%'
        ]);
        rows.push(['', '', '', 'TOTAL', totalTickets, totalRevenue.toFixed(2), '']);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="estadisticas-creador-${period}-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send('\uFEFF' + csvContent);
    } catch (error) {
        logger.error("Error exporting CSV:", error);
        return res.status(500).json({ message: "Error al generar CSV" });
    }
};
