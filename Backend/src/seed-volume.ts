import { Client } from "pg";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { env } from "./config/env";

/**
 * EventLife - Volume Seed Mejorado
 *
 * Objetivo:
 * - Crear datos masivos pero realistas para probar dashboards, filtros, paginación,
 *   performance, reportes, estados de tickets, comisiones y distintos tipos de eventos.
 * - Evitar datos genéricos tipo "Evento 1", "User 1", etc.
 * - Mantener relaciones coherentes entre users, organizers, events, ticket_types,
 *   tickets, payments y subscriptions.
 *
 * Uso:
 *   npx ts-node src/seed-volume.ts
 *
 * Variables de entorno:
 *   VOLUME_USERS=1000
 *   VOLUME_ORGANIZERS=50
 *   VOLUME_EVENTS=200
 *   VOLUME_TICKET_TYPES=600
 *   VOLUME_TICKETS=5000
 *   VOLUME_PAYMENTS=4000
 *   VOLUME_BATCH_SIZE=500
 *   VOLUME_RESET=false
 *   VOLUME_SEED=eventlife-dev
 *
 * Nota:
 * - billingCycle se deja en "monthly" porque tu enum actual de Postgres no acepta "yearly".
 */

const config = {
  users: Number(env.VOLUME_USERS ?? 500),
  organizers: Number(env.VOLUME_ORGANIZERS ?? 30),
  events: Number(env.VOLUME_EVENTS ?? 120),
  ticketTypes: Number(env.VOLUME_TICKET_TYPES ?? 360),
  tickets: Number(env.VOLUME_TICKETS ?? 2500),
  payments: Number(env.VOLUME_PAYMENTS ?? 2200),
  batchSize: Number(env.VOLUME_BATCH_SIZE ?? 500),
  reset: String("false") === "true",
  seed: String("eventlife-dev"),
};

const client = new Client({
  connectionString: env.DATABASE_URL || env.POSTGRES_URL,
});

type InsertValue = string | number | boolean | Date | null;

type OrganizerSeed = {
  id: number;
  firstname: string;
  lastname: string;
  displayName: string;
  city: string;
  planId: number;
  planName: "FREE" | "STARTER" | "PRO";
  commissionPercent: number;
};

type TicketTypeSeed = {
  id: number;
  eventId: number;
  organizerId: number;
  name: string;
  price: number;
  capacity: number;
  soldCount: number;
  status: "active" | "paused" | "sold_out";
};

type EventSeed = {
  id: number;
  title: string;
  city: string;
  categoryId: number;
  organizerId: number;
  date: string;
  time: string;
};

let totalInserted = 0;
const organizersState: OrganizerSeed[] = [];
const eventsState: EventSeed[] = [];
const ticketTypesState: TicketTypeSeed[] = [];

/**
 * PRNG determinístico para que puedas repetir la misma seed si querés.
 * No usa Math.random() directo para que los datos no cambien en cada corrida.
 */
