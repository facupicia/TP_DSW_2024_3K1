import { Event } from "./event.entity"
import { Request, Response } from "express"
import { User } from "../user/user.entity";
import { Ticket } from "../ticket/ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { Category } from "../category/category.entity";
import { log } from "console";
import { globalCache } from "../utils/cache";
import PDFDocument from "pdfkit";



export const createEvent = async (req: CustomRequest, res: Response) => {
    try {
        const { title, capacity, date, description, time, price, location, image, categoryId } = req.body;

        const user = await User.findOneBy({ id: req.user!.id });
        if (!user) return res.status(404).json({ message: "User no encontrado" });

        // Buscar la categoría en la base de datos usando el categoryId
        const category = await Category.findOneBy({ id: categoryId });
        if (!category) return res.status(404).json({ message: "Category no encontrada" });

        const userName = user.firstname;
        const categorName = category.name

        const userId = user.id;


        const event = new Event();
        event.image = image;
        event.location = location;
        event.price = price;
        event.title = title;
        event.capacity = capacity;
        event.date = date;
        event.time = time;
        event.description = description;
        event.usuario = user;
        event.organizer = userName;
        event.user_id = userId;
        event.categoria_name = categorName


        await event.save();

        return res.status(201).json({ message: 'Evento creado con éxito', event });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Error interno del servidor' });
    }
};



export const updateEvent = async (req: Request, res: Response) => {
    try {
        const { title, capacity, date, description, time, price, location, image, categoryId } = req.body;
        const idNum = parseInt(req.params.id);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ message: "Invalid event id" });
        const event = await Event.findOneBy({ id: idNum })

        if (!event) return res.status(404).json({ message: "Event does not exist" })

        const category = await Category.findOneBy({ id: categoryId });
        if (!category) return res.status(404).json({ message: "Category no encontrada" });

        event.title = title
        event.capacity = capacity
        event.date = date
        event.description = description
        event.time = time
        event.price = price
        event.location = location
        event.image = image
        event.category = category
        event.categoria_name = category.name

        await event.save()

        return res.status(200).json({ message: "Evento actualizado" })
    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message })
        }
        return res.status(500).json({ message: "Error interno del servidor" })
    }
}


export const getEventsByUser = async (req: CustomRequest, res: Response) => {
    try {
        const user = await User.findOneBy({ id: req.user!.id });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        const cacheKey = `events:user:${user.id}`;
        const cached = globalCache.get(cacheKey);
        if (cached) return res.json(cached);

        const eventos = await Event.find({
            where: { usuario: { id: user.id } },
            relations: {
                category: true
            },
            select: {
                category: {
                    name: true
                }
            }
        });

        globalCache.set(cacheKey, eventos, 30000);
        res.json(eventos);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener eventos' });
    }
}

const getPeriodRange = (period?: string) => {
    const now = new Date();
    const start = new Date(now);
    switch (period) {
        case 'diario':
        case 'daily':
            start.setHours(0, 0, 0, 0);
            break;
        case 'semanal':
        case 'weekly':
            {
                const day = now.getDay();
                const diff = (day + 6) % 7; // lunes inicio
                start.setDate(now.getDate() - diff);
                start.setHours(0, 0, 0, 0);
            }
            break;
        case 'mensual':
        case 'monthly':
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'anual':
        case 'yearly':
            start.setMonth(0, 1);
            start.setHours(0, 0, 0, 0);
            break;
        default:
            start.setFullYear(1970, 0, 1);
            start.setHours(0, 0, 0, 0);
    }
    return { start, end: now };
};

