import { Request, Response } from "express";
import { Event } from "./event.entity";
import { Category } from "../category/category.entity";
import { User } from "../user/user.entity";
import { Role, getRoleNames } from "../user/role.entity";
import { CustomRequest } from "../common/middleware/authToken";
import { TicketType, TicketTypeStatus } from "../ticketType/ticketType.entity";
import { Ticket } from "../ticket/ticket.entity";
import AppDataSource from "../db";
import { log } from "console";
import { canCreateEvent, canCreateTicketTypes, getActiveSubscription, assignDefaultPlan } from "../subscription/subscription.service";
import PDFDocument from "pdfkit";

/* ======================================================
   CREATE EVENT
====================================================== */
export const createEvent = async (req: CustomRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const {
            title,
            pais,
            provincia,
            ciudad,
            direccion,
            organizer,
            image,
            date,
            time,
            description,
            categoryId,
            destacado,
            minAge,
            isPublic,
            ticketTypes // Array of { name, price, capacity, description? }
        } = req.body;

        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await queryRunner.manager.findOne(User, {
            where: { id: userId },
            relations: ['roles'],
            select: ['id', 'firstname', 'lastname', 'email', 'mpUserId']
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // ============ MERCADO PAGO VALIDATION ============
        // Organizadores DEBEN tener su cuenta MP vinculada para crear eventos
        // Esto garantiza que puedan recibir pagos de tickets
        if (!user.mpUserId) {
            await queryRunner.rollbackTransaction();
            return res.status(403).json({
                code: 'MP_NOT_LINKED',
                message: 'Debes vincular tu cuenta de Mercado Pago para crear eventos y recibir pagos.',
                connectUrl: '/api/payment/mp/connect'
            });
        }
        // ================================================

        // ============ SUBSCRIPTION PLAN VALIDATION ============
        // Check event creation limit
        const eventCheck = await canCreateEvent(userId);
        if (!eventCheck.allowed) {
            await queryRunner.rollbackTransaction();
            return res.status(403).json({
                code: 'PLAN_LIMIT_EVENTS',
                message: eventCheck.reason,
                upgradeRequired: eventCheck.upgradeRequired,
                currentCount: eventCheck.currentCount,
                maxAllowed: eventCheck.maxAllowed
            });
        }

        // Check ticket types limit
        const ticketTypesCount = ticketTypes?.length || 0;
        if (ticketTypesCount > 0) {
            const ttCheck = await canCreateTicketTypes(userId, ticketTypesCount);
            if (!ttCheck.allowed) {
                await queryRunner.rollbackTransaction();
                return res.status(403).json({
                    code: 'PLAN_LIMIT_TICKET_TYPES',
                    message: ttCheck.reason,
                    upgradeRequired: ttCheck.upgradeRequired,
                    maxAllowed: ttCheck.maxAllowed
                });
            }
        }
        // ======================================================

        // Promote user to organizer role if they don't have it yet
        const userRoleNames = getRoleNames(user);
        if (!userRoleNames.includes('organizer')) {
            const roleRepo = queryRunner.manager.getRepository(Role);
            let organizerRole = await roleRepo.findOne({ where: { name: 'organizer' } });
            if (!organizerRole) {
                organizerRole = roleRepo.create({ name: 'organizer' });
                await roleRepo.save(organizerRole);
            }
            user.roles = [...user.roles, organizerRole];
            await queryRunner.manager.save(User, user);
            // Ensure user has a subscription (will create FREE if none exists)
            await assignDefaultPlan(userId);
        }

        const category = await queryRunner.manager.findOne(Category, { where: { id: categoryId } });
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        const event = new Event();
        event.title = title;
        event.pais = pais;
        event.provincia = provincia;
        event.ciudad = ciudad;
        event.direccion = direccion;
        event.organizer = organizer;
        event.image = image;
        event.date = date;
        event.time = time;
        event.description = description;
        event.destacado = destacado ?? false;
        event.minAge = minAge ?? 0;
        event.isPublic = isPublic ?? true;
        event.user = user;
        event.user_id = user.id;
        event.category = category;
        event.categoryId = categoryId;

        await queryRunner.manager.save(Event, event);

        // 2. Crear TicketTypes si existen
        if (ticketTypes && Array.isArray(ticketTypes) && ticketTypes.length > 0) {
            const ticketTypeEntities = ticketTypes.map((tt: any) => {
                const ticketType = new TicketType();
                ticketType.name = tt.name;
                ticketType.price = tt.price;
                ticketType.capacity = tt.capacity;
                ticketType.description = tt.description;
                ticketType.event = event;
                ticketType.eventId = event.id;
                return ticketType;
            });
            await queryRunner.manager.save(TicketType, ticketTypeEntities);
            event.ticketTypes = ticketTypeEntities;
        }

        await queryRunner.commitTransaction();

        // Limpiar referencia circular antes de devolver JSON
        // TicketType -> Event -> TicketTypes ...
        if (event.ticketTypes) {
            event.ticketTypes.forEach(tt => {
                delete (tt as any).event;
            });
        }

        return res.status(201).json(event);

    } catch (error) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        console.error(error);
        return res.status(500).json({ message: "Error creating event" });
    } finally {
        await queryRunner.release();
    }
};

