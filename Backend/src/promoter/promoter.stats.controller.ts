import { Request, Response } from "express";
import { logger } from "../common/services/logger";
import { CustomRequest } from "../common/middleware/authToken";
import PDFDocument from "pdfkit";
import {
    getPromotersStats as getPromotersStatsSvc,
    getPromoterStatsById as getPromoterStatsByIdSvc,
    getMyPromoterStats as getMyPromoterStatsSvc,
    getEventsPromoterStats as getEventsPromoterStatsSvc,
    getPromoterStatsForExport
} from "./promoter.stats.service";

function handleServiceError(error: any, res: Response) {
    const status = error.status || 500;
    const code = error.code || "INTERNAL_ERROR";
    const isDev = process.env.NODE_ENV === 'development';
    const message = (status >= 500 && !isDev) ? "Error interno del servidor" : (error.message || "Error interno del servidor");
    if (status >= 500) {
        logger.error("Promoter stats service error:", error);
    }
    return res.status(status).json({ code, message });
}

function checkOrganizerAuth(req: CustomRequest): { organizerId: number; isAdmin: boolean } | null {
    const organizerId = req.user?.id;
    const userRoles = req.user?.roles || [];
    if (!organizerId) return null;
    const isAdmin = userRoles.includes('admin');
    const hasRequiredRole = userRoles.includes('organizer') || isAdmin;
    if (!hasRequiredRole) return null;
    return { organizerId, isAdmin };
}

function checkPromoterAuth(req: CustomRequest): number | null {
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [];
    if (!userId || !userRoles.includes('rrpp')) return null;
    return userId;
}

function parseDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? undefined : d;
}

// ============================================================================
// OVERVIEW STATS
// ============================================================================
export const getPromotersStats = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    try {
        const { eventId, startDate, endDate } = req.query;
        const result = await getPromotersStatsSvc(auth.organizerId, auth.isAdmin, {
            eventId: eventId ? parseInt(eventId as string) : undefined,
            startDate: parseDate(startDate),
            endDate: parseDate(endDate)
        });
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// STATS BY ID
// ============================================================================
export const getPromoterStatsById = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const promoterGroupId = parseInt(req.params.id);
    if (isNaN(promoterGroupId)) {
        return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
    }

    try {
        const { eventId, startDate, endDate } = req.query;
        const result = await getPromoterStatsByIdSvc(promoterGroupId, auth.organizerId, auth.isAdmin, {
            eventId: eventId ? parseInt(eventId as string) : undefined,
            startDate: parseDate(startDate),
            endDate: parseDate(endDate)
        });
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// MY STATS
// ============================================================================
export const getMyPromoterStats = async (req: CustomRequest, res: Response) => {
    const userId = checkPromoterAuth(req);
    if (!userId) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    try {
        const { eventId, startDate, endDate } = req.query;
        const result = await getMyPromoterStatsSvc(userId, {
            eventId: eventId ? parseInt(eventId as string) : undefined,
            startDate: parseDate(startDate),
            endDate: parseDate(endDate)
        });
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// EVENT STATS
// ============================================================================
export const getEventsPromoterStats = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    try {
        const result = await getEventsPromoterStatsSvc(auth.organizerId);
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// EXPORT PDF
// ============================================================================
export const exportPromotersStatsPdf = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const eventId = parseInt(req.params.eventId);
    if (isNaN(eventId)) {
        return res.status(400).json({ code: "INVALID_ID", message: "ID de evento inválido" });
    }

    try {
        const { event, promoters, summary } = await getPromoterStatsForExport(auth.organizerId, eventId);

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="estadisticas-rrpp-${eventId}.pdf"`);
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

            const tableTop = doc.y;
            doc.fontSize(10).font('Helvetica-Bold');
            doc.fillColor('#333333');
            doc.rect(50, tableTop, 500, 20).fill('#f0f0f0');
            doc.fillColor('#333333');
            doc.text('Promotor', 55, tableTop + 5, { width: 120 });
            doc.text('Código', 180, tableTop + 5, { width: 80 });
            doc.text('Tickets', 265, tableTop + 5, { width: 50, align: 'center' });
            doc.text('Ingresos', 320, tableTop + 5, { width: 80, align: 'right' });
            doc.text('Comisión', 405, tableTop + 5, { width: 70, align: 'right' });
            doc.text('% Com.', 480, tableTop + 5, { width: 60, align: 'right' });
            doc.moveDown(1);

            let rowY = doc.y;
            doc.fontSize(9).font('Helvetica');
            promoters.forEach((promoter, index) => {
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
                if (rowY > 700) {
                    doc.addPage();
                    rowY = 50;
                }
            });

            doc.rect(50, tableTop, 500, rowY - tableTop).stroke('#cccccc');
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
            50, 750, { align: 'center', width: 500 }
        );
        doc.end();
    } catch (error: any) {
        logger.error("Error exporting promoters stats PDF:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};
