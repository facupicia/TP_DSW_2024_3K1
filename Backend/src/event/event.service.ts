import { IsNull, In, MoreThanOrEqual } from "typeorm";
import { Event } from "./event.entity";
import { Category } from "../category/category.entity";
import { User } from "../user/user.entity";
import { Role, getRoleNames } from "../user/role.entity";
import { TicketType, TicketTypeStatus } from "../ticketType/ticketType.entity";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import AppDataSource from "../db";
import { canCreateEvent, canCreateTicketTypes, getActiveSubscription } from "../subscription/subscription.service";
import { UserSubscription, SubscriptionStatus } from "../subscription/user_subscription.entity";
import { SubscriptionPlan } from "../subscription/subscription_plan.entity";
import { tokenSing } from "../common/services/generateToken";
import { logger } from "../common/services/logger";

const FUTURE_EVENT_SQL = '("event"."date" + "event"."time") > NOW()';

class HttpError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function ticketTypeStatusFromActive(active: boolean | undefined, fallback: TicketTypeStatus): TicketTypeStatus {
    if (active === undefined) return fallback;
    return active ? TicketTypeStatus.ACTIVE : TicketTypeStatus.DISABLED;
}

interface TicketTypeInput {
    name: string;
    price: number;
    capacity: number;
    description?: string;
}

interface UpdateTicketTypeInput {
    id?: number;
    name?: string;
    price?: number;
    capacity?: number;
    description?: string;
    active?: boolean;
}

interface CreateEventInput {
    title: string;
    pais?: string;
    provincia?: string;
    ciudad?: string;
    direccion?: string;
    organizer?: string;
    image?: string;
    date: string;
    time?: string;
    description?: string;
    destacado?: boolean;
    minAge?: number;
    isPublic?: boolean;
    categoryId: number;
    ticketTypes?: TicketTypeInput[];
}

interface UpdateEventInput {
    title?: string;
    pais?: string;
    provincia?: string;
    ciudad?: string;
    direccion?: string;
    organizer?: string;
    image?: string;
    date?: string;
    time?: string;
    description?: string;
    active?: boolean;
    destacado?: boolean;
    minAge?: number;
    isPublic?: boolean;
    categoryId?: number;
    ticketTypes?: UpdateTicketTypeInput[];
}

interface RawSalesRow { id: string; salesCount: string; }
interface RawDayRow { date: string; count: string; }
interface RawCityRow { name: string; value: string; }