/* ======================================================
   UPDATE EVENT
====================================================== */
export const updateEvent = async (req: Request, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const idNum = Number(req.params.id);
        if (isNaN(idNum) || idNum <= 0) {
            return res.status(400).json({ message: "Invalid event id" });
        }

        const event = await queryRunner.manager.findOne(Event, {
            where: { id: idNum },
            relations: ["category", "ticketTypes"]
        });

        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        const {
            title,
            pais,
            provincia,
            ciudad,
            direccion,
            organizer,
            image,
            date,
            time,
            description,
            categoryId,
            active,
            destacado,
            minAge,
            isPublic,
            ticketTypes // Array of ticket types to update/create
        } = req.body;

        if (categoryId) {
            const category = await queryRunner.manager.findOne(Category, { where: { id: categoryId } });
            if (!category) {
                return res.status(404).json({ message: "Category not found" });
            }
            event.category = category;
            event.categoryId = categoryId;
        }

        event.title = title ?? event.title;
        event.pais = pais ?? event.pais;
        event.provincia = provincia ?? event.provincia;
        event.ciudad = ciudad ?? event.ciudad;
        event.direccion = direccion ?? event.direccion;
        event.organizer = organizer ?? event.organizer;
        event.image = image ?? event.image;
        event.date = date ?? event.date;
        event.time = time ?? event.time;
        event.description = description ?? event.description;
        event.active = active ?? event.active;
        event.destacado = destacado ?? event.destacado;
        event.minAge = minAge ?? event.minAge;
        event.isPublic = isPublic ?? event.isPublic;

        await queryRunner.manager.save(Event, event);

        // Manejo de TicketTypes en actualización
        if (ticketTypes && Array.isArray(ticketTypes)) {
            // 1. Obtener los IDs de los tickets que vienen en el request
            const incomingIds = ticketTypes
                .filter((t: any) => t.id)
                .map((t: any) => Number(t.id));

            // 2. Detectar cuáles hay que "borrar" (desactivar)
            // Son los que están en la base de datos pero NO en el request
            const existingTypes = event.ticketTypes || [];
            for (const existingTT of existingTypes) {
                if (!incomingIds.includes(existingTT.id)) {
                    // Soft delete: status = DISABLED
                    existingTT.status = TicketTypeStatus.DISABLED;
                    await queryRunner.manager.save(TicketType, existingTT);
                }
            }

            // 3. Crear o Actualizar los que vienen
            for (const ttData of ticketTypes) {
                if (ttData.id) {
                    // Actualizar existente
                    const existingTT = existingTypes.find(t => t.id === Number(ttData.id));
                    if (existingTT) {
                        // Business Rule: Cannot reduce capacity below sold count
                        if (ttData.capacity !== undefined && ttData.capacity < existingTT.soldCount) {
                            throw new Error(`No se puede reducir la capacidad por debajo de lo vendido (${existingTT.soldCount}) para ${existingTT.name}`);
                        }

                        existingTT.name = ttData.name ?? existingTT.name;
                        existingTT.price = ttData.price ?? existingTT.price;
                        existingTT.capacity = ttData.capacity ?? existingTT.capacity;
                        existingTT.description = ttData.description ?? existingTT.description;
                        existingTT.status = ttData.status ?? TicketTypeStatus.ACTIVE;
                        await queryRunner.manager.save(TicketType, existingTT);
                    }
                } else {
                    // Crear nuevo
                    const newTT = new TicketType();
                    newTT.name = ttData.name;
                    newTT.price = ttData.price;
                    newTT.capacity = ttData.capacity;
                    newTT.description = ttData.description;
                    newTT.event = event;
                    newTT.status = TicketTypeStatus.ACTIVE;
                    await queryRunner.manager.save(TicketType, newTT);
                }
            }
        }

        await queryRunner.commitTransaction();

        // Recargar evento con relaciones actualizadas para devolver
        const updatedEvent = await Event.findOne({
            where: { id: idNum },
            relations: ["category", "ticketTypes"]
        });

        return res.json(updatedEvent);

    } catch (error: any) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        console.error(error);
        if (error.message && error.message.includes("No se puede reducir la capacidad")) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Error updating event" });
    } finally {
        await queryRunner.release();
    }
};

