/**
 * Volume seed for local/load testing.
 *
 * Run examples:
 *   npm run seed:volume
 *   SEED_VOLUME_TICKETS=10000 SEED_VOLUME_EVENTS=250 npm run seed:volume
 *
 * The generated dataset uses LOAD-prefixed emails/codes/titles and is deleted
 * before each run, so it can be regenerated without touching hand-made data.
 */
import "reflect-metadata";
import bcrypt from "bcrypt";
import { In } from "typeorm";
import AppDataSource from "./config/database";
import { Category } from "./category/category.entity";
import { Coupon } from "./coupon/coupon.entity";
import { Event } from "./event/event.entity";
import { PaymentLog, PaymentStatus } from "./payment/payment.entity";
import { PromoterEventAssignment, PromoterGroup } from "./promoter/promoter.entity";
import { SubscriptionPlan } from "./subscription/subscription_plan.entity";
import { SubscriptionStatus, UserSubscription } from "./subscription/user_subscription.entity";
import { Ticket, TicketStatus } from "./ticket/ticket.entity";
import { TicketType, TicketTypeStatus } from "./ticketType/ticketType.entity";
import { Role } from "./user/role.entity";
import { User } from "./user/user.entity";

const LOAD_EMAIL_DOMAIN = "eventlife.load.local";
const LOAD_EVENT_PREFIX = "[LOAD]";
const LOAD_TICKET_PREFIX = "LOAD-";
const DEFAULT_PASSWORD = "123456";
const QR_PLACEHOLDER =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

type SeedConfig = {
    organizers: number;
    buyers: number;
    promoters: number;
    scanners: number;
    events: number;
    tickets: number;
};

type GeneratedUser = {
    key: string;
    firstname: string;
    lastname: string;
    email: string;
    phone: string;
    ciudad: string;
    provincia: string;
    roles: string[];
};

const firstnames = [
    "Agustin", "Camila", "Bruno", "Valentina", "Santiago", "Julieta", "Mateo", "Martina",
    "Nicolas", "Florencia", "Tomas", "Catalina", "Luciano", "Micaela", "Facundo", "Paula",
    "Ignacio", "Rocio", "Emiliano", "Bianca"
];

const lastnames = [
    "Alvarez", "Benitez", "Castro", "Dominguez", "Escobar", "Ferreyra", "Gimenez", "Herrera",
    "Ibarra", "Juarez", "Molina", "Navarro", "Ortega", "Paz", "Quiroga", "Roldan",
    "Silva", "Toledo", "Vargas", "Zarate"
];

const locations = [
    { provincia: "Córdoba", ciudad: "Córdoba", direccion: "Av. Colón 1200" },
    { provincia: "Córdoba", ciudad: "Villa María", direccion: "Bv. Sarmiento 450" },
    { provincia: "Buenos Aires", ciudad: "Buenos Aires", direccion: "Av. Corrientes 1600" },
    { provincia: "Buenos Aires", ciudad: "La Plata", direccion: "Calle 50 820" },
    { provincia: "Santa Fe", ciudad: "Rosario", direccion: "Bv. Orono 900" },
    { provincia: "Mendoza", ciudad: "Mendoza", direccion: "San Martin 700" },
    { provincia: "Tucumán", ciudad: "San Miguel de Tucumán", direccion: "24 de Septiembre 500" },
    { provincia: "Salta", ciudad: "Salta", direccion: "Balcarce 350" }
];