// ============================================================================
// CREATE
// ============================================================================
export async function create(
    userId: number,
    data: CreateEventInput
): Promise<{ event: Event; newToken?: string }> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const user = await queryRunner.manager.findOne(User, {
            where: { id: userId },
            relations: ['roles'],
            select: { id: true, firstname: true, lastname: true, email: true, mpUserId: true, roles: { id: true, name: true } }
        });
        if (!user) throw new HttpError(404, 'USER_NOT_FOUND', "User not found");
        if (!user.mpUserId) throw new HttpError(403, 'MP_NOT_LINKED', 'Debes vincular tu cuenta de Mercado Pago para crear eventos y recibir pagos.');

        const eventCheck = await canCreateEvent(userId, queryRunner.manager);
        if (!eventCheck.allowed) throw new HttpError(403, 'PLAN_LIMIT_EVENTS', eventCheck.reason || 'Plan limit reached');

        const ticketTypesCount = data.ticketTypes?.length || 0;
        if (ticketTypesCount > 0) {
            const ttCheck = await canCreateTicketTypes(userId, ticketTypesCount, queryRunner.manager);
            if (!ttCheck.allowed) throw new HttpError(403, 'PLAN_LIMIT_TICKET_TYPES', ttCheck.reason || 'Ticket type limit reached');
        }

        const eventDateTime = new Date(`${data.date}T${data.time || '00:00'}`);
        const now = new Date();
        now.setMinutes(now.getMinutes() - 5);
        if (eventDateTime < now) throw new HttpError(400, 'PAST_DATE', "La fecha y hora del evento no pueden ser en el pasado");

        // Promote to organizer
        const userRoleNames = getRoleNames(user);
        let wasPromotedToOrganizer = false;
        if (!userRoleNames.includes('organizer')) {
            const roleRepo = queryRunner.manager.getRepository(Role);
            let organizerRole = await roleRepo.findOne({ where: { name: 'organizer' } });
            if (!organizerRole) {
                organizerRole = roleRepo.create({ name: 'organizer' });
                await roleRepo.save(organizerRole);
            }
            user.roles = [...user.roles, organizerRole];
            await queryRunner.manager.save(User, user);
            const existingSub = await queryRunner.manager.findOne(UserSubscription, {
                where: { userId, status: SubscriptionStatus.ACTIVE }
            });
            if (!existingSub) {
                const freePlan = await queryRunner.manager.findOne(SubscriptionPlan, { where: { name: 'FREE' } });
                if (freePlan) {
                    const sub = queryRunner.manager.create(UserSubscription, {
                        userId, planId: freePlan.id, status: SubscriptionStatus.ACTIVE,
                        currentPeriodStart: new Date(), currentPeriodEnd: null
                    });
                    await queryRunner.manager.save(sub);
                }
            }
            wasPromotedToOrganizer = true;
        }

        const category = await queryRunner.manager.findOne(Category, { where: { id: data.categoryId } });
        if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', "Category not found");

        const event = new Event();
        event.title = data.title;
        event.pais = data.pais;
        event.provincia = data.provincia;
        event.ciudad = data.ciudad;
        event.direccion = data.direccion;
        event.organizer = data.organizer;
        event.image = data.image;
        event.date = new Date(data.date);
        event.time = data.time;
        event.description = data.description;
        event.destacado = data.destacado ?? false;
        event.minAge = data.minAge ?? 0;
        event.isPublic = data.isPublic ?? true;
        event.user = user;
        event.user_id = user.id;
        event.category = category;
        event.categoryId = data.categoryId;

        await queryRunner.manager.save(Event, event);

        if (data.ticketTypes && Array.isArray(data.ticketTypes) && data.ticketTypes.length > 0) {
            const ticketTypeEntities = data.ticketTypes.map((tt: TicketTypeInput) => {
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

        let newToken: string | undefined;
        if (wasPromotedToOrganizer) {
            newToken = await tokenSing(user);
        }

        return { event, newToken };
    } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }
}