/* ======================================================
   DELETE EVENT (SOFT LOGIC)
====================================================== */
export const deleteEvent = async (req: Request, res: Response) => {
    try {
        const idNum = Number(req.params.id);
        if (isNaN(idNum) || idNum <= 0) {
            return res.status(400).json({ message: "Invalid event id" });
        }

        const event = await Event.findOneBy({ id: idNum });
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        event.active = false;
        await event.save();

        return res.sendStatus(204);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error deleting event" });
    }
};

/* ======================================================
   GET EVENT
====================================================== */
export const getEvent = async (req: Request, res: Response) => {
    try {
        const idNum = Number(req.params.id);
        if (isNaN(idNum) || idNum <= 0) {
            return res.status(400).json({ message: "Invalid event id" });
        }

        const event = await Event.findOne({
            where: { id: idNum },
            relations: ["user", "category", "ticketTypes"]
        });

        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        return res.json(event);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error retrieving event" });
    }
};

/* ======================================================
   ADDITIONAL GETTERS & STATS
   (Implementaciones stub o básicas para recuperar compilación)
====================================================== */

export const getEvents = async (req: Request, res: Response) => {
    try {
        const { skip, take } = (await import("../common/services/pagination")).getPagination(req.query, 50, 100);
        const [events, total] = await Event.findAndCount({
            where: { active: true, isPublic: true },
            relations: ["category", "ticketTypes"],
            order: { date: "ASC" },
            skip,
            take
        });
        return res.json({ data: events, total });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: error.message || "Error fetching events" });
    }
};

export const getEventsNumber = async (req: Request, res: Response) => {
    try {
        const count = await Event.count({ where: { active: true } });

        return res.json({
            activeEvents: count
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error fetching events count" });
    }
};

export const getEventByName = async (req: Request, res: Response) => {
    try {
        const { title } = req.query;
        if (!title) return res.json([]);
        const { take } = (await import("../common/services/pagination")).getPagination(req.query, 50, 100);

        const events = await AppDataSource.getRepository(Event)
            .createQueryBuilder("event")
            .leftJoinAndSelect("event.category", "category")
            .leftJoinAndSelect("event.ticketTypes", "ticketTypes")
            .where("LOWER(event.title) LIKE :title", { title: `%${String(title).toLowerCase()}%` })
            .andWhere("event.active = true")
            .limit(take)
            .getMany();

        return res.json(events);
    } catch (error) {
        return res.status(500).json({ message: "Error searching events" });
    }
};

export const getEventsByUser = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });
        const { skip, take } = (await import("../common/services/pagination")).getPagination(req.query, 50, 100);

        const [events, total] = await Event.findAndCount({
            where: { user_id: userId, active: true },
            relations: ["category", "ticketTypes"],
            order: { date: "DESC" },
            skip,
            take
        });
        return res.json({ data: events, total });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching user events" });
    }
};

// --- IMPLEMENTED STATS ENDPOINTS ---

/**
 * Get comprehensive creator stats with historical comparison
 * GET /api/event/stats
 */
