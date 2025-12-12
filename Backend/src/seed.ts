import AppDataSource from "./db";
import { User } from "./user/user.entity";
import { Category } from "./category/category.entity";
import { Event } from "./event/event.entity";
import { Ticket, TicketStatus } from "./ticket/ticket.entity";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import bcrypt from "bcrypt";
import { log } from "console";
import { MoreThan } from "typeorm";

async function seed() {
    try {
        await AppDataSource.initialize();
        console.log("Database connected for seeding...");

        // Limpiar datos existentes (orden reverso por dependencias)
        await AppDataSource.getRepository(Ticket).delete({ id: MoreThan(0) });
        await AppDataSource.getRepository(Event).delete({ id: MoreThan(0) });
        await AppDataSource.getRepository(Category).delete({ id: MoreThan(0) });
        await AppDataSource.getRepository(User).delete({ id: MoreThan(0) });
        console.log("Existing data cleared.");

        // 1. Crear Categorías
        const categoriesData = ["Concierto", "Deportes", "Teatro", "Conferencia", "Fiesta"];
        const categories: Category[] = [];

        for (const name of categoriesData) {
            const category = new Category();
            category.name = name;
            await category.save();
            categories.push(category);
        }
        console.log(`Created ${categories.length} categories.`);

        // 2. Crear Usuarios
        const hashedPassword = await bcrypt.hash("1234", 10);

        // Admin
        const admin = new User();
        admin.firstname = "Admin";
        admin.lastname = "User";
        admin.email = "admin@test.com";
        admin.password = hashedPassword;
        admin.rol = "admin";
        admin.phone = "1111111111";
        admin.location = "Admin City";
        admin.birth = new Date("1990-01-01");
        admin.active = true;
        await admin.save();

        // User 1
        const user1 = new User();
        user1.firstname = "Juan";
        user1.lastname = "Perez";
        user1.email = "user1@test.com";
        user1.password = hashedPassword;
        user1.rol = "user";
        user1.phone = "2222222222";
        user1.location = "Buenos Aires";
        user1.birth = new Date("1995-05-15");
        user1.active = true;
        await user1.save();

        // User 2
        const user2 = new User();
        user2.firstname = "Maria";
        user2.lastname = "Garcia";
        user2.email = "user2@test.com";
        user2.password = hashedPassword;
        user2.rol = "user";
        user2.phone = "3333333333";
        user2.location = "Cordoba";
        user2.birth = new Date("1990-08-20");
        user2.active = true;
        await user2.save();

        // User 3
        const user3 = new User();
        user3.firstname = "Pedro";
        user3.lastname = "Garcia";
        user3.email = "user3@test.com";
        user3.password = hashedPassword;
        user3.rol = "user";
        user3.phone = "4444444444";
        user3.location = "Buenos Aires";
        user3.birth = new Date("1990-08-20");
        user3.active = true;
        await user3.save();

        // User 4
        const user4 = new User();
        user4.firstname = "Ana";
        user4.lastname = "Garcia";
        user4.email = "user4@test.com";
        user4.password = hashedPassword;
        user4.rol = "user";
        user4.phone = "5555555555";
        user4.location = "Cordoba";
        user4.birth = new Date("1990-08-20");
        user4.active = true;
        await user4.save();

        console.log("Created users: admin@test.com, user1@test.com (pass: 1234)");

        // 3. Crear Eventos
        const eventsData = [
            {
                title: "Rock in Rio 2025",
                description: "El festival de rock más grande del mundo.",
                date: new Date("2025-10-15"),
                time: "18:00",
                location: "Rio de Janeiro",
                image: "https://images.unsplash.com/photo-1459749411177-229323b4b62e",
                price: 15000,
                capacity: 5000,
                categoryIndex: 0, // Concierto
                creator: admin
            },
            {
                title: "Final Copa Libertadores",
                description: "El partido más esperado del año.",
                date: new Date("2025-11-20"),
                time: "21:00",
                location: "Estadio Monumental",
                image: "https://images.unsplash.com/photo-1518091043644-c1d4457512c6",
                price: 25000,
                capacity: 80000,
                categoryIndex: 1, // Deportes
                creator: user1
            },
            {
                title: "Tech Summit 2025",
                description: "Conferencia sobre el futuro de la IA.",
                date: new Date("2025-09-10"),
                time: "09:00",
                location: "Centro de Convenciones",
                image: "https://images.unsplash.com/photo-1544531696-60c35eb79836",
                price: 5000,
                capacity: 300,
                categoryIndex: 3, // Conferencia
                creator: admin
            },
            {
                title: "Concierto de Jazz",
                description: "Una noche de jazz con artistas locales.",
                date: new Date("2025-07-20"),
                time: "20:00",
                location: "Club de Jazz",
                image: "https://images.unsplash.com/photo-1507914482-b7b5e1b2c4e2",
                price: 3000,
                capacity: 150,
                categoryIndex: 0, // Concierto
                creator: user1
            },
            {
                title: "Festival de Diseño Urbano",
                description: "Una celebración del arte y la arquitectura en la ciudad.",
                date: new Date("2025-08-15"),
                time: "10:00",
                location: "Parque Central",
                image: "https://images.unsplash.com/photo-1533035353720-f1c6a2d97d51",
                price: 0,
                capacity: 1000,
                categoryIndex: 2, // Teatro (closest fit for cultural event)
                creator: user1
            },
            {
                title: "Maratón Internacional de la Ciudad",
                description: "Corre por tu salud y por la ciudad.",
                date: new Date("2025-10-05"),
                time: "07:00",
                location: "Punto de partida: Obelisco",
                image: "https://images.unsplash.com/photo-1552674610-d79ff4012e69",
                price: 1500,
                capacity: 10000,
                categoryIndex: 1, // Deportes
                creator: admin
            },
            {
                title: "Noche de Jazz en el Centro",
                description: "Disfruta de una velada musical con los mejores artistas locales.",
                date: new Date("2025-07-25"),
                time: "20:30",
                location: "Teatro Municipal",
                image: "https://images.unsplash.com/photo-1507914482-b7b5e1b2c4e2",
                price: 800,
                capacity: 200,
                categoryIndex: 2, // Teatro (closest fit for musical event in a theatre)
                creator: user1
            }
        ];

        for (const evtData of eventsData) {
            const event = new Event();
            event.title = evtData.title;
            event.description = evtData.description;
            event.date = evtData.date;
            event.time = evtData.time;
            event.location = evtData.location;
            event.image = evtData.image;
            event.price = evtData.price;
            event.capacity = evtData.capacity;
            event.active = true;
            event.destacado = true;

            // Relaciones
            const cat = categories[evtData.categoryIndex];
            event.category = cat;
            event.categoria_name = cat.name;

            event.usuario = evtData.creator;
            event.user_id = evtData.creator.id;
            event.organizer = `${evtData.creator.firstname} ${evtData.creator.lastname}`;

            await event.save();
        }
        console.log(`Created ${eventsData.length} events.`);

        // 4. Crear Tickets (Simular compra)
        console.log("Creating tickets...");
        // Buscar el evento "Rock in Rio"
        const rockEvent = await AppDataSource.getRepository(Event).findOne({ where: { title: "Rock in Rio 2025" } });
        // Buscar user1
        const buyerUser = await AppDataSource.getRepository(User).findOne({ where: { email: "user1@test.com" } });

        if (rockEvent && buyerUser) {
            const ticket = new Ticket();
            ticket.codigo_unico = randomUUID();
            // Mock QR generation without sending email
            const urlValidacion = `https://tusitio.com/validar/${ticket.codigo_unico}`;
            ticket.qrCode = await QRCode.toDataURL(urlValidacion);

            ticket.event = rockEvent;
            ticket.user = buyerUser;
            ticket.eventId = rockEvent.id;
            ticket.userId = buyerUser.id;
            ticket.titleEvent = rockEvent.title;

            // Nuevos campos
            ticket.status = TicketStatus.VALID;
            ticket.purchasePrice = rockEvent.price;

            await ticket.save();
            console.log("Created 1 valid ticket for Rock in Rio");
        }

        console.log("Seeding completed successfully!");
        process.exit(0);

    } catch (error) {
        console.error("Error seeding database:", error);
        process.exit(1);
    }
}

seed();