// ============================================================================
// UPDATE
// ============================================================================
export async function update(
    userId: number,
    isAdmin: boolean,
    eventId: number,
    data: UpdateEventInput
): Promise<Event> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const event = await queryRunner.manager.findOne(Event, {
            where: { id: eventId },
            relations: ["category", "ticketTypes"]
        });
        if (!event) throw new HttpError(404, 'EVENT_NOT_FOUND', "Event not found");
        if (event.user_id !== userId && !isAdmin) throw new HttpError(403, 'FORBIDDEN', "No tienes permiso para modificar este evento");

        if (data.categoryId) {
            const category = await queryRunner.manager.findOne(Category, { where: { id: data.categoryId } });
            if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', "Category not found");
            event.category = category;
            event.categoryId = data.categoryId;
        }

        event.title = data.title ?? event.title;
        event.pais = data.pais ?? event.pais;
        event.provincia = data.provincia ?? event.provincia;
        event.ciudad = data.ciudad ?? event.ciudad;
        event.direccion = data.direccion ?? event.direccion;
        event.organizer = data.organizer ?? event.organizer;
        event.image = data.image ?? event.image;
        event.time = data.time ?? event.time;
        event.description = data.description ?? event.description;
        event.active = data.active ?? event.active;
        event.destacado = data.destacado ?? event.destacado;
        event.minAge = data.minAge ?? event.minAge;
        event.isPublic = data.isPublic ?? event.isPublic;

        if (data.date) {
            const newDateTime = new Date(`${data.date}T${data.time || event.time || '00:00'}`);
            const now = new Date();
            now.setMinutes(now.getMinutes() - 5);
            if (newDateTime < now) throw new HttpError(400, 'PAST_DATE', "La fecha y hora del evento no pueden ser en el pasado");
            event.date = new Date(data.date);
        }

        await queryRunner.manager.save(Event, event);

        if (data.ticketTypes && Array.isArray(data.ticketTypes)) {
            const incomingIds = data.ticketTypes.filter((t: UpdateTicketTypeInput) => t.id).map((t: UpdateTicketTypeInput) => Number(t.id));
            const existingMap = new Map(event.ticketTypes.map(t => [t.id, t]));
            const toCreate = data.ticketTypes
                .filter((t: UpdateTicketTypeInput) => !t.id)
                .filter((t: UpdateTicketTypeInput) => ticketTypeStatusFromActive(t.active, TicketTypeStatus.ACTIVE) === TicketTypeStatus.ACTIVE)
                .map((t: UpdateTicketTypeInput) => {
                    const tt = new TicketType();
                    tt.name = t.name!;
                    tt.price = t.price!;
                    tt.capacity = t.capacity!;
                    tt.description = t.description;
                    tt.event = event;
                    tt.eventId = event.id;
                    return tt;
                });
            const toUpdate = data.ticketTypes.filter((t: UpdateTicketTypeInput) => t.id);
            const remainingActiveCount = event.ticketTypes.filter(t => t.status === TicketTypeStatus.ACTIVE && !incomingIds.includes(t.id)).length;
            const newTicketTypesCount = toCreate.length + toUpdate.filter((t: UpdateTicketTypeInput) => {
                const existing = existingMap.get(Number(t.id));
                return existing && ticketTypeStatusFromActive(t.active, existing.status) === TicketTypeStatus.ACTIVE;
            }).length;
            const totalAfterUpdate = remainingActiveCount + newTicketTypesCount;
            const ttCheck = await canCreateTicketTypes(userId, totalAfterUpdate, queryRunner.manager);
            if (!ttCheck.allowed) throw new HttpError(403, 'PLAN_LIMIT_TICKET_TYPES', ttCheck.reason || 'Ticket type limit reached');

            for (const ttData of data.ticketTypes) {
                if (ttData.id) {
                    const existingTT = existingMap.get(Number(ttData.id));
                    if (existingTT) {
                        if (ttData.capacity !== undefined && ttData.capacity < existingTT.soldCount) {
                            throw new HttpError(400, 'CAPACITY_BELOW_SOLD', `No se puede reducir la capacidad por debajo de lo vendido (${existingTT.soldCount}) para ${existingTT.name}`);
                        }
                        existingTT.name = ttData.name ?? existingTT.name;
                        existingTT.price = ttData.price ?? existingTT.price;
                        existingTT.capacity = ttData.capacity ?? existingTT.capacity;
                        existingTT.description = ttData.description ?? existingTT.description;
                        existingTT.status = ticketTypeStatusFromActive(ttData.active, existingTT.status);
                        await queryRunner.manager.save(TicketType, existingTT);
                    }
                } else {
                    const newTT = new TicketType();
                    newTT.name = ttData.name!;
                    newTT.price = ttData.price!;
                    newTT.capacity = ttData.capacity!;
                    newTT.description = ttData.description;
                    newTT.event = event;
                    newTT.status = ticketTypeStatusFromActive(ttData.active, TicketTypeStatus.ACTIVE);
                    await queryRunner.manager.save(TicketType, newTT);
                }
            }
        }

        await queryRunner.commitTransaction();

        return Event.findOne({ where: { id: eventId }, relations: ["category", "ticketTypes"] }) as Promise<Event>;
    } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }
}

// ============================================================================
// REMOVE (SOFT DELETE)
// ============================================================================
export async function remove(userId: number, isAdmin: boolean, eventId: number): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const event = await queryRunner.manager.findOne(Event, { where: { id: eventId }, relations: ['ticketTypes'] });
        if (!event) throw new HttpError(404, 'EVENT_NOT_FOUND', "Event not found");
        if (event.user_id !== userId && !isAdmin) throw new HttpError(403, 'FORBIDDEN', "No tienes permiso para eliminar este evento");

        event.active = false;
        event.deletedAt = new Date();
        await queryRunner.manager.save(Event, event);

        if (event.ticketTypes) {
            for (const tt of event.ticketTypes) {
                tt.status = TicketTypeStatus.DISABLED;
                await queryRunner.manager.save(TicketType, tt);
            }
        }

        const ticketTypeIds = event.ticketTypes ? event.ticketTypes.map(tt => tt.id) : [];
        const activeTickets = ticketTypeIds.length > 0 ? await queryRunner.manager.find(Ticket, {
            where: { ticketTypeId: In(ticketTypeIds), status: TicketStatus.ACTIVE },
            select: ['id', 'ticketTypeId']
        }) : [];

        if (ticketTypeIds.length > 0) {
            await queryRunner.manager.update(
                Ticket,
                { ticketTypeId: In(ticketTypeIds), status: TicketStatus.ACTIVE },
                { status: TicketStatus.CANCELLED }
            );
        }

        const cancelledByType = new Map<number, number>();
        for (const t of activeTickets) {
            cancelledByType.set(t.ticketTypeId, (cancelledByType.get(t.ticketTypeId) || 0) + 1);
        }
        for (const [ttId, count] of cancelledByType) {
            await queryRunner.manager
                .createQueryBuilder()
                .update(TicketType)
                .set({ soldCount: () => `GREATEST("soldCount" - ${count}, 0)` })
                .where('id = :id', { id: ttId })
                .execute();
        }

        await queryRunner.commitTransaction();
    } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }
}