export const getCreatorStats = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const period = (req.query.period as string) || 'month';
        
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Calculate date range based on period
        const now = new Date();
        let startDate: Date;
        let previousStartDate: Date;
        let previousEndDate: Date;
        
        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                previousStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                previousEndDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                previousStartDate = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
                previousEndDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                break;
            case 'year':
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                previousStartDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
                previousEndDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                break;
            default:
                startDate = new Date(0); // All time
                previousStartDate = new Date(0);
                previousEndDate = new Date(0);
        }

        // Get all events for this creator (limit to prevent memory issues)
        const events = await Event.find({
            where: { user_id: userId, active: true },
            relations: ['ticketTypes'],
            order: { createdAt: 'DESC' },
            take: 100
        });

        const allTicketTypeIds = events.flatMap(e => e.ticketTypes.map(tt => tt.id));

        if (allTicketTypeIds.length === 0) {
            return res.json({
                totalRevenue: 0,
                totalTickets: 0,
                avgPrice: 0,
                totalEvents: events.length,
                revenueGrowth: 0,
                ticketsGrowth: 0,
                topEvents: [],
                recentActivity: []
            });
        }

        // Current period stats
        const currentStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .select([
                'COUNT(t.id) as "totalTickets"',
                'SUM(t.purchasePrice) as "totalRevenue"',
                'AVG(t.purchasePrice) as "avgPrice"'
            ])
            .where('t.ticketTypeId IN (:...ids)', { ids: allTicketTypeIds })
            .andWhere('t.createdAt >= :startDate', { startDate })
            .getRawOne();

        // Previous period stats for growth calculation
        let previousStats = { totalTickets: 0, totalRevenue: 0 };
        if (period !== 'all') {
            const prev = await AppDataSource.getRepository(Ticket)
                .createQueryBuilder('t')
                .select([
                    'COUNT(t.id) as "totalTickets"',
                    'SUM(t.purchasePrice) as "totalRevenue"'
                ])
                .where('t.ticketTypeId IN (:...ids)', { ids: allTicketTypeIds })
                .andWhere('t.createdAt >= :previousStartDate', { previousStartDate })
                .andWhere('t.createdAt < :previousEndDate', { previousEndDate })
                .getRawOne();
            previousStats = {
                totalTickets: parseInt(prev?.totalTickets || '0'),
                totalRevenue: parseFloat(prev?.totalRevenue || '0')
            };
        }

        // Calculate growth percentages
        const currentRevenue = parseFloat(currentStats?.totalRevenue || '0');
        const currentTickets = parseInt(currentStats?.totalTickets || '0');
        
        const revenueGrowth = previousStats.totalRevenue > 0 
            ? ((currentRevenue - previousStats.totalRevenue) / previousStats.totalRevenue) * 100 
            : 0;
        const ticketsGrowth = previousStats.totalTickets > 0 
            ? ((currentTickets - previousStats.totalTickets) / previousStats.totalTickets) * 100 
            : 0;

        // Top events by revenue (single aggregated query to avoid N+1)
        const topEventsRaw = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .innerJoin('t.ticketType', 'tt')
            .innerJoin('tt.event', 'e')
            .select([
                'e.id as "eventId"',
                'e.title as "title"',
                'COUNT(t.id) as "tickets"',
                'SUM(t.purchasePrice) as "revenue"'
            ])
            .where('e.user_id = :userId', { userId })
            .andWhere('e.active = true')
            .groupBy('e.id')
            .addGroupBy('e.title')
            .orderBy('SUM(t.purchasePrice)', 'DESC')
            .limit(5)
            .getRawMany();

        const topEvents = topEventsRaw.map(r => ({
            eventId: parseInt(r.eventId),
            title: r.title,
            revenue: parseFloat(r.revenue || '0'),
            tickets: parseInt(r.tickets || '0')
        }));

        // Recent activity (last 10 sales)
        const recentActivity = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .leftJoin('t.ticketType', 'tt')
            .leftJoin('tt.event', 'e')
            .select([
                't.id as ticketId',
                't.purchasePrice as price',
                't.createdAt as soldAt',
                'tt.name as ticketType',
                'e.title as eventTitle'
            ])
            .where('t.ticketTypeId IN (:...ids)', { ids: allTicketTypeIds })
            .orderBy('t.createdAt', 'DESC')
            .limit(10)
            .getRawMany();

        return res.json({
            totalRevenue: currentRevenue,
            totalTickets: currentTickets,
            avgPrice: parseFloat(currentStats?.avgPrice || '0'),
            totalEvents: events.length,
            revenueGrowth: parseFloat(revenueGrowth.toFixed(1)),
            ticketsGrowth: parseFloat(ticketsGrowth.toFixed(1)),
            topEvents: topEvents.sort((a, b) => b.revenue - a.revenue),
            recentActivity: recentActivity.map(r => ({
                ticketId: r.ticketId,
                eventTitle: r.eventTitle || 'Unknown',
                ticketType: r.ticketType || 'General',
                price: parseFloat(r.price || '0'),
                soldAt: r.soldAt
            }))
        });

    } catch (error) {
        console.error("Error getting creator stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas del creador" });
    }
};

