import { Request, Response } from "express";
import { Event } from "./event.entity";
import { Category } from "../category/category.entity";
import { User } from "../user/user.entity";
import { CustomRequest } from "../middlewares/authToken";
import { TicketType } from "../ticketType/ticketType.entity";
import { Ticket } from "../ticket/ticket.entity";
import AppDataSource from "../db";
import { log } from "console";

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
            ticketTypes // Array of { name, price, capacity, description? }
        } = req.body;

        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
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
                    // Soft delete: active = false
                    existingTT.active = false;
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
                            // Rollback manually or throw to trigger catch
                            throw new Error(`No se puede reducir la capacidad por debajo de lo vendido (${existingTT.soldCount}) para ${existingTT.name}`);
                        }

                        existingTT.name = ttData.name ?? existingTT.name;
                        existingTT.price = ttData.price ?? existingTT.price;
                        existingTT.capacity = ttData.capacity ?? existingTT.capacity;
                        existingTT.description = ttData.description ?? existingTT.description;
                        existingTT.active = ttData.active ?? true; // Reactivar si estaba inactivo
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
                    newTT.active = true;
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
        const events = await Event.find({
            where: { active: true },
            relations: ["category", "ticketTypes"],
            order: { date: "ASC" }
        });
        return res.json(events);
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

        const events = await AppDataSource.getRepository(Event)
            .createQueryBuilder("event")
            .leftJoinAndSelect("event.category", "category")
            .leftJoinAndSelect("event.ticketTypes", "ticketTypes")
            .where("LOWER(event.title) LIKE :title", { title: `%${String(title).toLowerCase()}%` })
            .andWhere("event.active = true")
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

        const events = await Event.find({
            where: { user_id: userId, active: true },
            relations: ["category", "ticketTypes"]
        });
        return res.json(events);
    } catch (error) {
        return res.status(500).json({ message: "Error fetching user events" });
    }
};

// --- STUBS FOR STATS (To avoid compilation errors) ---
// Estos endpoints requieren implementación real basada en TicketType,
// pero por ahora devolveremos estructuras vacías o errores controlados
// para permitir que el servidor arranque.

export const getCreatorStats = async (req: CustomRequest, res: Response) => {
    return res.json({ message: "Stats endpoint pending refactor for TicketType architecture" });
};

export const getCreatorStatsComparative = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Obtener todos los eventos del creador
        const events = await Event.find({
            where: { user_id: userId, active: true },
            relations: ['ticketTypes'],
            order: { date: 'DESC' }
        });

        const comparative = await Promise.all(events.map(async (event) => {
            const ticketTypeIds = event.ticketTypes.map(tt => tt.id);

            if (ticketTypeIds.length === 0) {
                return {
                    eventId: event.id,
                    title: event.title,
                    participants: 0,
                    revenue: 0,
                    attendanceRate: 0
                };
            }

            const stats = await AppDataSource.getRepository(Ticket)
                .createQueryBuilder('t')
                .select([
                    'COUNT(t.id) as "totalTickets"',
                    'SUM(t.purchasePrice) as "totalRevenue"',
                    `SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as "usedCount"`
                ])
                .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
                .getRawOne();

            const totalTickets = parseInt(stats?.totalTickets || '0');
            const totalRevenue = parseFloat(stats?.totalRevenue || '0');
            const usedCount = parseInt(stats?.usedCount || '0');

            return {
                eventId: event.id,
                title: event.title,
                participants: totalTickets,
                revenue: totalRevenue,
                attendanceRate: totalTickets > 0 ? usedCount / totalTickets : 0
            };
        }));

        return res.json({ comparative });
    } catch (error) {
        console.error("Error getting comparative stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas comparativas" });
    }
};

export const streamCreatorStats = async (req: CustomRequest, res: Response) => {
    return res.status(501).json({ message: "Not implemented yet" });
};

export const exportCreatorStatsPdf = async (req: CustomRequest, res: Response) => {
    return res.status(501).json({ message: "Not implemented yet" });
};

export const getPlatformStats = async (req: CustomRequest, res: Response) => {
    return res.json({ message: "Stats endpoint pending refactor" });
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

export const exportCreatorStatsCsv = async (req: CustomRequest, res: Response) => {
    return res.status(501).json({ message: "Not implemented yet" });
};