// ============================================================================
// QUERIES
// ============================================================================
export async function findById(id: number): Promise<Event | null> {
    return Event.findOne({
        where: { id, active: true, deletedAt: IsNull() },
        relations: ["user", "category", "ticketTypes", "eventProducts", "eventProducts.product"]
    });
}

export async function findPublic(params: { skip: number; take: number; page: number; limit: number }) {
    const topSales = await AppDataSource.getRepository(Event)
        .createQueryBuilder("event")
        .leftJoin("event.ticketTypes", "ticketTypes")
        .select("event.id", "id")
        .addSelect("COALESCE(SUM(ticketTypes.soldCount), 0)", "salesCount")
        .where("event.active = true")
        .andWhere("event.isPublic = true")
        .andWhere(FUTURE_EVENT_SQL)
        .andWhere("event.deletedAt IS NULL")
        .groupBy("event.id")
        .having("COALESCE(SUM(ticketTypes.soldCount), 0) > 0")
        .orderBy('"salesCount"', "DESC")
        .limit(12)
        .getRawMany();

    const salesByEventId = new Map<number, number>(topSales.map((row: RawSalesRow) => [Number(row.id), Number(row.salesCount || 0)]));
    const dynamicFeaturedIds = new Set<number>(salesByEventId.keys());

    const [events, total] = await AppDataSource.getRepository(Event)
        .createQueryBuilder("event")
        .leftJoinAndSelect("event.category", "category")
        .where("event.active = :active", { active: true })
        .andWhere("event.isPublic = :isPublic", { isPublic: true })
        .andWhere(FUTURE_EVENT_SQL)
        .andWhere("event.deletedAt IS NULL")
        .orderBy("event.destacado", "DESC")
        .addOrderBy("event.date", "ASC")
        .skip(params.skip)
        .take(params.take)
        .getManyAndCount();

    const data = events.map(event => ({
        ...event,
        destacado: event.destacado || dynamicFeaturedIds.has(event.id),
        salesCount: salesByEventId.get(event.id) || 0
    }));

    return { data, total, page: params.page, limit: params.limit, totalPages: Math.max(1, Math.ceil(total / params.limit)) };
}

export async function countActive(): Promise<number> {
    return Event.count({ where: { active: true } });
}

export async function searchByName(rawTitle: string, params: { skip: number; take: number; page: number; limit: number }) {
    const [events, total] = await AppDataSource.getRepository(Event)
        .createQueryBuilder("event")
        .leftJoinAndSelect("event.category", "category")
        .leftJoinAndSelect("event.ticketTypes", "ticketTypes")
        .where("LOWER(event.title) LIKE :title", { title: `%${rawTitle.toLowerCase()}%` })
        .andWhere("event.active = true")
        .andWhere("event.isPublic = true")
        .andWhere(FUTURE_EVENT_SQL)
        .andWhere("event.deletedAt IS NULL")
        .orderBy("event.date", "ASC")
        .skip(params.skip)
        .take(params.take)
        .getManyAndCount();

    return { data: events, total, page: params.page, limit: params.limit, totalPages: Math.max(1, Math.ceil(total / params.limit)) };
}

export async function findByOrganizer(userId: number, params: { skip: number; take: number }) {
    return Event.findAndCount({
        where: { user_id: userId, active: true },
        relations: ["category", "ticketTypes"],
        order: { date: "DESC" },
        skip: params.skip,
        take: params.take
    });
}

// ============================================================================
// STATS
// ============================================================================
function periodToDates(period: string) {
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
            startDate = new Date(0);
            previousStartDate = new Date(0);
            previousEndDate = new Date(0);
    }
    return { startDate, previousStartDate, previousEndDate };
}