export const getCreatorStatsComparative = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Single unified query with GROUP BY to eliminate N+1
        const comparative = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .innerJoin('t.ticketType', 'tt')
            .innerJoin('tt.event', 'e')
            .select([
                'e.id as "eventId"',
                'e.title as "title"',
                'COUNT(t.id) as "participants"',
                'SUM(t.purchasePrice) as "revenue"',
                `SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as "usedCount"`
            ])
            .where('e.user_id = :userId', { userId })
            .andWhere('e.active = true')
            .groupBy('e.id')
            .addGroupBy('e.title')
            .orderBy('e.date', 'DESC')
            .getRawMany();

        const formatted = comparative.map(c => ({
            eventId: parseInt(c.eventId),
            title: c.title,
            participants: parseInt(c.participants) || 0,
            revenue: parseFloat(c.revenue) || 0,
            attendanceRate: (parseInt(c.participants) || 0) > 0
                ? (parseInt(c.usedCount) || 0) / (parseInt(c.participants) || 0)
                : 0
        }));

        return res.json({ comparative: formatted });
    } catch (error) {
        console.error("Error getting comparative stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas comparativas" });
    }
};

/**
 * Stream creator stats using Server-Sent Events for real-time updates
 * GET /api/event/stats/stream
 */
export const streamCreatorStats = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send initial data
        const events = await Event.find({
            where: { user_id: userId, active: true },
            relations: ['ticketTypes'],
            order: { createdAt: 'DESC' }
        });

        const allTicketTypeIds = events.flatMap(e => e.ticketTypes.map(tt => tt.id));
        
        let currentData = {
            totalRevenue: 0,
            totalTickets: 0,
            lastSaleAt: null as Date | null
        };

        if (allTicketTypeIds.length > 0) {
            const stats = await AppDataSource.getRepository(Ticket)
                .createQueryBuilder('t')
                .select([
                    'COUNT(t.id) as "totalTickets"',
                    'SUM(t.purchasePrice) as "totalRevenue"',
                    'MAX(t.createdAt) as "lastSaleAt"'
                ])
                .where('t.ticketTypeId IN (:...ids)', { ids: allTicketTypeIds })
                .getRawOne();

            currentData = {
                totalRevenue: parseFloat(stats?.totalRevenue || '0'),
                totalTickets: parseInt(stats?.totalTickets || '0'),
                lastSaleAt: stats?.lastSaleAt ? new Date(stats.lastSaleAt) : null
            };
        }

        // Send initial data
        res.write(`data: ${JSON.stringify({ type: 'initial', data: currentData })}\n\n`);

        // Set up interval to check for updates every 30 seconds (reduced from 10s to lower DB load)
        // For real-time, consider using a pub/sub system or webhook instead of polling
        const interval = setInterval(async () => {
            try {
                if (allTicketTypeIds.length === 0) return;

                const stats = await AppDataSource.getRepository(Ticket)
                    .createQueryBuilder('t')
                    .select([
                        'COUNT(t.id) as "totalTickets"',
                        'SUM(t.purchasePrice) as "totalRevenue"',
                        'MAX(t.createdAt) as "lastSaleAt"'
                    ])
                    .where('t.ticketTypeId IN (:...ids)', { ids: allTicketTypeIds })
                    .getRawOne();

                const newData = {
                    totalRevenue: parseFloat(stats?.totalRevenue || '0'),
                    totalTickets: parseInt(stats?.totalTickets || '0'),
                    lastSaleAt: stats?.lastSaleAt ? new Date(stats.lastSaleAt) : null
                };

                // Only send update if data changed
                if (newData.lastSaleAt && 
                    (!currentData.lastSaleAt || newData.lastSaleAt > currentData.lastSaleAt)) {
                    currentData = newData;
                    res.write(`data: ${JSON.stringify({ type: 'update', data: newData }) }\n\n`);
                }
            } catch (err) {
                console.error('Error in stats stream:', err);
            }
        }, 30000);

        // Clean up on client disconnect
        req.on('close', () => {
            clearInterval(interval);
            res.end();
        });

    } catch (error) {
        console.error("Error in stream:", error);
        return res.status(500).json({ message: "Error en streaming de estadísticas" });
    }
};

/**
 * Export creator stats to PDF
 * GET /api/event/stats/export-pdf
 */
