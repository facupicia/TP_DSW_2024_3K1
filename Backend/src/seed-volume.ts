import { Client } from "pg";
import * as bcrypt from "bcrypt";
import { env } from "./config/env";

/**
 * Volume Seed Script
 * Genera datos masivos para testeo de performance y límites del server.
 * 
 * Uso: npx ts-node src/seed-volume.ts
 * 
 * Configuración por variables de entorno:
 *   VOLUME_USERS=1000        (default: 500)
 *   VOLUME_ORGANIZERS=50     (default: 20)
 *   VOLUME_EVENTS=200        (default: 100)
 *   VOLUME_TICKET_TYPES=500  (default: 300)
 *   VOLUME_TICKETS=5000      (default: 2000)
 *   VOLUME_PAYMENTS=5000     (default: 2000)
 *   VOLUME_BATCH_SIZE=1000   (default: 500)
 */

const config = {
    users: Number(env.VOLUME_USERS ?? 500),
    organizers: Number(env.VOLUME_ORGANIZERS ?? 20),
    events: Number(env.VOLUME_EVENTS ?? 100),
    ticketTypes: Number(env.VOLUME_TICKET_TYPES ?? 300),
    tickets: Number(env.VOLUME_TICKETS ?? 2000),
    payments: Number(env.VOLUME_PAYMENTS ?? 2000),
    batchSize: Number(env.VOLUME_BATCH_SIZE ?? 500),
};

const client = new Client({
    connectionString: env.DATABASE_URL || env.POSTGRES_URL,
});

let totalInserted = 0;

function progress(label: string, count: number) {
    totalInserted += count;
    console.log(`✅ ${label}: +${count} (total: ${totalInserted})`);
}