export async function getCreatorStats(userId: number, period: string) {
    const { startDate, previousStartDate, previousEndDate } = periodToDates(period);
    const totalEvents = await Event.count({ where: { user_id: userId, active: true } });

    if (totalEvents === 0) {
        return { totalRevenue: 0, totalTickets: 0, avgPrice: 0, totalEvents, revenueGrowth: 0, ticketsGrowth: 0, topEvents: [], recentActivity: [] };
    }

    const currentStats = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .innerJoin('t.ticketType', 'tt')
        .innerJoin('tt.event', 'e')
        .select(['COUNT(t.id) as "totalTickets"', 'SUM(t.purchasePrice) as "totalRevenue"', 'AVG(t.purchasePrice) as "avgPrice"'])
        .where('e.user_id = :userId', { userId })
        .andWhere('e.active = true')
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .andWhere('t.createdAt >= :startDate', { startDate })
        .getRawOne();

    let previousStats = { totalTickets: 0, totalRevenue: 0 };
    if (period !== 'all') {
        const prev = await AppDataSource.getRepository(Ticket)
            .createQueryBuilder('t')
            .innerJoin('t.ticketType', 'tt')
            .innerJoin('tt.event', 'e')
            .select(['COUNT(t.id) as "totalTickets"', 'SUM(t.purchasePrice) as "totalRevenue"'])
            .where('e.user_id = :userId', { userId })
            .andWhere('e.active = true')
            .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
            .andWhere('t.createdAt >= :previousStartDate', { previousStartDate })
            .andWhere('t.createdAt < :previousEndDate', { previousEndDate })
            .getRawOne();
        previousStats = { totalTickets: parseInt(prev?.totalTickets || '0'), totalRevenue: parseFloat(prev?.totalRevenue || '0') };
    }

    const currentRevenue = parseFloat(currentStats?.totalRevenue || '0');
    const currentTickets = parseInt(currentStats?.totalTickets || '0');
    const revenueGrowth = previousStats.totalRevenue > 0 ? ((currentRevenue - previousStats.totalRevenue) / previousStats.totalRevenue) * 100 : 0;
    const ticketsGrowth = previousStats.totalTickets > 0 ? ((currentTickets - previousStats.totalTickets) / previousStats.totalTickets) * 100 : 0;

    const topEventsRaw = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .innerJoin('t.ticketType', 'tt')
        .innerJoin('tt.event', 'e')
        .select(['e.id as "eventId"', 'e.title as "title"', 'COUNT(t.id) as "tickets"', 'SUM(t.purchasePrice) as "revenue"'])
        .where('e.user_id = :userId', { userId })
        .andWhere('e.active = true')
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .groupBy('e.id')
        .addGroupBy('e.title')
        .orderBy('SUM(t.purchasePrice)', 'DESC')
        .limit(5)
        .getRawMany();

    const topEvents = topEventsRaw.map(r => ({ eventId: parseInt(r.eventId), title: r.title, revenue: parseFloat(r.revenue || '0'), tickets: parseInt(r.tickets || '0') }));

    const recentActivity = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .leftJoin('t.ticketType', 'tt')
        .leftJoin('tt.event', 'e')
        .select(['t.id as ticketId', 't.purchasePrice as price', 't.createdAt as soldAt', 'tt.name as ticketType', 'e.title as eventTitle'])
        .where('e.user_id = :userId', { userId })
        .andWhere('e.active = true')
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .orderBy('t.createdAt', 'DESC')
        .limit(10)
        .getRawMany();

    return {
        totalRevenue: currentRevenue,
        totalTickets: currentTickets,
        avgPrice: parseFloat(currentStats?.avgPrice || '0'),
        totalEvents,
        revenueGrowth: parseFloat(revenueGrowth.toFixed(1)),
        ticketsGrowth: parseFloat(ticketsGrowth.toFixed(1)),
        topEvents: topEvents.sort((a, b) => b.revenue - a.revenue),
        recentActivity: recentActivity.map(r => ({ ticketId: r.ticketId, eventTitle: r.eventTitle || 'Unknown', ticketType: r.ticketType || 'General', price: parseFloat(r.price || '0'), soldAt: r.soldAt }))
    };
}