export const exportCreatorStatsPdf = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const period = (req.query.period as string) || 'all';
        
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Get user info
        const user = await User.findOne({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Get stats data in a single aggregated query to avoid N+1
        const statsRaw = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .innerJoin('t.ticketType', 'tt')
            .innerJoin('tt.event', 'e')
            .leftJoin('e.category', 'c')
            .select([
                'e.id as "eventId"',
                'e.title as "title"',
                'e.date as "date"',
                'c.name as "category"',
                'COUNT(t.id) as "participants"',
                'SUM(t.purchasePrice) as "revenue"',
                `SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as "usedCount"`
            ])
            .where('e.user_id = :userId', { userId })
            .andWhere('e.active = true')
            .groupBy('e.id')
            .addGroupBy('e.title')
            .addGroupBy('e.date')
            .addGroupBy('c.name')
            .orderBy('e.date', 'DESC')
            .getRawMany();

        const comparative = statsRaw.map(c => ({
            eventId: parseInt(c.eventId),
            title: c.title,
            date: c.date,
            category: c.category || 'Sin categoría',
            participants: parseInt(c.participants) || 0,
            revenue: parseFloat(c.revenue) || 0,
            attendanceRate: (parseInt(c.participants) || 0) > 0
                ? (parseInt(c.usedCount) || 0) / (parseInt(c.participants) || 0)
                : 0
        }));

        const totalRevenue = comparative.reduce((sum, e) => sum + e.revenue, 0);
        const totalTickets = comparative.reduce((sum, e) => sum + e.participants, 0);

        // Generate PDF
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

            // Table header
            const tableTop = doc.y;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.fillColor('#333333');
            
            doc.rect(50, tableTop, 500, 25).fill('#f0f0f0');
            doc.fillColor('#333333');
            
            doc.text('Evento', 55, tableTop + 7, { width: 150 });
            doc.text('Fecha', 210, tableTop + 7, { width: 70 });
            doc.text('Tickets', 285, tableTop + 7, { width: 50, align: 'center' });
            doc.text('Ingresos', 340, tableTop + 7, { width: 80, align: 'right' });
            doc.text('Asistencia', 425, tableTop + 7, { width: 60, align: 'right' });
            
            doc.moveDown(1.5);
            
            // Table rows
            let rowY = doc.y;
            doc.fontSize(8).font('Helvetica');
            
            comparative.forEach((event, index) => {
                // Alternate row background
                if (index % 2 === 0) {
                    doc.rect(50, rowY - 2, 500, 20).fill('#fafafa');
                }
                
                doc.fillColor('#333333');
                doc.text(event.title.substring(0, 25), 55, rowY, { width: 150 });
                doc.text(new Date(event.date).toLocaleDateString('es-AR'), 210, rowY, { width: 70 });
                doc.text(String(event.participants), 285, rowY, { width: 50, align: 'center' });
                doc.text(`$${event.revenue.toLocaleString('es-AR')}`, 340, rowY, { width: 80, align: 'right' });
                doc.text(`${(event.attendanceRate * 100).toFixed(0)}%`, 425, rowY, { width: 60, align: 'right' });
                
                rowY += 20;
                
                // Add new page if needed
                if (rowY > 700) {
                    doc.addPage();
                    rowY = 50;
                }
            });

            // Table border
            doc.rect(50, tableTop, 500, rowY - tableTop).stroke('#cccccc');
            
            // Vertical lines
            doc.moveTo(205, tableTop).lineTo(205, rowY).stroke('#cccccc');
            doc.moveTo(280, tableTop).lineTo(280, rowY).stroke('#cccccc');
            doc.moveTo(335, tableTop).lineTo(335, rowY).stroke('#cccccc');
            doc.moveTo(420, tableTop).lineTo(420, rowY).stroke('#cccccc');
        }

        // Footer
        doc.fontSize(8).font('Helvetica');
        doc.fillColor('#666666');
        doc.text(
            `Reporte generado por EventLife - ${new Date().toLocaleString('es-AR')}`,
            50,
            750,
            { align: 'center', width: 500 }
        );

        doc.end();

    } catch (error) {
        console.error("Error exporting PDF:", error);
        return res.status(500).json({ message: "Error al generar PDF" });
    }
};

/**
 * Get platform-wide statistics (Admin only)
 * GET /api/event/stats/platform
 */
