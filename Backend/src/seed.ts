import AppDataSource from "./db";
import { User } from "./user/user.entity";
import { Category } from "./category/category.entity";
import { Event } from "./event/event.entity";
import { Ticket } from "./ticket/ticket.entity";
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

        console.log("Seeding completed successfully!");
        process.exit(0);

    } catch (error) {
        console.error("Error seeding database:", error);
        process.exit(1);
    }
}

seed();