export const getPlatformStats = async (req: CustomRequest, res: Response) => {
    try {
        const totalUsers = await User.count();
        const totalEvents = await Event.count();
        const totalTickets = await Ticket.count();

        const averageParticipation = totalEvents > 0 ? Number((totalTickets / totalEvents).toFixed(2)) : 0;

        // Growth - grouping by month
        const usersByMonth = await User.query(`
            SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, COUNT(*) as count 
            FROM "user" 
            GROUP BY month 
            ORDER BY month ASC 
        `);

        const eventsByMonth = await Event.query(`
            SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, COUNT(*) as count 
            FROM "event" 
            GROUP BY month 
            ORDER BY month ASC 
        `);

        return res.json({
            totalUsers,
            totalEvents,
            averageParticipation,
            growth: {
                users: usersByMonth,
                events: eventsByMonth
            }
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error al obtener estadísticas de plataforma' });
    }
};

export const getEventStats = async (req: CustomRequest, res: Response) => {
    try {
        const { id } = req.params;
        const eventId = parseInt(id);
        if (isNaN(eventId)) return res.status(400).json({ message: "ID inválido" });

        const event = await Event.findOneBy({ id: eventId });
        if (!event) return res.status(404).json({ message: "Evento no encontrado" });

        // Check ownership or admin
        if (event.user_id !== req.user!.id && req.user!.rol !== 'admin') {
            return res.status(403).json({ message: "No autorizado" });
        }

        const tickets = await Ticket.find({
            where: { eventId: event.id },
            relations: { user: true }
        });

        const totalParticipants = tickets.length;
        const totalRevenue = tickets.reduce((sum, t) => sum + Number(t.purchasePrice || 0), 0);
        const attendanceRate = event.capacity > 0 ? Number((totalParticipants / event.capacity).toFixed(4)) : 0;

        // Demographics
        const locations: Record<string, number> = {};
        const ages: Record<string, number> = { '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0 };

        tickets.forEach(t => {
            if (t.user) {
                // Location
                const loc = t.user.location || 'Desconocido';
                locations[loc] = (locations[loc] || 0) + 1;

                // Age
                if (t.user.birth) {
                    const birthYear = new Date(t.user.birth).getFullYear();
                    const currentYear = new Date().getFullYear();
                    const age = currentYear - birthYear;

                    if (age >= 18 && age <= 24) ages['18-24']++;
                    else if (age >= 25 && age <= 34) ages['25-34']++;
                    else if (age >= 35 && age <= 44) ages['35-44']++;
                    else if (age >= 45) ages['45+']++;
                }
            }
        });

        return res.json({
            id: event.id,
            title: event.title,
            totalParticipants,
            revenue: Number(totalRevenue.toFixed(2)),
            attendanceRate,
            demographics: {
                locations: Object.entries(locations).map(([name, value]) => ({ name, value })),
                ages
            }
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error al obtener estadísticas del evento' });
    }
};

export const getCreatorStats = async (req: CustomRequest, res: Response) => {
    try {
        const user = await User.findOneBy({ id: req.user!.id });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        const { period } = req.query as { period?: string };
        const { start, end } = getPeriodRange(period);

        // Fetch events without tickets relation to save memory
        const events = await Event.createQueryBuilder("event")
            .leftJoinAndSelect("event.category", "category")
            .where("event.user_id = :uid", { uid: user.id })
            .getMany();

        const totalEvents = events.length;

        // Fetch only relevant tickets in the period
        const ticketsCount = await Ticket.createQueryBuilder("ticket")
            .innerJoin("ticket.event", "event")
            .where("event.user_id = :uid", { uid: user.id })
            .andWhere("ticket.createdAt BETWEEN :start AND :end", { start, end })
            .getCount();

        const totalParticipants = ticketsCount;
        const totalCapacity = events.reduce((sum, ev) => sum + (ev.capacity || 0), 0);

        const categoryCount: Record<string, number> = {};

        events.forEach(ev => {
            const cname = ev.categoria_name || (ev.category?.name ?? 'Sin categoría');
            categoryCount[cname] = (categoryCount[cname] ?? 0) + 1;
        });

        const averageParticipants = totalEvents > 0 ? Number((totalParticipants / totalEvents).toFixed(2)) : 0;
        const attendanceRate = totalCapacity > 0 ? Number((totalParticipants / totalCapacity).toFixed(4)) : 0;

        const distribution = Object.entries(categoryCount).map(([name, count]) => ({ name, count }));

        return res.json({
            period: period ?? 'total',
            totalEventsCreated: totalEvents,
            averageParticipantsPerEvent: averageParticipants,
            attendanceRate,
            categoryDistribution: distribution
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al calcular estadísticas' });
    }
};

export const getCreatorStatsComparative = async (req: CustomRequest, res: Response) => {
    try {
        const user = await User.findOneBy({ id: req.user!.id });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        const { period } = req.query as { period?: string };
        const { start, end } = getPeriodRange(period);

        const events = await Event.createQueryBuilder("event")
            .leftJoinAndSelect("event.tickets", "ticket")
            .where("event.user_id = :uid", { uid: user.id })
            .getMany();

        const comparative = events.map(ev => {
            const ticketsInPeriod = (ev.tickets ?? []).filter(t => t.createdAt >= start && t.createdAt <= end);
            const participants = ticketsInPeriod.length;
            const revenue = ticketsInPeriod.reduce((sum, t) => sum + Number(t.purchasePrice ?? 0), 0);
            const attendance = ev.capacity > 0 ? Number((participants / ev.capacity).toFixed(4)) : 0;
            return {
                id: ev.id,
                title: ev.title,
                participants,
                revenue: Number(revenue.toFixed(2)),
                attendanceRate: attendance
            };
        });

        return res.json({ period: period ?? 'total', comparative });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener comparativa' });
    }
};

export const streamCreatorStats = async (req: CustomRequest, res: Response) => {
    try {
        const user = await User.findOneBy({ id: req.user!.id });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        const { period } = req.query as { period?: string };

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const interval = setInterval(async () => {
            const { start, end } = getPeriodRange(period);
            const events = await Event.createQueryBuilder("event")
                .leftJoinAndSelect("event.tickets", "ticket")
                .where("event.user_id = :uid", { uid: user.id })
                .getMany();

            const totalEvents = events.length;
            let totalParticipants = 0;
            let totalCapacity = 0;
            events.forEach(ev => {
                const participantsForEvent = ev.tickets?.filter(t => t.createdAt >= start && t.createdAt <= end).length || 0;
                totalParticipants += participantsForEvent;
                totalCapacity += ev.capacity || 0;
            });
            const averageParticipants = totalEvents > 0 ? Number((totalParticipants / totalEvents).toFixed(2)) : 0;
            const attendanceRate = totalCapacity > 0 ? Number((totalParticipants / totalCapacity).toFixed(4)) : 0;

            const payload = JSON.stringify({
                totalEventsCreated: totalEvents,
                averageParticipantsPerEvent: averageParticipants,
                attendanceRate
            });
            res.write(`data: ${payload}\n\n`);
        }, 10000);

        req.on('close', () => {
            clearInterval(interval);
        });
    } catch (error) {
        res.status(500).end();
    }
};

export const exportCreatorStatsPdf = async (req: CustomRequest, res: Response) => {
    try {
        const user = await User.findOneBy({ id: req.user!.id });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        const { period } = req.query as { period?: string };
        const { start, end } = getPeriodRange(period);

        const events = await Event.createQueryBuilder("event")
            .leftJoinAndSelect("event.tickets", "ticket")
            .leftJoinAndSelect("event.category", "category")
            .where("event.user_id = :uid", { uid: user.id })
            .getMany();

        let totalParticipants = 0;
        let totalCapacity = 0;
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=\"estadisticas-eventos.pdf\"');
        doc.pipe(res);

        doc.fontSize(18).text('Panel de Estadísticas de Creador', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Periodo: ${period ?? 'total'}`);
        doc.text(`Usuario: ${user.firstname ?? ''} ${user.lastname ?? ''}`);
        doc.moveDown();

        events.forEach(ev => {
            const ticketsInPeriod = (ev.tickets ?? []).filter(t => t.createdAt >= start && t.createdAt <= end);
            const participants = ticketsInPeriod.length;
            totalParticipants += participants;
            totalCapacity += ev.capacity || 0;
        });
        const averageParticipants = events.length > 0 ? Number((totalParticipants / events.length).toFixed(2)) : 0;
        const attendanceRate = totalCapacity > 0 ? Number((totalParticipants / totalCapacity).toFixed(4)) : 0;

        doc.text(`Eventos creados: ${events.length}`);
        doc.text(`Promedio de participantes por evento: ${averageParticipants}`);
        doc.text(`Tasa de asistencia (confirmados/cupos): ${attendanceRate}`);
        doc.moveDown();
        doc.text('Comparativa de eventos:', { underline: true });
        doc.moveDown(0.5);

        events.forEach(ev => {
            const ticketsInPeriod = (ev.tickets ?? []).filter(t => t.createdAt >= start && t.createdAt <= end);
            const participants = ticketsInPeriod.length;
            const revenue = ticketsInPeriod.reduce((sum, t) => sum + Number(t.purchasePrice ?? 0), 0);
            const attendance = ev.capacity > 0 ? Number((participants / ev.capacity).toFixed(4)) : 0;
            doc.text(`- ${ev.title} | Participantes: ${participants} | Ingresos: $${Number(revenue).toFixed(2)} | Asistencia: ${attendance}`);
        });

        doc.end();
    } catch (error) {
        res.status(500).json({ message: 'Error al exportar PDF' });
    }
};

export const exportCreatorStatsCsv = async (req: CustomRequest, res: Response) => {
    try {
        const user = await User.findOneBy({ id: req.user!.id });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        const { period } = req.query as { period?: string };
        const { start, end } = getPeriodRange(period);

        const events = await Event.createQueryBuilder("event")
            .where("event.user_id = :uid", { uid: user.id })
            .getMany();

        const tickets = await Ticket.createQueryBuilder("ticket")
            .innerJoinAndSelect("ticket.event", "event")
            .where("event.user_id = :uid", { uid: user.id })
            .andWhere("ticket.createdAt BETWEEN :start AND :end", { start, end })
            .getMany();

        const eventTicketCounts: Record<number, number> = {};
        const eventRevenue: Record<number, number> = {};

        tickets.forEach(t => {
            eventTicketCounts[t.eventId] = (eventTicketCounts[t.eventId] || 0) + 1;
            eventRevenue[t.eventId] = (eventRevenue[t.eventId] || 0) + Number(t.purchasePrice || 0);
        });

        let csvContent = "ID,Evento,Fecha,Capacidad,Participantes,Ingresos,Tasa Asistencia\n";

        events.forEach(ev => {
            const participants = eventTicketCounts[ev.id] || 0;
            const revenue = eventRevenue[ev.id] || 0;
            const attendance = ev.capacity > 0 ? (participants / ev.capacity).toFixed(4) : "0";

            // Handle quotes in title
            const safeTitle = ev.title.replace(/"/g, '""');

            csvContent += `${ev.id},"${safeTitle}",${ev.date},${ev.capacity},${participants},${revenue.toFixed(2)},${attendance}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="estadisticas.csv"');
        return res.send(csvContent);

    } catch (error) {
        return res.status(500).json({ message: 'Error al exportar CSV' });
    }
};
export const getEvent = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const idNum = parseInt(id);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ message: "Invalid event id" });
        const event = await Event.findOne({
            where: { id: idNum },
            relations: {
                usuario: true,
                category: true
            },
            select: {
                usuario: {
                    id: true,
                    firstname: true,
                    lastname: true,
                    imgPerfil: true
                },
                category: {
                    id: true,
                    name: true
                }
            }
        });

        if (!event) return res.status(404).json({ message: "event not found" });

        return res.json(event);
    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
    }
};


export const getEvents = async (req: Request, res: Response) => {
    try {
        const cacheKey = `events:all`;
        const cached = globalCache.get(cacheKey);
        if (cached) return res.json(cached);

        const events = await Event.find({
            relations: {
                usuario: true,
                category: true
            },
            select: {
                // Seleccionamos solo los campos necesarios de la relación
                usuario: {
                    id: true,
                    firstname: true,
                    lastname: true,
                    // NO seleccionamos password ni email/telefono si son privados
                },
                category: {
                    id: true,
                    name: true
                }
            }
        });

        globalCache.set(cacheKey, events, 60000);
        return res.json(events);
    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
    }
}



export const getEventByName = async (req: Request, res: Response) => {
    const { search } = req.query;
    try {
        if (search !== undefined) {
            const events = await Event.createQueryBuilder("event")
                .where("event.title LIKE :search", { search: `%${search}%` })
                .getMany();

            if (events.length === 0) {
                return res.status(404).json({ message: "No se encontraron eventos" });
            }

            return res.json(events);
        } else {
            return res.status(400).json({ message: "Se requiere un parámetro de búsqueda" });
        }
    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
    }
};

export const deleteEvent = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const idNum = parseInt(id);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ message: "Invalid event id" });
        const result = await Event.delete({ id: idNum });

        if (result.affected === 0)
            return res.status(404).json({ message: "User not found" });

        return res.sendStatus(204);
    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
    }
};