export const getPlatformStats = async (req: CustomRequest, res: Response) => {
    try {
        const userRoles = req.user?.roles || [];
        if (!userRoles.includes('admin')) {
            return res.status(403).json({ message: "Admin access required" });
        }

        const period = (req.query.period as string) || 'month';
        
        // Calculate date range
        const now = new Date();
        let startDate: Date;
        
        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                break;
            case 'year':
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                break;
            default:
                startDate = new Date(0);
        }

        // Get all events count
        const totalEvents = await Event.count({ where: { active: true } });
        const upcomingEvents = await Event.count({ 
            where: { active: true, date: new Date() } 
        });

        // Get tickets and revenue stats
        const ticketStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .select([
                'COUNT(t.id) as "totalTickets"',
                'SUM(t.purchasePrice) as "totalRevenue"',
                'AVG(t.purchasePrice) as "avgPrice"'
            ])
            .where('t.createdAt >= :startDate', { startDate })
            .getRawOne();

        // Get top categories
        const topCategories = await AppDataSource.getRepository(Event)
            .createQueryBuilder('e')
            .innerJoin('e.category', 'c')
            .select(['c.name as category', 'COUNT(e.id) as count'])
            .where('e.active = true')
            .groupBy('c.id, c.name')
            .orderBy('count', 'DESC')
            .limit(5)
            .getRawMany();

        // Get top cities
        const topCities = await AppDataSource.getRepository(Event)
            .createQueryBuilder('e')
            .select(['e.ciudad as city', 'COUNT(e.id) as count'])
            .where('e.active = true')
            .andWhere('e.ciudad IS NOT NULL')
            .groupBy('e.ciudad')
            .orderBy('count', 'DESC')
            .limit(5)
            .getRawMany();

        // Get daily sales for the period
        const dailySales = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .select([
                'DATE(t.createdAt) as date',
                'COUNT(t.id) as tickets',
                'SUM(t.purchasePrice) as revenue'
            ])
            .where('t.createdAt >= :startDate', { startDate })
            .groupBy('DATE(t.createdAt)')
            .orderBy('date', 'ASC')
            .getRawMany();

        return res.json({
            overview: {
                totalEvents,
                upcomingEvents,
                totalTickets: parseInt(ticketStats?.totalTickets || '0'),
                totalRevenue: parseFloat(ticketStats?.totalRevenue || '0'),
                avgTicketPrice: parseFloat(ticketStats?.avgPrice || '0')
            },
            topCategories: topCategories.map(c => ({
                category: c.category,
                count: parseInt(c.count)
            })),
            topCities: topCities.map(c => ({
                city: c.city,
                count: parseInt(c.count)
            })),
            dailySales: dailySales.map(d => ({
                date: d.date,
                tickets: parseInt(d.tickets),
                revenue: parseFloat(d.revenue)
            }))
        });

    } catch (error) {
        console.error("Error getting platform stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas de la plataforma" });
    }
};