function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function createRng(seedText: string) {
  let seed = hashSeed(seedText);
  return function rng() {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(config.seed);

function pick<T>(items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function weightedPick<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((acc, item) => acc + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function int(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function isoNowMinusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function isoNowPlusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function dateOnlyFromIso(iso: string) {
  return iso.split("T")[0];
}

function normalizeIdentifier(identifier: string) {
  return identifier.replace(/"/g, "");
}

function quoteIdentifier(identifier: string) {
  return `"${normalizeIdentifier(identifier)}"`;
}

function progress(label: string, count: number) {
  totalInserted += count;
  console.log(`✅ ${label}: +${count} | total acumulado: ${totalInserted}`);
}

async function batchInsert(table: string, columns: string[], rows: InsertValue[][]) {
  if (!rows.length) return 0;

  const cleanTable = quoteIdentifier(table);
  const cleanColumns = columns.map(quoteIdentifier);
  let inserted = 0;

  for (let start = 0; start < rows.length; start += config.batchSize) {
    const chunk = rows.slice(start, start + config.batchSize);
    const placeholders = chunk
      .map((_, rowIndex) => {
        const cols = columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`);
        return `(${cols.join(", ")})`;
      })
      .join(", ");

    const flatValues = chunk.flat();
    const query = `
      INSERT INTO ${cleanTable} (${cleanColumns.join(", ")})
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING
    `;

    const result = await client.query(query, flatValues);
    inserted += result.rowCount || 0;
  }

  return inserted;
}

async function resetData() {
  if (!config.reset) return;

  console.log("⚠️  VOLUME_RESET=true: limpiando tablas de seed...");

  await client.query(`
    TRUNCATE TABLE
      "payment_log",
      "ticket",
      "ticket_type",
      "event",
      "user_subscription",
      "user_roles",
      "user",
      "role",
      "subscription_plan",
      "category"
    RESTART IDENTITY CASCADE;
  `);

  console.log("✅ Tablas limpiadas");
}

async function seedCategories() {
  const categories: InsertValue[][] = [
    [1, "Música"],
    [2, "Deportes"],
    [3, "Tecnología"],
    [4, "Arte y Cultura"],
    [5, "Gastronomía"],
    [6, "Negocios"],
    [7, "Entretenimiento"],
    [8, "Educación"],
    [9, "Fiestas"],
    [10, "Festivales"],
    [11, "Networking"],
    [12, "Teatro"],
  ];

  const count = await batchInsert("category", ["id", "name"], categories);
  progress("Categories", count);
}

async function seedSubscriptionPlans() {
  const plans: InsertValue[][] = [
    [1, "FREE", "Plan Gratuito", 0, 0, 3, 1, 9.5, JSON.stringify({ advancedDashboard: false, exportSales: false, branding: true }), true, 0],
    [2, "PRO", "Pro", 29999, 299999, -1, -1, 2.5, JSON.stringify({ advancedDashboard: true, exportSales: true, branding: false, featuredEvents: true }), true, 2],
  ];

  const count = await batchInsert(
    "subscription_plan",
    ["id", "name", "displayName", "monthlyPrice", "yearlyPrice", "maxEventsPerMonth", "maxTicketTypesPerEvent", "commissionPercent", "features", "active", "sortOrder"],
    plans,
  );

  progress("Subscription Plans", count);
}

async function seedRoles() {
  const roles: InsertValue[][] = [
    [1, "user"],
    [2, "rrpp"],
    [3, "scanner"],
    [4, "organizer"],
    [5, "admin"],
  ];

  const count = await batchInsert("role", ["id", "name"], roles);
  progress("Roles", count);
}

const firstNames = [
  "Facundo", "Sofía", "Valentina", "Mateo", "Martina", "Luciano", "Camila", "Joaquín", "Agustina", "Thiago",
  "Catalina", "Benjamín", "Milagros", "Santiago", "Julieta", "Bautista", "Victoria", "Nicolás", "Malena", "Tomás",
];

const lastNames = [
  "Pereyra", "Gómez", "Fernández", "López", "Martínez", "Rodríguez", "Sosa", "Romero", "Acosta", "Silva",
  "Molina", "Castro", "Ríos", "Medina", "Herrera", "Arias", "Correa", "Vega", "Ponce", "Navarro",
];

const cities = [
  { city: "Rosario", province: "Santa Fe", phonePrefix: "341" },
  { city: "Córdoba", province: "Córdoba", phonePrefix: "351" },
  { city: "Buenos Aires", province: "Buenos Aires", phonePrefix: "11" },
  { city: "Mendoza", province: "Mendoza", phonePrefix: "261" },
  { city: "Mar del Plata", province: "Buenos Aires", phonePrefix: "223" },
  { city: "La Plata", province: "Buenos Aires", phonePrefix: "221" },
  { city: "Salta", province: "Salta", phonePrefix: "387" },
  { city: "Tucumán", province: "Tucumán", phonePrefix: "381" },
];

const organizerBrands = [
  "Aurora Producciones", "Nómade Eventos", "Distrito Live", "Mona Eventos", "Club Prisma", "La Terraza Producciones",
  "Beat House", "Finde Club", "After Office AR", "Ritual Fest", "Urban Stage", "Bruma Producciones", "Nexo Cultura",
  "Arena Sur", "Litoral Music", "Indie Nights", "Reset Club", "Pulso Eventos", "Casa Norte", "Sunset Group",
];

async function seedUsers() {
  const hashedPassword = await bcrypt.hash("123456", 10);
  const now = new Date().toISOString();
  const users: InsertValue[][] = [];

  users.push([
    1,
    "Admin",
    "Sistema",
    "admin@eventlife.com",
    "3510000000",
    "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png",
    "Argentina",
    "Córdoba",
    "Córdoba",
    "Panel central EventLife",
    "1990-01-01",
    hashedPassword,
    true,
    false,
    now,
    now,
  ]);

  for (let i = 0; i < config.organizers; i++) {
    const id = i + 2;
    const location = pick(cities);
    const brand = organizerBrands[i % organizerBrands.length];
    const firstname = brand.split(" ")[0];
    const lastname = brand.split(" ").slice(1).join(" ") || "Eventos";

    const plan = weightedPick([
      { value: { planId: 1, planName: "FREE" as const, commissionPercent: 9.5 }, weight: 45 },
      { value: { planId: 2, planName: "PRO" as const, commissionPercent: 2.5 }, weight: 30 },
    ]);

    organizersState.push({
      id,
      firstname,
      lastname,
      displayName: brand,
      city: location.city,
      planId: plan.planId,
      planName: plan.planName,
      commissionPercent: plan.commissionPercent,
    });

    users.push([
      id,
      firstname,
      lastname,
      `organizer${id}@eventlife.test`,
      `${location.phonePrefix}${String(id).padStart(7, "0")}`,
      `https://i.pravatar.cc/300?img=${(id % 60) + 1}`,
      "Argentina",
      location.province,
      location.city,
      `Av. ${pick(["San Martín", "Pellegrini", "Corrientes", "Belgrano", "Rivadavia"])} ${int(100, 4500)}`,
      `${int(1975, 1998)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      hashedPassword,
      true,
      false,
      isoNowMinusDays(int(20, 900)),
      now,
    ]);
  }

  const userOffset = config.organizers + 2;

  for (let i = 0; i < config.users; i++) {
    const id = userOffset + i;
    const firstname = pick(firstNames);
    const lastname = pick(lastNames);
    const location = pick(cities);
    const createdAt = isoNowMinusDays(int(1, 730));

    users.push([
      id,
      firstname,
      lastname,
      `user${id}@eventlife.test`,
      `${location.phonePrefix}${String(id).padStart(7, "0")}`,
      `https://i.pravatar.cc/300?img=${(id % 70) + 1}`,
      "Argentina",
      location.province,
      location.city,
      `${pick(["Moreno", "Italia", "España", "San Juan", "Mitre", "Sarmiento"])} ${int(100, 5000)}`,
      `${int(1980, 2007)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      hashedPassword,
      rng() > 0.03,
      rng() < 0.06,
      createdAt,
      now,
    ]);
  }

  const count = await batchInsert(
    "user",
    ["id", "firstname", "lastname", "email", "phone", "imgPerfil", "pais", "provincia", "ciudad", "address", "birth", "password", "active", "isGuestAccount", "createdAt", "updatedAt"],
    users,
  );

  progress("Users", count);
}

async function seedUserRoles() {
  const rows: InsertValue[][] = [];
  rows.push([1, 5]);

  for (let i = 2; i <= config.organizers + 1; i++) {
    rows.push([i, 4]);

    if (rng() < 0.35) rows.push([i, 3]);
    if (rng() < 0.25) rows.push([i, 2]);
  }

  const userOffset = config.organizers + 2;
  for (let i = 0; i < config.users; i++) {
    const userId = userOffset + i;
    rows.push([userId, 1]);

    if (rng() < 0.04) rows.push([userId, 2]);
    if (rng() < 0.025) rows.push([userId, 3]);
  }

  const count = await batchInsert("user_roles", ["userId", "roleId"], rows);
  progress("User Roles", count);
}

async function seedUserSubscriptions() {
  const rows: InsertValue[][] = [];
  const now = new Date().toISOString();
  let id = 1;

  rows.push([id++, 1, 3, "active", "monthly", isoNowMinusDays(30), null, isoNowMinusDays(30), now]);

  for (const organizer of organizersState) {
    const status = weightedPick([
      { value: "active", weight: 86 },
      { value: "expired", weight: 8 },
      { value: "cancelled", weight: 6 },
    ]);

    rows.push([
      id++,
      organizer.id,
      organizer.planId,
      status,
      "monthly",
      isoNowMinusDays(int(1, 180)),
      status === "active" ? isoNowPlusDays(int(5, 60)) : isoNowMinusDays(int(1, 60)),
      isoNowMinusDays(int(1, 200)),
      now,
    ]);
  }

  const userOffset = config.organizers + 2;
  for (let i = 0; i < config.users; i++) {
    rows.push([
      id++,
      userOffset + i,
      1,
      "active",
      "monthly",
      isoNowMinusDays(int(1, 365)),
      null,
      isoNowMinusDays(int(1, 365)),
      now,
    ]);
  }

  const count = await batchInsert(
    "user_subscription",
    ["id", "userId", "planId", "status", "billingCycle", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt"],
    rows,
  );

  progress("User Subscriptions", count);
}

const eventAdjectives = [
  "Noches", "Festival", "Experiencia", "Encuentro", "Expo", "Fiesta", "Ciclo", "Sesión", "After", "Sunset", "Arena", "Club",
];

const eventThemesByCategory: Record<number, string[]> = {
  1: ["Indie", "Electrónica", "Rock Nacional", "Cumbia", "Trap", "Tech House", "Acústico", "Jazz"],
  2: ["Running", "Pádel", "Fútbol 5", "Crossfit", "Básquet", "Ciclismo"],
  3: ["Startups", "IA", "Software", "Ciberseguridad", "Producto Digital", "Data"],
  4: ["Arte Urbano", "Fotografía", "Diseño", "Cine", "Literatura", "Museos"],
  5: ["Burger", "Wine", "Food Trucks", "Cerveza Artesanal", "Focaccias", "Asado"],
  6: ["Networking", "Emprendedores", "Ventas", "Inversiones", "Marca Personal"],
  7: ["Comedy", "Stand Up", "Boliche", "Karaoke", "Gaming", "Trivia"],
  8: ["Workshop", "Curso", "Masterclass", "Charla", "Bootcamp"],
  9: ["Halloween", "Navidad", "Pool Party", "XV", "Graduados", "Previa"],
  10: ["Litoral", "Primavera", "Verano", "Invierno", "Sunset", "Outdoor"],
  11: ["Founders", "Freelancers", "SaaS", "Developers", "Marketing"],
  12: ["Microteatro", "Impro", "Drama", "Comedia", "Musical"],
};

function buildEventTitle(categoryId: number, city: string) {
  const theme = pick(eventThemesByCategory[categoryId] ?? eventThemesByCategory[1]);
  const adjective = pick(eventAdjectives);
  const suffix = weightedPick([
    { value: city, weight: 45 },
    { value: String(int(2025, 2027)), weight: 20 },
    { value: pick(["Vol. I", "Vol. II", "Edición Especial", "Open Air", "Deluxe"]), weight: 35 },
  ]);

  return `${adjective} ${theme} ${suffix}`;
}

async function seedEvents() {
  const rows: InsertValue[][] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < config.events; i++) {
    const id = i + 1;
    const organizer = organizersState[i % organizersState.length];
    const location = pick(cities);
    const categoryId = int(1, 12);
    const daysOffset = weightedPick([
      { value: int(-120, -1), weight: 18 },
      { value: int(1, 30), weight: 35 },
      { value: int(31, 90), weight: 32 },
      { value: int(91, 180), weight: 15 },
    ]);

    const dateIso = isoNowPlusDays(daysOffset);
    const date = dateOnlyFromIso(dateIso);
    const hour = weightedPick([
      { value: 18, weight: 12 },
      { value: 19, weight: 18 },
      { value: 20, weight: 25 },
      { value: 21, weight: 25 },
      { value: 22, weight: 15 },
      { value: 23, weight: 5 },
    ]);
    const time = `${String(hour).padStart(2, "0")}:${rng() < 0.25 ? "30" : "00"}`;
    const title = buildEventTitle(categoryId, location.city);
    const active = daysOffset > -90 && rng() > 0.06;
    const destacado = rng() < 0.18;
    const isPublic = rng() > 0.12;

    eventsState.push({
      id,
      title,
      city: location.city,
      categoryId,
      organizerId: organizer.id,
      date,
      time,
    });

    rows.push([
      id,
      title,
      `${title} organizado por ${organizer.displayName}. Evento de prueba para validar búsqueda, ventas, dashboard y comportamiento de entradas.`,
      date,
      time,
      weightedPick([
        { value: 0, weight: 15 },
        { value: 13, weight: 8 },
        { value: 16, weight: 10 },
        { value: 18, weight: 67 },
      ]),
      `https://picsum.photos/seed/eventlife-${id}/1200/700`,
      "Argentina",
      location.province,
      location.city,
      `${pick(["Av. Pellegrini", "Bv. Oroño", "Costanera", "San Martín", "Mitre", "Belgrano"])} ${int(100, 5600)}`,
      organizer.displayName,
      active,
      destacado,
      isPublic,
      categoryId,
      organizer.id,
      isoNowMinusDays(int(1, 240)),
      now,
    ]);
  }

  const count = await batchInsert(
    "event",
    ["id", "title", "description", "date", "time", "minAge", "image", "pais", "provincia", "ciudad", "direccion", "organizer", "active", "destacado", "isPublic", "categoryId", "user_id", "createdAt", "updatedAt"],
    rows,
  );

  progress("Events", count);
}

const ticketTypeCatalog = [
  { name: "Early Bird", description: "Entrada anticipada con precio promocional", priceFactor: 0.65, capacityFactor: 0.18 },
  { name: "General", description: "Acceso general al evento", priceFactor: 1, capacityFactor: 0.52 },
  { name: "VIP", description: "Acceso preferencial y sector exclusivo", priceFactor: 1.85, capacityFactor: 0.16 },
  { name: "Backstage", description: "Experiencia premium con acceso limitado", priceFactor: 3.2, capacityFactor: 0.04 },
  { name: "Promo 2x1", description: "Promoción limitada para compras grupales", priceFactor: 0.85, capacityFactor: 0.08 },
  { name: "Cortesía", description: "Entrada gratuita de cortesía", priceFactor: 0, capacityFactor: 0.02 },
];

function basePriceByCategory(categoryId: number) {
  const prices: Record<number, number> = {
    1: 12000,
    2: 7000,
    3: 18000,
    4: 6000,
    5: 9000,
    6: 22000,
    7: 8000,
    8: 15000,
    9: 10000,
    10: 16000,
    11: 20000,
    12: 6500,
  };

  return prices[categoryId] ?? 10000;
}

async function seedTicketTypes() {
  const rows: InsertValue[][] = [];
  const now = new Date().toISOString();
  let id = 1;

  for (const event of eventsState) {
    if (id > config.ticketTypes) break;

    const totalCapacity = weightedPick([
      { value: int(80, 250), weight: 45 },
      { value: int(251, 800), weight: 40 },
      { value: int(801, 2500), weight: 15 },
    ]);

    const typesPerEvent = Math.min(ticketTypeCatalog.length, weightedPick([
      { value: 1, weight: 16 },
      { value: 2, weight: 28 },
      { value: 3, weight: 34 },
      { value: 4, weight: 16 },
      { value: 5, weight: 6 },
    ]));

    for (let t = 0; t < typesPerEvent && id <= config.ticketTypes; t++) {
      const template = ticketTypeCatalog[t];
      const capacity = Math.max(10, Math.floor(totalCapacity * template.capacityFactor));
      const demand = weightedPick([
        { value: rng() * 0.15, weight: 18 },
        { value: 0.15 + rng() * 0.45, weight: 52 },
        { value: 0.6 + rng() * 0.38, weight: 26 },
        { value: 1, weight: 4 },
      ]);
      const soldCount = Math.min(capacity, Math.floor(capacity * demand));
      const price = template.priceFactor === 0 ? 0 : Math.round((basePriceByCategory(event.categoryId) * template.priceFactor + int(-1200, 1800)) / 500) * 500;
      const status = soldCount >= capacity ? "sold_out" : rng() < 0.05 ? "paused" : "active";

      ticketTypesState.push({
        id,
        eventId: event.id,
        organizerId: event.organizerId,
        name: template.name,
        price,
        capacity,
        soldCount,
        status,
      });

      rows.push([
        id,
        event.id,
        template.name,
        template.description,
        Math.max(0, price),
        capacity,
        soldCount,
        status,
        isoNowMinusDays(int(1, 180)),
        now,
      ]);

      id++;
    }
  }

  const count = await batchInsert(
    "ticket_type",
    ["id", "eventId", "name", "description", "price", "capacity", "soldCount", "status", "createdAt", "updatedAt"],
    rows,
  );

  progress("Ticket Types", count);
}

function ticketStatus() {
  return weightedPick([
    { value: "active", weight: 78 },
    { value: "used", weight: 14 },
    { value: "cancelled", weight: 5 },
    { value: "refunded", weight: 3 },
  ]);
}

async function seedTickets() {
  const rows: InsertValue[][] = [];
  const now = new Date().toISOString();
  const userOffset = config.organizers + 2;

  for (let i = 0; i < config.tickets; i++) {
    const ticketType = pick(ticketTypesState);
    const userId = userOffset + (i % Math.max(1, config.users));
    const status = ticketStatus();
    const hasPromoter = rng() < 0.18;
    const promoterCommissionPercentage = hasPromoter ? weightedPick([
      { value: 5, weight: 35 },
      { value: 7.5, weight: 30 },
      { value: 10, weight: 25 },
      { value: 12.5, weight: 10 },
    ]) : null;
    const promoterCommissionAmount = promoterCommissionPercentage ? money(ticketType.price * (promoterCommissionPercentage / 100)) : null;
    const scannedById = status === "used" ? ticketType.organizerId : null;
    const soldByPromoterId = hasPromoter ? userOffset + int(0, Math.max(0, config.users - 1)) : null;

    rows.push([
      i + 1,
      `EL-${String(ticketType.eventId).padStart(5, "0")}-${randomUUID()}`,
      `data:image/png;base64,${Buffer.from(`ticket:${i + 1}:type:${ticketType.id}`).toString("base64")}`,
      ticketType.id,
      userId,
      status,
      ticketType.price,
      promoterCommissionPercentage,
      promoterCommissionAmount,
      hasPromoter ? `RRPP-${soldByPromoterId}` : null,
      status === "used" ? isoNowMinusDays(int(0, 20)) : null,
      scannedById,
      soldByPromoterId,
      isoNowMinusDays(int(0, 120)),
      now,
    ]);
  }

  const count = await batchInsert(
    "ticket",
    ["id", "codigo_unico", "qrCode", "ticketTypeId", "userId", "status", "purchasePrice", "promoterCommissionPercentage", "promoterCommissionAmount", "promoterCode", "usedAt", "scannedById", "soldByPromoterId", "createdAt", "updatedAt"],
    rows,
  );

  progress("Tickets", count);
}

function paymentStatus() {
  return weightedPick([
    { value: "completed", weight: 82 },
    { value: "processing", weight: 7 },
    { value: "failed", weight: 7 },
    { value: "refunded", weight: 4 },
  ]);
}

async function seedPayments() {
  const rows: InsertValue[][] = [];
  const userOffset = config.organizers + 2;
  const paidTicketTypes = ticketTypesState.filter((ticketType) => ticketType.price > 0);

  if (!paidTicketTypes.length) {
    progress("Payments", 0);
    return;
  }

  for (let i = 0; i < config.payments; i++) {
    const ticketType = pick(paidTicketTypes);
    const organizer = organizersState.find((o) => o.id === ticketType.organizerId) ?? organizersState[0];
    const userId = userOffset + (i % Math.max(1, config.users));
    const quantity = weightedPick([
      { value: 1, weight: 54 },
      { value: 2, weight: 30 },
      { value: 3, weight: 9 },
      { value: 4, weight: 5 },
      { value: 5, weight: 2 },
    ]);
    const unitPrice = ticketType.price;
    const totalAmount = money(unitPrice * quantity);
    const commissionAmount = money(totalAmount * (organizer.commissionPercent / 100));
    const status = paymentStatus();
    const createdAt = isoNowMinusDays(int(0, 180));

    rows.push([
      i + 1,
      `MP-${Date.now()}-${i}-${int(1000, 9999)}`,
      `${ticketType.eventId}|${ticketType.id}|${userId}|${quantity}`,
      userId,
      ticketType.id,
      unitPrice,
      quantity,
      totalAmount,
      organizer.commissionPercent,
      status === "completed" || status === "refunded" ? commissionAmount : 0,
      organizer.planName,
      organizer.id,
      status,
      createdAt,
    ]);
  }

  const count = await batchInsert(
    "payment_log",
    ["id", "mpPaymentId", "externalReference", "userId", "ticketTypeId", "unitPrice", "quantity", "totalAmount", "commissionPercent", "commissionAmount", "organizerPlanName", "organizerId", "status", "createdAt"],
    rows,
  );

  progress("Payments", count);
}

async function resetSequences() {
  const sequenceQueries = [
    { seq: "category_id_seq", table: "category" },
    { seq: "subscription_plan_id_seq", table: "subscription_plan" },
    { seq: "role_id_seq", table: "role" },
    { seq: "user_id_seq", table: "user" },
    { seq: "user_subscription_id_seq", table: "user_subscription" },
    { seq: "event_id_seq", table: "event" },
    { seq: "ticket_type_id_seq", table: "ticket_type" },
    { seq: "ticket_id_seq", table: "ticket" },
    { seq: "payment_log_id_seq", table: "payment_log" },
  ];

  for (const item of sequenceQueries) {
    try {
      await client.query(`
        SELECT setval(
          $1,
          COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(item.table)}), 0) + 1,
          false
        )
      `, [item.seq]);
    } catch (error) {
      console.warn(`⚠️  No se pudo resetear sequence ${item.seq}. Puede que no exista.`);
    }
  }

  console.log("✅ Sequences reset");
}

function validateConfig() {
  const minValues = [
    ["users", config.users],
    ["organizers", config.organizers],
    ["events", config.events],
    ["ticketTypes", config.ticketTypes],
    ["tickets", config.tickets],
    ["payments", config.payments],
    ["batchSize", config.batchSize],
  ] as const;

  for (const [key, value] of minValues) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Config inválida: ${key} debe ser mayor a 0. Valor recibido: ${value}`);
    }
  }

  if (!env.DATABASE_URL && !env.POSTGRES_URL) {
    throw new Error("Falta DATABASE_URL o POSTGRES_URL en variables de entorno.");
  }
}

async function main() {
  validateConfig();

  console.log("\n🚀 EventLife Volume Seed Mejorado");
  console.log("Config:", config);
  console.log("");

  await client.connect();
  console.log("✅ Conectado a DB\n");

  try {
    await client.query("BEGIN");

    await resetData();
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

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  console.log("\n📊 Final Summary");
  console.log(`Total records inserted: ${totalInserted}`);
  console.log(`Organizers generados: ${organizersState.length}`);
  console.log(`Events generados: ${eventsState.length}`);
  console.log(`Ticket types generados: ${ticketTypesState.length}`);
  console.log("\n🎉 Volume seed completed!");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