export async function getComparativeStats(userId: number) {
    const comparative = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .innerJoin('t.ticketType', 'tt')
        .innerJoin('tt.event', 'e')
        .select(['e.id as "eventId"', 'e.title as "title"', 'COUNT(t.id) as "participants"', 'SUM(t.purchasePrice) as "revenue"', `SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as "usedCount"`])
        .where('e.user_id = :userId', { userId })
        .andWhere('e.active = true')
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .groupBy('e.id')
        .addGroupBy('e.title')
        .orderBy('e.date', 'DESC')
        .getRawMany();

    return comparative.map(c => ({
        eventId: parseInt(c.eventId),
        title: c.title,
        participants: parseInt(c.participants) || 0,
        revenue: parseFloat(c.revenue) || 0,
        attendanceRate: (parseInt(c.participants) || 0) > 0 ? (parseInt(c.usedCount) || 0) / (parseInt(c.participants) || 0) : 0
    }));
}

export async function getPlatformStats(period: string) {
    const { startDate } = periodToDates(period);
    const totalEvents = await Event.count({ where: { active: true } });
    const upcomingEvents = await Event.count({ where: { active: true, date: MoreThanOrEqual(new Date()) } });

    const ticketStats = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .select(['COUNT(t.id) as "totalTickets"', 'SUM(t.purchasePrice) as "totalRevenue"', 'AVG(t.purchasePrice) as "avgPrice"'])
        .where('t.createdAt >= :startDate', { startDate })
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .getRawOne();

    const topCategories = await AppDataSource.getRepository(Event)
        .createQueryBuilder('e')
        .innerJoin('e.category', 'c')
        .select(['c.name as category', 'COUNT(e.id) as count'])
        .where('e.active = true')
        .groupBy('c.id, c.name')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany();

    const topCities = await AppDataSource.getRepository(Event)
        .createQueryBuilder('e')
        .select(['e.ciudad as city', 'COUNT(e.id) as count'])
        .where('e.active = true')
        .andWhere('e.ciudad IS NOT NULL')
        .groupBy('e.ciudad')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany();

    const dailySales = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .select(['DATE(t.createdAt) as date', 'COUNT(t.id) as tickets', 'SUM(t.purchasePrice) as revenue'])
        .where('t.createdAt >= :startDate', { startDate })
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .groupBy('DATE(t.createdAt)')
        .orderBy('date', 'ASC')
        .getRawMany();

    return {
        overview: {
            totalEvents,
            upcomingEvents,
            totalTickets: parseInt(ticketStats?.totalTickets || '0'),
            totalRevenue: parseFloat(ticketStats?.totalRevenue || '0'),
            avgTicketPrice: parseFloat(ticketStats?.avgPrice || '0')
        },
        topCategories: topCategories.map(c => ({ category: c.category, count: parseInt(c.count) })),
        topCities: topCities.map(c => ({ city: c.city, count: parseInt(c.count) })),
        dailySales: dailySales.map(d => ({ date: d.date, tickets: parseInt(d.tickets), revenue: parseFloat(d.revenue) }))
    };
}