const eventKinds = [
    { category: "Música", title: "Noche Indie", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800" },
    { category: "Deportes", title: "Desafio Urbano", image: "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800" },
    { category: "Tecnología", title: "Tech Summit", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800" },
    { category: "Arte y Cultura", title: "Circuito Cultural", image: "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=800" },
    { category: "Gastronomía", title: "Feria de Sabores", image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800" },
    { category: "Negocios", title: "Expo Negocios", image: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800" },
    { category: "Entretenimiento", title: "Comedy Club", image: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800" },
    { category: "Educación", title: "Workshop Intensivo", image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=800" }
];

function numberFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function getConfig(): SeedConfig {
    return {
        organizers: numberFromEnv("SEED_VOLUME_ORGANIZERS", 20),
        buyers: numberFromEnv("SEED_VOLUME_BUYERS", 250),
        promoters: numberFromEnv("SEED_VOLUME_PROMOTERS", 40),
        scanners: numberFromEnv("SEED_VOLUME_SCANNERS", 12),
        events: numberFromEnv("SEED_VOLUME_EVENTS", 160),
        tickets: numberFromEnv("SEED_VOLUME_TICKETS", 5000)
    };
}

function chunk<T>(items: T[], size = 500): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function pick<T>(items: T[], index: number): T {
    return items[index % items.length];
}

function money(value: number): number {
    return Number(value.toFixed(2));
}

function makeUsers(config: SeedConfig): GeneratedUser[] {
    const users: GeneratedUser[] = [];

    const make = (kind: string, count: number, roles: string[]) => {
        for (let i = 1; i <= count; i++) {
            const index = users.length + 1;
            const location = pick(locations, index);
            users.push({
                key: `${kind}-${i}`,
                firstname: pick(firstnames, index),
                lastname: pick(lastnames, index + 3),
                email: `load.${kind}.${String(i).padStart(4, "0")}@${LOAD_EMAIL_DOMAIN}`,
                phone: `351${String(7000000 + index).padStart(7, "0")}`,
                provincia: location.provincia,
                ciudad: location.ciudad,
                roles
            });
        }
    };

    make("organizer", config.organizers, ["user", "organizer"]);
    make("buyer", config.buyers, ["user"]);
    make("promoter", config.promoters, ["user", "rrpp"]);
    make("scanner", config.scanners, ["user", "scanner"]);

    return users;
}

async function ensureRole(name: string): Promise<Role> {
    const repo = AppDataSource.getRepository(Role);
    let role = await repo.findOne({ where: { name } });
    if (!role) {
        role = repo.create({ name });
        await repo.save(role);
    }
    return role;
}

async function ensureCategory(name: string): Promise<Category> {
    const repo = AppDataSource.getRepository(Category);
    let category = await repo.findOne({ where: { name } });
    if (!category) {
        category = repo.create({ name });
        await repo.save(category);
    }
    return category;
}

async function ensurePlan(name: string, displayName: string, commissionPercent: number): Promise<SubscriptionPlan> {
    const repo = AppDataSource.getRepository(SubscriptionPlan);
    let plan = await repo.findOne({ where: { name } });
    if (!plan) {
        plan = repo.create({
            name,
            displayName,
            monthlyPrice: name === "FREE" ? 0 : name === "STARTER" ? 9999 : 29999,
            yearlyPrice: name === "FREE" ? 0 : name === "STARTER" ? 99999 : 299999,
            maxEventsPerMonth: name === "FREE" ? 1 : name === "STARTER" ? 5 : -1,
            maxTicketTypesPerEvent: name === "FREE" ? 1 : name === "STARTER" ? 3 : -1,
            commissionPercent,
            features: {
                advancedDashboard: name !== "FREE",
                exportSales: name === "PRO",
                featuredEvents: name === "PRO",
                prioritySupport: name === "PRO"
            },
            active: true,
            sortOrder: name === "FREE" ? 1 : name === "STARTER" ? 2 : 3
        });
        await repo.save(plan);
    }
    return plan;
}

async function syncPrimaryKeySequence(tableName: string) {
    await AppDataSource.query(
        `
        SELECT setval(
            pg_get_serial_sequence($1, 'id'),
            COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1,
            false
        )
        `,
        [tableName]
    );
}

async function syncSequences() {
    const tables = [
        "role",
        "category",
        "subscription_plan",
        "\"user\"",
        "user_subscription",
        "event",
        "ticket_type",
        "promoter_group",
        "promoter_event_assignment",
        "ticket",
        "payment_log",
        "coupon"
    ];

    for (const tableName of tables) {
        await syncPrimaryKeySequence(tableName);
    }
}

async function cleanPreviousLoadData() {
    const runner = AppDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
        const generatedEvents = await runner.manager.query(
            `SELECT id FROM event WHERE title LIKE $1`,
            [`${LOAD_EVENT_PREFIX}%`]
        );
        const generatedUsers = await runner.manager.query(
            `SELECT id FROM "user" WHERE email LIKE $1`,
            [`load.%@${LOAD_EMAIL_DOMAIN}`]
        );
        const eventIds = generatedEvents.map((row: { id: number }) => row.id);
        const userIds = generatedUsers.map((row: { id: number }) => row.id);

        await runner.manager.query(
            `DELETE FROM payment_log WHERE "mpPaymentId" LIKE $1 OR "externalReference" LIKE $2`,
            ["LOAD-MP-%", "LOAD-EXT-%"]
        );

        if (eventIds.length > 0) {
            await runner.manager.query(
                `DELETE FROM payment_log WHERE "ticketTypeId" IN (
                    SELECT id FROM ticket_type WHERE "eventId" = ANY($1)
                )`,
                [eventIds]
            );
        }

        if (userIds.length > 0) {
            await runner.manager.query(
                `DELETE FROM payment_log WHERE "userId" = ANY($1) OR "organizerId" = ANY($1)`,
                [userIds]
            );
        }

        await runner.manager.query(`DELETE FROM ticket WHERE "codigo_unico" LIKE $1`, [`${LOAD_TICKET_PREFIX}%`]);

        if (userIds.length > 0) {
            await runner.manager.query(
                `DELETE FROM ticket
                 WHERE "userId" = ANY($1)
                    OR "soldByPromoterId" = ANY($1)
                    OR "scannedById" = ANY($1)`,
                [userIds]
            );
        }

        await runner.manager.query(`DELETE FROM coupon WHERE code LIKE $1`, ["LOAD-%"]);

        if (eventIds.length > 0) {
            await runner.manager.query(
                `DELETE FROM promoter_event_assignment WHERE "eventId" = ANY($1)`,
                [eventIds]
            );
            await runner.manager.query(`DELETE FROM ticket_type WHERE "eventId" = ANY($1)`, [eventIds]);
            await runner.manager.query(`DELETE FROM event WHERE id = ANY($1)`, [eventIds]);
        }

        await runner.manager.query(
            `DELETE FROM promoter_event_assignment WHERE "promoterGroupId" IN (
                SELECT id FROM promoter_group WHERE "promoterCode" LIKE $1
            )`,
            ["LOAD-%"]
        );
        await runner.manager.query(`DELETE FROM promoter_group WHERE "promoterCode" LIKE $1`, ["LOAD-%"]);

        if (userIds.length > 0) {
            await runner.manager.query(`DELETE FROM user_subscription WHERE "userId" = ANY($1)`, [userIds]);
            await runner.manager.query(`DELETE FROM user_roles WHERE "userId" = ANY($1)`, [userIds]);
            await runner.manager.query(`DELETE FROM "user" WHERE id = ANY($1)`, [userIds]);
        }

        await runner.commitTransaction();
    } catch (error) {
        await runner.rollbackTransaction();
        throw error;
    } finally {
        await runner.release();
    }
}

async function seedVolume() {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_VOLUME_SEED !== "true") {
        throw new Error(
            "Refusing to run volume seed in production. Set ALLOW_PRODUCTION_VOLUME_SEED=true if this is intentional."
        );
    }

    const config = getConfig();
    console.log("[seed:volume] Starting with config:", config);

    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }

    await cleanPreviousLoadData();
    await syncSequences();
    console.log("[seed:volume] Previous LOAD dataset removed.");

    const roles = new Map<string, Role>();
    for (const name of ["user", "rrpp", "scanner", "organizer", "admin"]) {
        roles.set(name, await ensureRole(name));
    }

    const categories = new Map<string, Category>();
    for (const kind of eventKinds) {
        categories.set(kind.category, await ensureCategory(kind.category));
    }

    const plans = {
        FREE: await ensurePlan("FREE", "Gratis", 15),
        STARTER: await ensurePlan("STARTER", "Starter", 10),
        PRO: await ensurePlan("PRO", "Pro", 5)
    };

    const usersData = makeUsers(config);
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const now = new Date();

    const userRows = usersData.map((user, index) => ({
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        phone: user.phone,
        imgPerfil: "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png",
        pais: "Argentina",
        provincia: user.provincia,
        ciudad: user.ciudad,
        address: `${pick(locations, index).direccion} - LOAD ${index + 1}`,
        birth: addDays(new Date("1982-01-01"), index * 37),
        password: hashedPassword,
        active: true,
        createdAt: addDays(now, -((index % 120) + 1)),
        updatedAt: now
    }));

    for (const rows of chunk(userRows)) {
        await AppDataSource.getRepository(User).insert(rows);
    }

    const insertedUsers = await AppDataSource.getRepository(User).find({
        where: { email: In(usersData.map(user => user.email)) }
    });
    const usersByEmail = new Map(insertedUsers.map(user => [user.email, user]));
    const usersByKey = new Map<string, User>();
    const userRoleRows: Array<{ userId: number; roleId: number }> = [];

    for (const userData of usersData) {
        const user = usersByEmail.get(userData.email);
        if (!user) continue;
        usersByKey.set(userData.key, user);
        for (const roleName of userData.roles) {
            const role = roles.get(roleName);
            if (!role) continue;
            userRoleRows.push({ userId: user.id, roleId: role.id });
        }
    }

    for (const rows of chunk(userRoleRows, 1000)) {
        await AppDataSource.query(
            `INSERT INTO user_roles ("userId", "roleId")
             SELECT * FROM UNNEST($1::int[], $2::int[])
             ON CONFLICT DO NOTHING`,
            [rows.map(row => row.userId), rows.map(row => row.roleId)]
        );
    }

    const subscriptionRows = usersData
        .map((userData, index) => {
            const user = usersByKey.get(userData.key);
            if (!user) return null;
            const isOrganizer = userData.roles.includes("organizer");
            const selectedPlan = isOrganizer
                ? index % 3 === 0 ? plans.PRO : index % 3 === 1 ? plans.STARTER : plans.FREE
                : plans.FREE;

            return {
                userId: user.id,
                planId: selectedPlan.id,
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart: addDays(now, -30),
                currentPeriodEnd: selectedPlan.name === "FREE" ? null : addDays(now, 335),
                externalSubscriptionId: selectedPlan.name === "FREE" ? null : `LOAD-SUB-${user.id}`,
                cancelledAt: null,
                billingCycle: selectedPlan.name === "PRO" ? "annual" : "monthly",
                createdAt: addDays(now, -30),
                updatedAt: now
            };
        })
        .filter(Boolean);

    for (const rows of chunk(subscriptionRows)) {
        await AppDataSource.getRepository(UserSubscription).insert(rows as any[]);
    }

    const organizerUsers = usersData
        .filter(user => user.roles.includes("organizer"))
        .map(user => usersByKey.get(user.key))
        .filter(Boolean) as User[];
    const buyerUsers = usersData
        .filter(user => user.key.startsWith("buyer-"))
        .map(user => usersByKey.get(user.key))
        .filter(Boolean) as User[];
    const promoterUsers = usersData
        .filter(user => user.roles.includes("rrpp"))
        .map(user => usersByKey.get(user.key))
        .filter(Boolean) as User[];
    const scannerUsers = usersData
        .filter(user => user.roles.includes("scanner"))
        .map(user => usersByKey.get(user.key))
        .filter(Boolean) as User[];

    const eventRows = Array.from({ length: config.events }, (_, index) => {
        const kind = pick(eventKinds, index);
        const location = pick(locations, index + 2);
        const organizer = pick(organizerUsers, index);
        const eventNumber = index + 1;
        const date = addDays(now, -45 + (index % 260));

        return {
            title: `${LOAD_EVENT_PREFIX} ${kind.title} ${String(eventNumber).padStart(4, "0")}`,
            pais: "Argentina",
            provincia: location.provincia,
            ciudad: location.ciudad,
            direccion: location.direccion,
            organizer: `${organizer.firstname} ${organizer.lastname} Producciones`,
            image: kind.image,
            date,
            time: `${String(18 + (index % 6)).padStart(2, "0")}:00`,
            description: `Evento generado para pruebas de volumen. Lote ${eventNumber}.`,
            active: true,
            destacado: index % 9 === 0,
            minAge: index % 5 === 0 ? 18 : 0,
            isPublic: true,
            user_id: organizer.id,
            categoryId: categories.get(kind.category)?.id
        };
    });

    for (const rows of chunk(eventRows)) {
        await AppDataSource.getRepository(Event).insert(rows);
    }

    const insertedEvents = await AppDataSource.getRepository(Event).find({
        where: { title: In(eventRows.map(event => event.title)) },
        order: { id: "ASC" }
    });

    const ticketTypeRows = insertedEvents.flatMap((event, eventIndex) => {
        const baseCapacity = 600 + ((eventIndex % 8) * 125);
        return [
            {
                eventId: event.id,
                name: "General",
                description: "Acceso general",
                price: 2500 + ((eventIndex % 9) * 700),
                capacity: baseCapacity,
                soldCount: 0,
                status: TicketTypeStatus.ACTIVE
            },
            {
                eventId: event.id,
                name: "Preferencial",
                description: "Sector preferencial",
                price: 6000 + ((eventIndex % 7) * 900),
                capacity: Math.floor(baseCapacity * 0.35),
                soldCount: 0,
                status: TicketTypeStatus.ACTIVE
            },
            {
                eventId: event.id,
                name: "VIP",
                description: "Acceso VIP",
                price: 12000 + ((eventIndex % 6) * 1400),
                capacity: Math.floor(baseCapacity * 0.12),
                soldCount: 0,
                status: TicketTypeStatus.ACTIVE
            }
        ];
    });

    for (const rows of chunk(ticketTypeRows)) {
        await AppDataSource.getRepository(TicketType).insert(rows);
    }

    const ticketTypes = await AppDataSource.getRepository(TicketType).find({
        where: { eventId: In(insertedEvents.map(event => event.id)) },
        order: { id: "ASC" }
    });
    const ticketTypesByEvent = new Map<number, TicketType[]>();
    const eventsById = new Map(insertedEvents.map(event => [event.id, event]));
    for (const ticketType of ticketTypes) {
        const list = ticketTypesByEvent.get(ticketType.eventId) || [];
        list.push(ticketType);
        ticketTypesByEvent.set(ticketType.eventId, list);
    }

    const promoterGroupRows = promoterUsers.flatMap((promoter, index) => {
        const firstOrganizer = pick(organizerUsers, index);
        const secondOrganizer = pick(organizerUsers, index + Math.ceil(organizerUsers.length / 2));
        const organizerSet = new Map<number, User>([
            [firstOrganizer.id, firstOrganizer],
            [secondOrganizer.id, secondOrganizer]
        ]);

        return Array.from(organizerSet.values()).map((organizer, orgIndex) => ({
            organizerId: organizer.id,
            promoterId: promoter.id,
            commissionPercentage: 8 + ((index + orgIndex) % 8),
            promoterCode: `LOAD-PROMO-${organizer.id}-${promoter.id}`,
            isActive: true,
            notes: "Generated promoter for load testing."
        }));
    });

    for (const rows of chunk(promoterGroupRows)) {
        await AppDataSource.getRepository(PromoterGroup).insert(rows);
    }

    const promoterGroups = await AppDataSource.getRepository(PromoterGroup).find({
        where: { promoterCode: In(promoterGroupRows.map(group => group.promoterCode)) }
    });
    const groupsByOrganizer = new Map<number, PromoterGroup[]>();
    for (const group of promoterGroups) {
        const list = groupsByOrganizer.get(group.organizerId) || [];
        list.push(group);
        groupsByOrganizer.set(group.organizerId, list);
    }

    const assignmentRows = insertedEvents.flatMap((event, eventIndex) => {
        const groups = groupsByOrganizer.get(event.user_id) || [];
        if (groups.length === 0) return [];
        return [0, 1].map(offset => {
            const group = pick(groups, eventIndex + offset);
            return {
                promoterGroupId: group.id,
                eventId: event.id,
                customCommissionPercentage: offset === 0 ? null : 10 + (eventIndex % 6),
                isActive: true
            };
        });
    });

    for (const rows of chunk(assignmentRows)) {
        await AppDataSource.getRepository(PromoterEventAssignment).insert(rows);
    }

    const assignments = await AppDataSource.getRepository(PromoterEventAssignment).find({
        where: { eventId: In(insertedEvents.map(event => event.id)) }
    });
    const assignmentsByEvent = new Map<number, PromoterEventAssignment[]>();
    for (const assignment of assignments) {
        const list = assignmentsByEvent.get(assignment.eventId) || [];
        list.push(assignment);
        assignmentsByEvent.set(assignment.eventId, list);
    }
    const groupsById = new Map(promoterGroups.map(group => [group.id, group]));

    const soldByTicketType = new Map<number, number>();
    const ticketRows: Partial<Ticket>[] = [];
    const paymentRows: Partial<PaymentLog>[] = [];

    for (let index = 0; index < config.tickets; index++) {
        const ticketType = pick(ticketTypes, index * 7);
        const event = eventsById.get(ticketType.eventId);
        if (!event) continue;

        const buyer = pick(buyerUsers, index * 3);
        const code = `${LOAD_TICKET_PREFIX}${String(index + 1).padStart(8, "0")}`;
        const createdAt = addDays(now, -((index % 120) + 1));
        const status = index % 37 === 0
            ? TicketStatus.CANCELLED
            : index % 6 === 0
                ? TicketStatus.USED
                : TicketStatus.ACTIVE;
        const usePromoter = index % 3 === 0;
        const eventAssignments = assignmentsByEvent.get(event.id) || [];
        const assignment = usePromoter && eventAssignments.length > 0 ? pick(eventAssignments, index) : null;
        const promoterGroup = assignment ? groupsById.get(assignment.promoterGroupId) : null;
        const commissionPercent = assignment && promoterGroup
            ? Number(assignment.customCommissionPercentage ?? promoterGroup.commissionPercentage)
            : null;
        const commissionAmount = commissionPercent === null ? null : money(Number(ticketType.price) * commissionPercent / 100);

        ticketRows.push({
            codigo_unico: code,
            qrCode: QR_PLACEHOLDER,
            ticketTypeId: ticketType.id,
            userId: buyer.id,
            status,
            purchasePrice: Number(ticketType.price),
            soldByPromoterId: promoterGroup?.promoterId ?? null,
            promoterCommissionPercentage: commissionPercent,
            promoterCommissionAmount: commissionAmount,
            promoterCode: promoterGroup?.promoterCode ?? null,
            usedAt: status === TicketStatus.USED ? addDays(createdAt, 1 + (index % 5)) : null,
            scannedById: status === TicketStatus.USED && scannerUsers.length > 0 ? pick(scannerUsers, index).id : null,
            createdAt,
            updatedAt: createdAt
        });

        const paid = status !== TicketStatus.CANCELLED;
        const commissionPlanPercent = event.user_id % 3 === 0 ? 5 : event.user_id % 3 === 1 ? 10 : 15;
        paymentRows.push({
            mpPaymentId: `LOAD-MP-${String(index + 1).padStart(8, "0")}`,
            externalReference: `LOAD-EXT-${code}`,
            userId: buyer.id,
            ticketTypeId: ticketType.id,
            unitPrice: Number(ticketType.price),
            quantity: 1,
            totalAmount: Number(ticketType.price),
            commissionPercent: commissionPlanPercent,
            commissionAmount: money(Number(ticketType.price) * commissionPlanPercent / 100),
            organizerPlanName: commissionPlanPercent === 5 ? "PRO" : commissionPlanPercent === 10 ? "STARTER" : "FREE",
            organizerId: event.user_id,
            status: paid ? PaymentStatus.COMPLETED : PaymentStatus.REFUNDED,
            createdAt,
            refundedAt: paid ? null : addDays(createdAt, 2),
            refundedBy: paid ? null : event.user_id,
            refundReason: paid ? null : "Generated cancelled ticket",
            refundAmount: paid ? null : Number(ticketType.price)
        });

        if (paid) {
            soldByTicketType.set(ticketType.id, (soldByTicketType.get(ticketType.id) || 0) + 1);
        }
    }

    for (const rows of chunk(ticketRows)) {
        await AppDataSource.getRepository(Ticket).insert(rows);
    }
    for (const rows of chunk(paymentRows)) {
        await AppDataSource.getRepository(PaymentLog).insert(rows);
    }

    const ticketTypesById = new Map(ticketTypes.map(ticketType => [ticketType.id, ticketType]));
    const soldCountRows = Array.from(soldByTicketType.entries()).map(([ticketTypeId, soldCount]) => {
        const ticketType = ticketTypesById.get(ticketTypeId);
        return {
            ticketTypeId,
            soldCount,
            status: soldCount >= (ticketType?.capacity || 0)
                ? TicketTypeStatus.SOLD_OUT
                : TicketTypeStatus.ACTIVE
        };
    });

    for (const rows of chunk(soldCountRows, 500)) {
        await AppDataSource.query(
            `UPDATE ticket_type AS tt
             SET "soldCount" = data."soldCount",
                 status = data.status::ticket_type_status_enum
             FROM (
                SELECT * FROM UNNEST($1::int[], $2::int[], $3::text[])
             ) AS data(id, "soldCount", status)
             WHERE tt.id = data.id`,
            [
                rows.map(row => row.ticketTypeId),
                rows.map(row => row.soldCount),
                rows.map(row => row.status)
            ]
        );
    }

    const couponRows = insertedEvents
        .filter((_, index) => index % 3 === 0)
        .map((event, index) => ({
            code: `LOAD-${String(index + 1).padStart(4, "0")}`,
            discountPercent: 10 + (index % 4) * 5,
            maxUses: 100 + (index % 5) * 50,
            usedCount: index % 20,
            expiresAt: addDays(now, 30 + (index % 90)),
            isActive: true,
            eventId: event.id
        }));

    for (const rows of chunk(couponRows)) {
        await AppDataSource.getRepository(Coupon).insert(rows);
    }

    console.log("[seed:volume] Done.");
    console.table({
        users: insertedUsers.length,
        organizers: organizerUsers.length,
        buyers: buyerUsers.length,
        promoters: promoterUsers.length,
        scanners: scannerUsers.length,
        events: insertedEvents.length,
        ticketTypes: ticketTypes.length,
        tickets: ticketRows.length,
        payments: paymentRows.length,
        promoterGroups: promoterGroups.length,
        promoterAssignments: assignments.length,
        coupons: couponRows.length
    });
    console.log(`[seed:volume] Test password for generated users: ${DEFAULT_PASSWORD}`);
    console.log(`[seed:volume] Example organizer: load.organizer.0001@${LOAD_EMAIL_DOMAIN}`);
    console.log(`[seed:volume] Example buyer: load.buyer.0001@${LOAD_EMAIL_DOMAIN}`);
    console.log(`[seed:volume] Example promoter: load.promoter.0001@${LOAD_EMAIL_DOMAIN}`);
}

seedVolume()
    .catch(error => {
        console.error("[seed:volume] Failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    });
