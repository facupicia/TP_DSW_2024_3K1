import "reflect-metadata";
import AppDataSource from "../../config/database";
import { User } from "../../user/user.entity";
import { Category } from "../../category/category.entity";
import { Event } from "../../event/event.entity";
import { TicketType, TicketTypeStatus } from "../../ticketType/ticketType.entity";
import { Ticket, TicketStatus } from "../../ticket/ticket.entity";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from 'uuid';

async function seed() {
    console.log("🌱 Iniciando seed de datos...");

    // Forzar dropSchema para reiniciar la base de datos completamente
    // Esto soluciona errores de sincronización cuando hay datos incompatibles
    Object.assign(AppDataSource.options, { dropSchema: true });

    await AppDataSource.initialize();
    console.log("✅ Base de datos conectada y reiniciada");

    // No necesitamos borrar manualmente si usamos dropSchema: true, 
    // pero mantenemos el log para consistencia
    console.log("🧹 Datos anteriores limpiados");

    // ===========================================
    // CATEGORÍAS
    // ===========================================
    const categoriasData = [
        { name: "Música" },
        { name: "Deportes" },
        { name: "Teatro" },
        { name: "Conferencias" },
        { name: "Tecnología" },
        { name: "Gastronomía" },
        { name: "Arte" },
        { name: "Networking" }
    ];

    const categoriasCreadas: Category[] = [];
    for (const cat of categoriasData) {
        const categoria = new Category();
        categoria.name = cat.name;
        await AppDataSource.getRepository(Category).save(categoria);
        categoriasCreadas.push(categoria);
    }
    console.log(`📂 ${categoriasCreadas.length} categorías creadas`);

    // ===========================================
    // USUARIOS
    // ===========================================
    const hashedPassword = await bcrypt.hash("123456", 10);

    const usuariosData = [
        { firstname: "Admin", lastname: "Sistema", email: "admin@eventlife.com", phone: "3513456789", pais: "Argentina", provincia: "Córdoba", ciudad: "Córdoba", address: "Av. San Martín 500", birth: new Date("1990-01-15"), rol: "admin" },
        { firstname: "María", lastname: "González", email: "maria@gmail.com", phone: "3514567890", pais: "Argentina", provincia: "Buenos Aires", ciudad: "Buenos Aires", address: "Av. Corrientes 1234", birth: new Date("1995-06-20"), rol: "user" },
        { firstname: "Juan", lastname: "Pérez", email: "juan@gmail.com", phone: "3515678901", pais: "Argentina", provincia: "Córdoba", ciudad: "Villa María", address: "Calle San Martín 456", birth: new Date("2000-03-10"), rol: "user" },
        { firstname: "Ana", lastname: "Rodríguez", email: "ana@gmail.com", phone: "3516789012", pais: "Argentina", provincia: "Santa Fe", ciudad: "Rosario", address: "Bv. Oroño 789", birth: new Date("1988-11-25"), rol: "user" },
        { firstname: "Carlos", lastname: "López", email: "carlos@gmail.com", phone: "3517890123", pais: "Argentina", provincia: "Mendoza", ciudad: "Mendoza", address: "Calle Las Heras 321", birth: new Date("2005-08-05"), rol: "user" },
        { firstname: "Laura", lastname: "Martínez", email: "laura@gmail.com", phone: "3518901234", pais: "Argentina", provincia: "Córdoba", ciudad: "Río Cuarto", address: "Av. Italia 654", birth: new Date("1998-02-14"), rol: "scanner" },
        { firstname: "Diego", lastname: "Fernández", email: "diego@gmail.com", phone: "3519012345", pais: "Argentina", provincia: "Buenos Aires", ciudad: "La Plata", address: "Calle 7 N° 890", birth: new Date("1992-07-30"), rol: "user" },
        { firstname: "Sofía", lastname: "Ramírez", email: "sofia@gmail.com", phone: "3510123456", pais: "Argentina", provincia: "Córdoba", ciudad: "Carlos Paz", address: "Av. San Martín 123", birth: new Date("2003-12-01"), rol: "user" }
    ];

    const usuariosCreados: User[] = [];
    for (const userData of usuariosData) {
        const user = new User();
        user.firstname = userData.firstname;
        user.lastname = userData.lastname;
        user.email = userData.email;
        user.password = hashedPassword;
        user.phone = userData.phone;
        user.pais = userData.pais;
        user.provincia = userData.provincia;
        user.ciudad = userData.ciudad;
        user.address = userData.address;
        user.birth = userData.birth;
        user.rol = userData.rol;
        await AppDataSource.getRepository(User).save(user);
        usuariosCreados.push(user);
    }
    console.log(`👥 ${usuariosCreados.length} usuarios creados`);

    // ===========================================
    // EVENTOS
    // ===========================================
    const eventosData = [
        { title: "Festival de Rock 2026", pais: "Argentina", provincia: "Córdoba", ciudad: "Córdoba", direccion: "Estadio Kempes", organizer: "Rock Productions", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800", date: new Date("2026-03-15"), time: "20:00", description: "El festival de rock más grande de la región.", destacado: true, minAge: 18, userIndex: 0, categoryIndex: 0 },
        { title: "Conferencia Tech 2026", pais: "Argentina", provincia: "Buenos Aires", ciudad: "Buenos Aires", direccion: "Centro de Convenciones", organizer: "Tech Argentina", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800", date: new Date("2026-04-20"), time: "09:00", description: "La conferencia de tecnología más importante.", destacado: true, minAge: 0, userIndex: 1, categoryIndex: 4 },
        { title: "Partido Argentina vs Brasil", pais: "Argentina", provincia: "Buenos Aires", ciudad: "Buenos Aires", direccion: "Estadio Monumental", organizer: "AFA", image: "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800", date: new Date("2026-05-10"), time: "21:00", description: "Clásico sudamericano.", destacado: true, minAge: 0, userIndex: 0, categoryIndex: 1 },
        { title: "Obra: El Fantasma de la Ópera", pais: "Argentina", provincia: "Buenos Aires", ciudad: "Buenos Aires", direccion: "Teatro Colón", organizer: "Teatro Colón", image: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800", date: new Date("2026-06-05"), time: "20:30", description: "El clásico musical de Andrew Lloyd Webber.", destacado: false, minAge: 10, userIndex: 1, categoryIndex: 2 },
        { title: "Festival Gastronómico Córdoba", pais: "Argentina", provincia: "Córdoba", ciudad: "Córdoba", direccion: "Paseo del Buen Pastor", organizer: "Sabores Cordobeses", image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800", date: new Date("2026-07-12"), time: "12:00", description: "Degustación de platos típicos cordobeses.", destacado: false, minAge: 0, userIndex: 3, categoryIndex: 5 },
        { title: "Exposición de Arte Moderno", pais: "Argentina", provincia: "Santa Fe", ciudad: "Rosario", direccion: "Museo Castagnino", organizer: "Secretaría de Cultura", image: "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=800", date: new Date("2026-08-01"), time: "10:00", description: "Colección de arte moderno latinoamericano.", destacado: false, minAge: 0, userIndex: 3, categoryIndex: 6 },
        { title: "Startup Weekend Mendoza", pais: "Argentina", provincia: "Mendoza", ciudad: "Mendoza", direccion: "Espacio Cultural Julio Le Parc", organizer: "Endeavor Mendoza", image: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800", date: new Date("2026-09-22"), time: "18:00", description: "54 horas para lanzar tu startup.", destacado: true, minAge: 18, userIndex: 6, categoryIndex: 7 },
        { title: "Concierto Sinfónico", pais: "Argentina", provincia: "Córdoba", ciudad: "Carlos Paz", direccion: "Teatro Municipal", organizer: "Orquesta Sinfónica de Córdoba", image: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800", date: new Date("2026-10-15"), time: "21:00", description: "Programa: Beethoven, Mozart y Tchaikovsky.", destacado: false, minAge: 0, userIndex: 7, categoryIndex: 0 }
    ];

    const eventosCreados: Event[] = [];
    for (const evData of eventosData) {
        const evento = new Event();
        evento.title = evData.title;
        evento.pais = evData.pais;
        evento.provincia = evData.provincia;
        evento.ciudad = evData.ciudad;
        evento.direccion = evData.direccion;
        evento.organizer = evData.organizer;
        evento.image = evData.image;
        evento.date = evData.date;
        evento.time = evData.time;
        evento.description = evData.description;
        evento.destacado = evData.destacado;
        evento.minAge = evData.minAge;
        evento.user_id = usuariosCreados[evData.userIndex].id;
        evento.categoryId = categoriasCreadas[evData.categoryIndex].id;
        await AppDataSource.getRepository(Event).save(evento);
        eventosCreados.push(evento);
    }
    console.log(`🎉 ${eventosCreados.length} eventos creados`);

    // ===========================================
    // TICKET TYPES
    // ===========================================
    const ticketTypesData = [
        { eventIndex: 0, name: "General", description: "Acceso general", price: 5000, capacity: 5000, soldCount: 150 },
        { eventIndex: 0, name: "VIP", description: "Acceso VIP con barra libre", price: 15000, capacity: 500, soldCount: 45 },
        { eventIndex: 0, name: "Campo", description: "Acceso al campo", price: 8000, capacity: 2000, soldCount: 80 },
        { eventIndex: 1, name: "Estándar", description: "Acceso a charlas", price: 3000, capacity: 1000, soldCount: 200 },
        { eventIndex: 1, name: "Premium", description: "Incluye workshops", price: 8000, capacity: 200, soldCount: 50 },
        { eventIndex: 2, name: "Popular", description: "Tribuna popular", price: 2000, capacity: 30000, soldCount: 25000 },
        { eventIndex: 2, name: "Platea Baja", description: "Platea baja", price: 8000, capacity: 10000, soldCount: 3500 },
        { eventIndex: 2, name: "Platea Alta", description: "Platea alta", price: 5000, capacity: 15000, soldCount: 8000 },
        { eventIndex: 3, name: "Pullman", description: "Sector pullman", price: 4000, capacity: 500, soldCount: 120 },
        { eventIndex: 3, name: "Platea", description: "Platea central", price: 8000, capacity: 300, soldCount: 85 },
        { eventIndex: 4, name: "Entrada", description: "Acceso al festival", price: 1500, capacity: 2000, soldCount: 350 },
        { eventIndex: 4, name: "Entrada + Degustación", description: "Incluye degustaciones", price: 3500, capacity: 500, soldCount: 120 },
        { eventIndex: 5, name: "General", description: "Entrada general", price: 500, capacity: 300, soldCount: 45 },
        { eventIndex: 5, name: "Visita Guiada", description: "Con guía", price: 1200, capacity: 50, soldCount: 12 },
        { eventIndex: 6, name: "Participante", description: "Incluye comidas", price: 2500, capacity: 100, soldCount: 65 },
        { eventIndex: 6, name: "Mentor", description: "Acceso mentor", price: 0, capacity: 20, soldCount: 8 },
        { eventIndex: 7, name: "General", description: "Entrada general", price: 2000, capacity: 400, soldCount: 180 },
        { eventIndex: 7, name: "Preferencial", description: "Primeras filas", price: 4000, capacity: 100, soldCount: 35 }
    ];

    const ticketTypesCreados: TicketType[] = [];
    for (const ttData of ticketTypesData) {
        const tt = new TicketType();
        tt.eventId = eventosCreados[ttData.eventIndex].id;
        tt.name = ttData.name;
        tt.description = ttData.description;
        tt.price = ttData.price;
        tt.capacity = ttData.capacity;
        tt.soldCount = ttData.soldCount;
        tt.status = TicketTypeStatus.ACTIVE;
        await AppDataSource.getRepository(TicketType).save(tt);
        ticketTypesCreados.push(tt);
    }
    console.log(`🎫 ${ticketTypesCreados.length} tipos de ticket creados`);

    // ===========================================
    // TICKETS
    // ===========================================
    const compras = [
        { userIndex: 1, ttIndex: 0, status: TicketStatus.ACTIVE },
        { userIndex: 1, ttIndex: 3, status: TicketStatus.USED },
        { userIndex: 2, ttIndex: 0, status: TicketStatus.ACTIVE },
        { userIndex: 2, ttIndex: 1, status: TicketStatus.ACTIVE },
        { userIndex: 2, ttIndex: 5, status: TicketStatus.USED },
        { userIndex: 3, ttIndex: 6, status: TicketStatus.ACTIVE },
        { userIndex: 3, ttIndex: 8, status: TicketStatus.ACTIVE },
        { userIndex: 4, ttIndex: 0, status: TicketStatus.ACTIVE },
        { userIndex: 4, ttIndex: 5, status: TicketStatus.ACTIVE },
        { userIndex: 4, ttIndex: 14, status: TicketStatus.ACTIVE },
        { userIndex: 6, ttIndex: 3, status: TicketStatus.ACTIVE },
        { userIndex: 6, ttIndex: 4, status: TicketStatus.USED },
        { userIndex: 7, ttIndex: 10, status: TicketStatus.ACTIVE },
        { userIndex: 7, ttIndex: 12, status: TicketStatus.ACTIVE }
    ];

    let ticketCount = 0;
    for (const c of compras) {
        const tt = ticketTypesCreados[c.ttIndex];
        const ticket = new Ticket();
        ticket.userId = usuariosCreados[c.userIndex].id;
        ticket.ticketTypeId = tt.id;
        ticket.purchasePrice = tt.price;
        ticket.status = c.status;
        ticket.codigo_unico = uuidv4().substring(0, 8).toUpperCase();
        ticket.qrCode = `data:image/png;base64,QR_${uuidv4()}`;
        ticket.usedAt = c.status === TicketStatus.USED ? new Date() : null;
        await AppDataSource.getRepository(Ticket).save(ticket);
        ticketCount++;
    }
    console.log(`🎟️ ${ticketCount} tickets creados`);

    // ===========================================
    // RESUMEN
    // ===========================================
    console.log("\n========================================");
    console.log("✅ SEED COMPLETADO EXITOSAMENTE");
    console.log("========================================");
    console.log(`📂 Categorías: ${categoriasCreadas.length}`);
    console.log(`👥 Usuarios: ${usuariosCreados.length}`);
    console.log(`🎉 Eventos: ${eventosCreados.length}`);
    console.log(`🎫 Tipos de Ticket: ${ticketTypesCreados.length}`);
    console.log(`🎟️ Tickets: ${ticketCount}`);
    console.log("========================================");
    console.log("\n👤 Usuario Admin:");
    console.log("   Email: admin@eventlife.com");
    console.log("   Password: 123456");
    console.log("\n👤 Usuarios de prueba:");
    console.log("   Email: maria@gmail.com / Password: 123456");
    console.log("   Email: juan@gmail.com / Password: 123456");
    console.log("========================================\n");

    await AppDataSource.destroy();
    console.log("🔌 Conexión cerrada");
    process.exit(0);
}

seed().catch(error => {
    console.error("❌ Error en seed:", error);
    process.exit(1);
});