export const getEventStats = async (req: CustomRequest, res: Response) => {
    try {
        const eventId = parseInt(req.params.id);
        const userId = req.user?.id;

        // Verificar que el evento existe y pertenece al usuario
        const event = await Event.findOne({
            where: { id: eventId, user_id: userId },
            relations: ['ticketTypes']
        });

        if (!event) {
            return res.status(404).json({ message: "Evento no encontrado" });
        }

        // 1. Obtener todos los tickets del evento (via ticketTypes)
        const ticketTypeIds = event.ticketTypes.map(tt => tt.id);

        if (ticketTypeIds.length === 0) {
            return res.json({
                title: event.title,
                totalParticipants: 0,
                revenue: 0,
                attendanceRate: 0,
                checkInCount: 0,
                ticketTypeDistribution: [],
                salesByDay: [],
                demographics: { ages: {}, locations: [] }
            });
        }

        // Query para estadísticas de tickets
        const ticketStats = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .select([
                'COUNT(t.id) as "totalTickets"',
                'SUM(t.purchasePrice) as "totalRevenue"',
                'SUM(CASE WHEN t.status = \'used\' THEN 1 ELSE 0 END) as "usedCount"'
            ])
            .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
            .getRawOne();

        const totalTickets = parseInt(ticketStats?.totalTickets || '0');
        const totalRevenue = parseFloat(ticketStats?.totalRevenue || '0');
        const usedCount = parseInt(ticketStats?.usedCount || '0');
        const attendanceRate = totalTickets > 0 ? usedCount / totalTickets : 0;

        // 2. Distribución por tipo de ticket
        const ticketTypeDistribution = event.ticketTypes.map(tt => ({
            name: tt.name,
            count: tt.soldCount || 0,
            revenue: (tt.soldCount || 0) * Number(tt.price)
        }));

        // 3. Ventas por día (últimos 7 días)
        const salesByDay = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .select([
                'DATE(t.createdAt) as date',
                'COUNT(t.id) as count'
            ])
            .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
            .groupBy('DATE(t.createdAt)')
            .orderBy('date', 'DESC')
            .limit(7)
            .getRawMany();

        // 4. Demografía (edad y ciudad de compradores)
        const demographics = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .innerJoin('t.user', 'u')
            .select([
                'u.birth as "birth"',
                'u.ciudad as "ciudad"'
            ])
            .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
            .getRawMany();

        // Procesar edades
        const ages: Record<string, number> = {};
        const ciudades: Record<string, number> = {};
        const now = new Date();

        demographics.forEach((d: any) => {
            // Calcular edad
            if (d.birth) {
                const birth = new Date(d.birth);
                const age = Math.floor((now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                const ageGroup = age < 18 ? '-18' : age < 25 ? '18-24' : age < 35 ? '25-34' : age < 45 ? '35-44' : '45+';
                ages[ageGroup] = (ages[ageGroup] || 0) + 1;
            }
            // Contar ciudades
            if (d.ciudad) {
                ciudades[d.ciudad] = (ciudades[d.ciudad] || 0) + 1;
            }
        });

        const ciudadesArray = Object.entries(ciudades)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        return res.json({
            title: event.title,
            totalParticipants: totalTickets,
            revenue: totalRevenue,
            attendanceRate,
            checkInCount: usedCount,
            ticketTypeDistribution,
            salesByDay: salesByDay.map((s: any) => ({ date: s.date, count: parseInt(s.count) })),
            demographics: { ages, ciudades: ciudadesArray }
        });
    } catch (error) {
        console.error("Error getting event stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas" });
    }
};

/**
 * Export creator stats to CSV
 * GET /api/event/stats/export-csv
 */
export const exportCreatorStatsCsv = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const period = (req.query.period as string) || 'all';
        
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Get stats data in a single aggregated query to avoid N+1
        const statsRaw = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .innerJoin('t.ticketType', 'tt')
            .innerJoin('tt.event', 'e')
            .leftJoin('e.category', 'c')
            .select([
                'e.id as "eventId"',
                'e.title as "title"',
                'e.date as "date"',
                'c.name as "category"',
                'COUNT(t.id) as "participants"',
                'SUM(t.purchasePrice) as "revenue"',
                `SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as "usedCount"`
            ])
            .where('e.user_id = :userId', { userId })
            .andWhere('e.active = true')
            .groupBy('e.id')
            .addGroupBy('e.title')
            .addGroupBy('e.date')
            .addGroupBy('c.name')
            .orderBy('e.date', 'DESC')
            .getRawMany();

        const comparative = statsRaw.map(c => ({
            eventId: parseInt(c.eventId),
            title: c.title,
            date: c.date,
            category: c.category || 'Sin categoría',
            participants: parseInt(c.participants) || 0,
            revenue: parseFloat(c.revenue) || 0,
            attendanceRate: (parseInt(c.participants) || 0) > 0
                ? (parseInt(c.usedCount) || 0) / (parseInt(c.participants) || 0)
                : 0
        }));

        // Generate CSV
        const headers = ['ID', 'Evento', 'Fecha', 'Categoría', 'Tickets Vendidos', 'Ingresos', 'Tasa de Asistencia'];
        const rows = comparative.map(e => [
            e.eventId,
            `"${e.title.replace(/"/g, '""')}"`,
            new Date(e.date).toISOString().split('T')[0],
            e.category,
            e.participants,
            e.revenue.toFixed(2),
            (e.attendanceRate * 100).toFixed(1) + '%'
        ]);

        // Add summary row
        const totalRevenue = comparative.reduce((sum, e) => sum + e.revenue, 0);
        const totalTickets = comparative.reduce((sum, e) => sum + e.participants, 0);
        rows.push(['', '', '', 'TOTAL', totalTickets, totalRevenue.toFixed(2), '']);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        // Set headers and send
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="estadisticas-creador-${period}-${new Date().toISOString().split('T')[0]}.csv"`);
        
        // Add BOM for Excel UTF-8 compatibility
        const BOM = '\uFEFF';
        res.send(BOM + csvContent);

    } catch (error) {
        console.error("Error exporting CSV:", error);
        return res.status(500).json({ message: "Error al generar CSV" });
    }
};