export async function getEventStats(eventId: number) {
    const event = await Event.findOne({ where: { id: eventId }, relations: ['ticketTypes'] });
    if (!event) throw new HttpError(404, 'EVENT_NOT_FOUND', "Evento no encontrado");

    const ticketTypeIds = event.ticketTypes.map(tt => tt.id);
    if (ticketTypeIds.length === 0) {
        return { title: event.title, totalParticipants: 0, revenue: 0, attendanceRate: 0, checkInCount: 0, ticketTypeDistribution: [], salesByDay: [], demographics: { ages: {}, locations: [] } };
    }

    const ticketStats = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .select(['COUNT(t.id) as "totalTickets"', 'SUM(t.purchasePrice) as "totalRevenue"', `SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as "usedCount"`])
        .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .getRawOne();

    const totalTickets = parseInt(ticketStats?.totalTickets || '0');
    const totalRevenue = parseFloat(ticketStats?.totalRevenue || '0');
    const usedCount = parseInt(ticketStats?.usedCount || '0');
    const attendanceRate = totalTickets > 0 ? usedCount / totalTickets : 0;

    const ticketTypeDistribution = event.ticketTypes.map(tt => ({ name: tt.name, count: tt.soldCount || 0, revenue: (tt.soldCount || 0) * Number(tt.price) }));

    const salesByDay = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .select(['DATE(t.createdAt) as date', 'COUNT(t.id) as count'])
        .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .groupBy('DATE(t.createdAt)')
        .orderBy('date', 'DESC')
        .limit(7)
        .getRawMany();

    const ageGroupExpression = `CASE WHEN DATE_PART('year', AGE(CURRENT_DATE, u.birth)) < 18 THEN '-18' WHEN DATE_PART('year', AGE(CURRENT_DATE, u.birth)) < 25 THEN '18-24' WHEN DATE_PART('year', AGE(CURRENT_DATE, u.birth)) < 35 THEN '25-34' WHEN DATE_PART('year', AGE(CURRENT_DATE, u.birth)) < 45 THEN '35-44' ELSE '45+' END`;

    const ageRows = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .innerJoin('t.user', 'u')
        .select([`${ageGroupExpression} as "ageGroup"`, 'COUNT(t.id) as "count"'])
        .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .andWhere('u.birth IS NOT NULL')
        .groupBy(ageGroupExpression)
        .getRawMany();

    const cityRows = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .innerJoin('t.user', 'u')
        .select(['u.ciudad as "name"', 'COUNT(t.id) as "value"'])
        .where('t.ticketTypeId IN (:...ids)', { ids: ticketTypeIds })
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .andWhere('u.ciudad IS NOT NULL')
        .groupBy('u.ciudad')
        .orderBy('"value"', 'DESC')
        .limit(10)
        .getRawMany();

    const ages: Record<string, number> = {};
    interface AgeRow { ageGroup: string; count: string; }
    ageRows.forEach((row: AgeRow) => { ages[row.ageGroup] = parseInt(row.count) || 0; });

    return {
        title: event.title,
        totalParticipants: totalTickets,
        revenue: totalRevenue,
        attendanceRate,
        checkInCount: usedCount,
        ticketTypeDistribution,
        salesByDay: salesByDay.map((s: RawDayRow) => ({ date: s.date, count: parseInt(s.count) })),
        demographics: { ages, ciudades: cityRows.map((row: RawCityRow) => ({ name: row.name, value: parseInt(row.value) || 0 })) }
    };
}

export async function getCreatorStatsData(userId: number, _period: string) {
    const statsRaw = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .innerJoin('t.ticketType', 'tt')
        .innerJoin('tt.event', 'e')
        .leftJoin('e.category', 'c')
        .select([
            'e.id as "eventId"', 'e.title as "title"', 'e.date as "date"', 'c.name as "category"',
            'COUNT(t.id) as "participants"', 'SUM(t.purchasePrice) as "revenue"',
            `SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as "usedCount"`
        ])
        .where('e.user_id = :userId', { userId })
        .andWhere('e.active = true')
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .groupBy('e.id')
        .addGroupBy('e.title')
        .addGroupBy('e.date')
        .addGroupBy('c.name')
        .orderBy('e.date', 'DESC')
        .getRawMany();

    return statsRaw.map(c => ({
        eventId: parseInt(c.eventId),
        title: c.title,
        date: c.date,
        category: c.category || 'Sin categoría',
        participants: parseInt(c.participants) || 0,
        revenue: parseFloat(c.revenue) || 0,
        attendanceRate: (parseInt(c.participants) || 0) > 0 ? (parseInt(c.usedCount) || 0) / (parseInt(c.participants) || 0) : 0
    }));
}

export async function getCheckoutPricing(userId: number) {
    try {
        const subscription = await getActiveSubscription(userId);
        return {
            serviceFeePercent: Number(subscription.plan.serviceFeePercent),
            minimumServiceFee: Number(subscription.plan.minimumServiceFee),
            planName: subscription.plan.name
        };
    } catch {
        return { serviceFeePercent: 15, minimumServiceFee: 0, planName: 'FREE' };
    }
}

export async function getSSEInitialData(userId: number) {
    const stats = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .innerJoin('t.ticketType', 'tt')
        .innerJoin('tt.event', 'e')
        .select(['COUNT(t.id) as "totalTickets"', 'SUM(t.purchasePrice) as "totalRevenue"', 'MAX(t.createdAt) as "lastSaleAt"'])
        .where('e.user_id = :userId', { userId })
        .andWhere('e.active = true')
        .andWhere('t.status != :cancelled', { cancelled: TicketStatus.CANCELLED })
        .getRawOne();

    return {
        totalRevenue: parseFloat(stats?.totalRevenue || '0'),
        totalTickets: parseInt(stats?.totalTickets || '0'),
        lastSaleAt: stats?.lastSaleAt ? new Date(stats.lastSaleAt) : null
    };
}

export async function getSSEUpdatedData(userId: number) {
    return getSSEInitialData(userId);
}
