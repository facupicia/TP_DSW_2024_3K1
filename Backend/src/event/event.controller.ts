import { Event } from "./event.entity"
import { Request, Response } from "express"
import { User } from "../user/user.entity";
import { CustomRequest } from "../middlewares/authToken";
import { Category } from "../category/category.entity";
import { log } from "console";



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
        const event = await Event.findOneBy({ id: parseInt(req.params.id) })

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

        const eventos = await Event.find({ where: { usuario: { id: user.id } } });

        res.json(eventos);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener eventos' });
    }
}

export const getEvent = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const event = await Event.findOneBy({ id: parseInt(id) });

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
        const events = await Event.find();

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
        const result = await Event.delete({ id: parseInt(id) });

        if (result.affected === 0)
            return res.status(404).json({ message: "User not found" });

        return res.sendStatus(204);
    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
    }
};

