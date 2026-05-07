import { Request, Response } from "express";
import { TicketType, TicketTypeStatus } from "./ticketType.entity";
import { Event } from "../event/event.entity";
import { CustomRequest } from "../common/middleware/authToken";
import { canCreateTicketTypes } from "../subscription/subscription.service";

/* ======================================================
   CREATE TICKET TYPE
====================================================== */
export const createTicketType = async (req: CustomRequest, res: Response) => {
    try {
        const {
            eventId,
            name,
            description,
            price,
            capacity
        } = req.body;

        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (!eventId || !name || price == null || capacity == null) {
            return res.status(400).json({
                code: "MISSING_FIELDS",
                message: "Faltan campos requeridos: eventId, name, price, capacity"
            });
        }

        if (price < 0) {
            return res.status(400).json({ code: "INVALID_PRICE", message: "El precio no puede ser negativo" });
        }

        if (capacity < 1) {
            return res.status(400).json({ code: "INVALID_CAPACITY", message: "La capacidad debe ser al menos 1" });
        }

        const event = await Event.findOne({
            where: { id: Number(eventId) },
            select: ["id", "user_id"]
        });

        if (!event) {
            return res.status(404).json({ code: "EVENT_NOT_FOUND", message: "Evento no encontrado" });
        }

        // Verificar que el usuario sea el dueño del evento
        if (event.user_id !== userId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para modificar este evento" });
        }

        const currentActiveCount = await TicketType.count({
            where: {
                eventId: event.id,
                status: TicketTypeStatus.ACTIVE
            }
        });
        const ttCheck = await canCreateTicketTypes(event.user_id, currentActiveCount + 1);
        if (!ttCheck.allowed) {
            return res.status(403).json({
                code: "PLAN_LIMIT_TICKET_TYPES",
                message: ttCheck.reason || "Ticket type limit reached"
            });
        }

        const ticketType = TicketType.create({
            eventId: event.id,
            name: name.trim(),
            description: description?.trim() || null,
            price: Number(price),
            capacity: Number(capacity)
        });

        await ticketType.save();

        return res.status(201).json(ticketType);

    } catch (error) {
        console.error("Error creating ticket type:", error);
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al crear tipo de ticket"
        });
    }
};

/* ======================================================
   GET TICKET TYPES BY EVENT
====================================================== */
export const getTicketTypesByEvent = async (req: Request, res: Response) => {
    try {
        const eventId = Number(req.params.eventId);
        if (isNaN(eventId) || eventId <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de evento inválido" });
        }

        const ticketTypes = await TicketType.find({
            where: {
                eventId,
                status: TicketTypeStatus.ACTIVE
            },
            order: {
                price: "ASC"
            },
            select: ["id", "name", "description", "price", "capacity", "soldCount", "status"]
        });

        return res.json(ticketTypes);

    } catch (error) {
        console.error("Error fetching ticket types:", error);
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al obtener tipos de ticket"
        });
    }
};

/* ======================================================
   UPDATE TICKET TYPE
====================================================== */
export const updateTicketType = async (req: CustomRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de ticket type inválido" });
        }

        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const ticketType = await TicketType.findOne({
            where: { id },
            relations: ["event"]
        });

        if (!ticketType) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Tipo de ticket no encontrado" });
        }

        // Verificar que el usuario sea el dueño del evento
        if (ticketType.event?.user_id !== userId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para modificar este ticket type" });
        }

        const {
            name,
            description,
            price,
            capacity,
            status
        } = req.body;

        // Regla clave: nunca permitir modificar soldCount
        if ("soldCount" in req.body) {
            return res.status(400).json({
                code: "FORBIDDEN_FIELD",
                message: "soldCount no puede ser modificado manualmente"
            });
        }

        // Validaciones
        if (price !== undefined && price < 0) {
            return res.status(400).json({ code: "INVALID_PRICE", message: "El precio no puede ser negativo" });
        }

        if (capacity !== undefined) {
            if (capacity < 1) {
                return res.status(400).json({ code: "INVALID_CAPACITY", message: "La capacidad debe ser al menos 1" });
            }
            if (capacity < ticketType.soldCount) {
                return res.status(400).json({
                    code: "CAPACITY_TOO_LOW",
                    message: `La capacidad no puede ser menor a los tickets vendidos (${ticketType.soldCount})`
                });
            }
        }

        // Actualizar solo los campos proporcionados
        if (name !== undefined) ticketType.name = name.trim();
        if (description !== undefined) ticketType.description = description?.trim() || null;
        if (price !== undefined) ticketType.price = Number(price);
        if (capacity !== undefined) ticketType.capacity = Number(capacity);
        if (status !== undefined && Object.values(TicketTypeStatus).includes(status)) {
            ticketType.status = status;
        }

        await ticketType.save();

        // Limpiar referencia circular antes de devolver
        delete (ticketType as any).event;

        return res.json(ticketType);

    } catch (error) {
        console.error("Error updating ticket type:", error);
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al actualizar tipo de ticket"
        });
    }
};

/* ======================================================
   DEACTIVATE TICKET TYPE (SOFT DELETE)
====================================================== */
export const deactivateTicketType = async (req: CustomRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de ticket type inválido" });
        }

        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const ticketType = await TicketType.findOne({
            where: { id },
            relations: ["event"]
        });

        if (!ticketType) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Tipo de ticket no encontrado" });
        }

        // Verificar que el usuario sea el dueño del evento
        if (ticketType.event?.user_id !== userId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para desactivar este ticket type" });
        }

        // Advertir si hay tickets vendidos
        if (ticketType.soldCount > 0) {
            console.warn(`Deactivating ticket type ${id} with ${ticketType.soldCount} sold tickets`);
        }

        ticketType.status = TicketTypeStatus.DISABLED;
        await ticketType.save();

        return res.sendStatus(204);

    } catch (error) {
        console.error("Error deactivating ticket type:", error);
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al desactivar tipo de ticket"
        });
    }
};