async function batchInsert(table: string, columns: string[], rows: any[][]) {
    if (rows.length === 0) return 0;
    const placeholders = rows.map((_, i) =>
        `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`
    ).join(", ");
    const flat = rows.flat();
    const cleanTable = table.replace(/"/g, '');
    const cleanCols = columns.map(c => c.replace(/"/g, ''));
    const query = `INSERT INTO "${cleanTable}" (${cleanCols.map(c => `"${c}"`).join(", ")}) VALUES ${placeholders} ON CONFLICT DO NOTHING`;
    const result = await client.query(query, flat);
    return result.rowCount || 0;
}

async function seedCategories() {
    const categories = [
        [1, 'Música'], [2, 'Deportes'], [3, 'Tecnología'],
        [4, 'Arte y Cultura'], [5, 'Gastronomía'],
        [6, 'Negocios'], [7, 'Entretenimiento'], [8, 'Educación']
    ];
    const count = await batchInsert('category', ['id', 'name'], categories);
    progress('Categories', count);
}

async function seedSubscriptionPlans() {
    const plans = [
        [1, 'FREE', 'Plan Gratuito', 0, 0, 3, 1, 8.00, '{"advancedDashboard":false}', true, 0],
        [2, 'STARTER', 'Starter', 9999, 99999, 5, 3, 5.00, '{"advancedDashboard":true}', true, 1],
        [3, 'PRO', 'Pro', 29999, 299999, -1, -1, 2.50, '{"advancedDashboard":true,"exportSales":true}', true, 2],
    ];
    const count = await batchInsert('subscription_plan',
        ['id', 'name', '"displayName"', '"monthlyPrice"', '"yearlyPrice"', '"maxEventsPerMonth"', '"maxTicketTypesPerEvent"', '"commissionPercent"', 'features', 'active', '"sortOrder"'],
        plans);
    progress('Subscription Plans', count);
}

async function seedRoles() {
    const roles = [[1, 'user'], [2, 'rrpp'], [3, 'scanner'], [4, 'organizer'], [5, 'admin']];
    const count = await batchInsert('role', ['id', 'name'], roles);
    progress('Roles', count);
}

async function seedUsers() {
    const hashedPassword = await bcrypt.hash('123456', 10);
    const users: any[][] = [];
    const now = new Date().toISOString();

    // Admin
    users.push([
        1, 'Admin', 'Sistema', 'admin@eventlife.com', '3510000000',
        'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png',
        'Argentina', 'Córdoba', 'Córdoba Capital', '', '1990-01-01',
        hashedPassword, true, false, now, now
    ]);

    // Organizers (IDs 2..organizers+1)
    for (let i = 0; i < config.organizers; i++) {
        const id = i + 2;
        users.push([
            id, `Organizer${id}`, 'Test', `organizer${id}@test.com`, `351${String(id).padStart(7, '0')}`,
            'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png',
            'Argentina', 'Córdoba', 'Córdoba Capital', '', '1985-01-01',
            hashedPassword, true, false, now, now
        ]);
    }

    // Regular users (IDs after organizers)
    const offset = config.organizers + 2;
    for (let i = 0; i < config.users; i++) {
        const id = offset + i;
        users.push([
            id, `User${id}`, 'Test', `user${id}@test.com`, `351${String(id).padStart(7, '0')}`,
            'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png',
            'Argentina', 'Córdoba', 'Córdoba Capital', '', '1995-01-01',
            hashedPassword, true, false, now, now
        ]);
    }

    const count = await batchInsert('"user"',
        ['id', 'firstname', 'lastname', 'email', 'phone', '"imgPerfil"', 'pais', 'provincia', 'ciudad', 'address', 'birth', 'password', 'active', '"isGuestAccount"', '"createdAt"', '"updatedAt"'],
        users);
    progress('Users', count);
}

async function seedUserRoles() {
    const rows: any[][] = [];
    // Admin -> admin role
    rows.push([1, 5]);
    // Organizers -> organizer role
    for (let i = 2; i <= config.organizers + 1; i++) {
        rows.push([i, 4]);
    }
    // Regular users -> user role
    const offset = config.organizers + 2;
    for (let i = 0; i < config.users; i++) {
        rows.push([offset + i, 1]);
    }
    const count = await batchInsert('user_roles', ['"userId"', '"roleId"'], rows);
    progress('User Roles', count);
}

async function seedUserSubscriptions() {
    const rows: any[][] = [];
    const now = new Date().toISOString();
    let id = 1;

    // Admin -> PRO
    rows.push([id++, 1, 3, 'active', 'monthly', now, null, now, now]);

    // Organizers -> mix de FREE, STARTER, PRO
    for (let i = 2; i <= config.organizers + 1; i++) {
        const planId = (i % 3) + 1; // 1, 2, 3 cíclico
        rows.push([id++, i, planId, 'active', 'monthly', now, null, now, now]);
    }

    // Regular users -> FREE
    const offset = config.organizers + 2;
    for (let i = 0; i < config.users; i++) {
        rows.push([id++, offset + i, 1, 'active', 'monthly', now, null, now, now]);
    }

    const count = await batchInsert('user_subscription',
        ['id', '"userId"', '"planId"', 'status', '"billingCycle"', '"currentPeriodStart"', '"currentPeriodEnd"', '"createdAt"', '"updatedAt"'],
        rows);
    progress('User Subscriptions', count);
}

async function seedEvents() {
    const rows: any[][] = [];
    const now = new Date().toISOString();
    const cities = ['Córdoba', 'Buenos Aires', 'Rosario', 'Mendoza', 'La Plata', 'Salta', 'Tucumán', 'Mar del Plata'];
    const categories = [1, 2, 3, 4, 5, 6, 7, 8];

    for (let i = 0; i < config.events; i++) {
        const id = i + 1;
        const organizerId = (i % config.organizers) + 2; // IDs 2..organizers+1
        const daysAhead = (i % 90) + 1; // Eventos desde mañana hasta 90 días
        const date = new Date();
        date.setDate(date.getDate() + daysAhead);
        const dateStr = date.toISOString().split('T')[0];
        const timeStr = `${String(18 + (i % 6)).padStart(2, '0')}:00`;
        const city = cities[i % cities.length];
        const categoryId = categories[i % categories.length];

        rows.push([
            id, `Evento ${id}`, `Descripción del evento número ${id}`,
            dateStr, timeStr, 18, `https://picsum.photos/800/400?random=${id}`,
            'Argentina', 'Provincia', city, `Dirección ${id}`,
            `Organizer ${organizerId}`, true, i % 5 === 0, // 20% destacados
            city === 'Córdoba', // isPublic
            categoryId, organizerId, now, now
        ]);
    }

    const count = await batchInsert('event',
        ['id', 'title', 'description', 'date', 'time', '"minAge"', 'image', 'pais', 'provincia', 'ciudad', 'direccion', 'organizer', 'active', 'destacado', '"isPublic"', '"categoryId"', '"user_id"', '"createdAt"', '"updatedAt"'],
        rows);
    progress('Events', count);
}

async function seedTicketTypes() {
    const rows: any[][] = [];
    const now = new Date().toISOString();
    const names = ['General', 'VIP', 'Early Bird', 'Estudiante', 'Pase Día', 'Backstage', 'Premium', 'Gratis'];
    let id = 1;

    for (let e = 0; e < config.events; e++) {
        const eventId = e + 1;
        const typesPerEvent = 1 + (e % 5); // 1 a 5 tipos por evento
        for (let t = 0; t < typesPerEvent && id <= config.ticketTypes; t++) {
            const price = t === 0 ? 0 : (t * 2500 + (e % 10) * 500);
            const capacity = 50 + (e % 20) * 50; // 50 a 1000
            const soldCount = Math.min(Math.floor(capacity * (e % 3) / 3), capacity); // 0%, 33%, 66% vendido
            rows.push([
                id++, eventId, names[t % names.length], `Tipo ${names[t % names.length]}`,
                price, capacity, soldCount, 'active', now, now
            ]);
        }
    }

    if (rows.length > 0) {
        const count = await batchInsert('ticket_type',
            ['id', '"eventId"', 'name', 'description', 'price', 'capacity', '"soldCount"', 'status', '"createdAt"', '"updatedAt"'],
            rows);
        progress('Ticket Types', count);
    }
}

async function seedTickets() {
    const rows: any[][] = [];
    const now = new Date().toISOString();
    const userOffset = config.organizers + 2; // Primer ID de usuario regular
    const totalUsers = config.users;

    for (let i = 0; i < config.tickets; i++) {
        const ticketTypeId = (i % config.ticketTypes) + 1;
        const userId = userOffset + (i % totalUsers);
        const price = (i % 8 === 0) ? 0 : ((i % 5) + 1) * 2500; // Algunos gratis
        const status = i % 10 === 0 ? 'used' : (i % 20 === 0 ? 'cancelled' : 'active');

        rows.push([
            i + 1,
            `TKT-${now}-${i}-${Math.random().toString(36).substring(2, 10)}`,
            `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`,
            ticketTypeId, userId, status,
            price, null, null, null,
            status === 'used' ? now : null, null, null, now, now
        ]);
    }

    const count = await batchInsert('ticket',
        ['id', 'codigo_unico', 'qrCode', '"ticketTypeId"', '"userId"', 'status', '"purchasePrice"', '"promoterCommissionPercentage"', '"promoterCommissionAmount"', 'promoterCode', '"usedAt"', '"scannedById"', '"soldByPromoterId"', '"createdAt"', '"updatedAt"'],
        rows);
    progress('Tickets', count);
}

async function seedPayments() {
    const rows: any[][] = [];
    const now = new Date().toISOString();
    const userOffset = config.organizers + 2;

    for (let i = 0; i < config.payments; i++) {
        const ticketTypeId = (i % config.ticketTypes) + 1;
        const userId = userOffset + (i % config.users);
        const qty = (i % 5) + 1;
        const unitPrice = ((i % 5) + 1) * 2500;
        const total = unitPrice * qty;
        const status = i % 10 === 0 ? 'failed' : (i % 20 === 0 ? 'refunded' : 'completed');
        const organizerId = ((i % config.events) % config.organizers) + 2;

        rows.push([
            i + 1, `MP-${now}-${i}`, null,
            userId, ticketTypeId, unitPrice, qty, total,
            8.00, total * 0.08, 'FREE',
            organizerId, status, now
        ]);
    }

    const count = await batchInsert('payment_log',
        ['id', '"mpPaymentId"', '"externalReference"', '"userId"', '"ticketTypeId"', '"unitPrice"', 'quantity', '"totalAmount"', '"commissionPercent"', '"commissionAmount"', '"organizerPlanName"', '"organizerId"', 'status', '"createdAt"'],
        rows);
    progress('Payments', count);
}

async function resetSequences() {
    const sequences = [
        'category_id_seq', 'subscription_plan_id_seq', 'role_id_seq',
        '"user"_id_seq', 'user_subscription_id_seq', 'event_id_seq',
        'ticket_type_id_seq', 'ticket_id_seq', 'payment_log_id_seq',
        'promoter_group_id_seq', 'promoter_event_assignment_id_seq'
    ];
    for (const seq of sequences) {
        try {
            const table = seq.replace('_id_seq', '').replace(/"/g, '');
            await client.query(`SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`);
        } catch (e) {
            // Some sequences might not exist, ignore
        }
    }
    console.log('✅ Sequences reset');
}

async function main() {
    console.log('\n🚀 Volume Seed Started');
    console.log('Config:', config);
    console.log('');

    await client.connect();
    console.log('Connected to DB\n');

    await seedCategories();
    await seedSubscriptionPlans();
    await seedRoles();
    await seedUsers();
    await seedUserRoles();
    await seedUserSubscriptions();
    await seedEvents();
    await seedTicketTypes();
    await seedTickets();
    await seedPayments();
    await resetSequences();

    await client.end();

    console.log('\n📊 Final Summary:');
    console.log(`Total records inserted: ${totalInserted}`);
    console.log('\n🎉 Volume seed completed!');
}

main().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
