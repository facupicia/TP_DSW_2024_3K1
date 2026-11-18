import { Client } from "pg";
import * as bcrypt from "bcrypt";
import { env } from "./config/env";

/**
 * EventLife - Volume Seed v2 (realista y coherente)
 *
 * Objetivo:
 * - Generar datos masivos, realistas y RELACIONALMENTE COHERENTES para probar
 *   la robustez del backend: dashboards, paginación, filtros, reportes, SSE,
 *   comisiones de promoters, cupones, refunds y estados de tickets.
 *
 * Coherencia garantizada:
 * - Cada compra genera 1 payment_log + N tickets vinculados por paymentLogId.
 * - ticket_type.soldCount = cantidad real de tickets active/used (UPDATE final).
 * - Las compras ocurren ENTRE la creación del evento y su fecha de realización.
 * - Tickets de eventos pasados: mayormente 'used' (con usedAt coherente).
 * - Pagos 'failed'/'processing' NO tienen tickets (como en la vida real).
 * - Cupones aplican descuento en baseAmount/discountAmount y agotan usos.
 * - capacity de ticket types nunca se excede (CHECK soldCount <= capacity).
 *
 * Uso:
 *   npm run seed:volume
 *
 * Variables de entorno (ver config/env.ts):
 *   VOLUME_USERS=2000        Compradores (además de organizers/admin/demo)
 *   VOLUME_ORGANIZERS=50     Organizadores con marca propia
 *   VOLUME_EVENTS=250        Eventos distribuidos entre organizers
 *   VOLUME_TICKET_TYPES=800  Tope de tipos de entrada
 *   VOLUME_PURCHASES=6000    Compras (cada una = 1 pago + 1..6 tickets)
 *   VOLUME_BATCH_SIZE=500    Filas por INSERT
 *   VOLUME_RESET=false       true = TRUNCATE todas las tablas antes de seedear
 *   VOLUME_SEED=eventlife-v2 Seed del RNG (misma seed = mismos datos)
 *
  * Cuentas conocidas (password: 12345678):
 *   admin@eventlife.com     (admin)
 *   organizer@eventlife.com (organizer, plan PRO)
 *   user@eventlife.com      (comprador demo)
 */

const config = {
  users: env.VOLUME_USERS,
  organizers: env.VOLUME_ORGANIZERS,
  events: env.VOLUME_EVENTS,
  ticketTypes: env.VOLUME_TICKET_TYPES,
  purchases: env.VOLUME_PURCHASES,
  batchSize: env.VOLUME_BATCH_SIZE,
  reset: env.VOLUME_RESET === "true",
  seed: env.VOLUME_SEED,
};

const connectionUrl = env.DATABASE_URL || env.POSTGRES_URL;
const ssl = env.DB_SSL === "false" ? false : { rejectUnauthorized: false };
const client = new Client(
  connectionUrl
    ? { connectionString: connectionUrl, ssl }
    : {
        host: env.PGHOST,
        port: env.PGPORT ? Number(env.PGPORT) : 5432,
        user: env.PGUSER,
        password: env.PGPASSWORD,
        database: env.PGDATABASE,
        ssl,
      },
);

type InsertValue = string | number | boolean | Date | null;

/* ============================ RNG DETERMINISTA ============================ */

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

function chance(probability: number) {
  return rng() < probability;
}

/** UUID v4-like determinista (derivado del RNG, no de crypto) */
function fakeUuid() {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const segment = (len: number) => Array.from({ length: len }, hex).join("");
  return `${segment(8)}-${segment(4)}-4${segment(3)}-${pick(["8", "9", "a", "b"])}${segment(3)}-${segment(12)}`;
}

/* ============================ UTILIDADES DE FECHA ============================ */

const NOW = new Date();

function daysFromNow(days: number) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date;
}

function randomDateBetween(from: Date, to: Date) {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) return new Date(fromMs);
  return new Date(fromMs + rng() * (toMs - fromMs));
}

function toDateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

/* ============================ HELPERS SQL ============================ */

let totalInserted = 0;

function progress(label: string, count: number) {
  totalInserted += count;
  console.log(`✅ ${label}: +${count} filas | acumulado: ${totalInserted}`);
}

async function batchInsert(table: string, columns: string[], rows: InsertValue[][]) {
  if (!rows.length) return 0;

  const cleanTable = `"${table.replace(/"/g, "")}"`;
  const cleanColumns = columns.map((c) => `"${c.replace(/"/g, "")}"`);
  let inserted = 0;

  for (let start = 0; start < rows.length; start += config.batchSize) {
    const chunk = rows.slice(start, start + config.batchSize);
    const placeholders = chunk
      .map((_, rowIndex) => {
        const cols = columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`);
        return `(${cols.join(", ")})`;
      })
      .join(", ");

    const result = await client.query(
      `INSERT INTO ${cleanTable} (${cleanColumns.join(", ")}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      chunk.flat(),
    );
    inserted += result.rowCount || 0;
  }

  return inserted;
}

/* ============================ DATOS DE DOMINIO ============================ */

const firstNames = [
  "Facundo", "Sofía", "Valentina", "Mateo", "Martina", "Luciano", "Camila", "Joaquín", "Agustina", "Thiago",
  "Catalina", "Benjamín", "Milagros", "Santiago", "Julieta", "Bautista", "Victoria", "Nicolás", "Malena", "Tomás",
  "Ignacio", "Florencia", "Gonzalo", "Antonella", "Lautaro", "Micaela", "Franco", "Abril", "Ezequiel", "Guadalupe",
  "Bruno", "Daniela", "Emiliano", "Rocío", "Sebastián", "Paula", "Andrés", "Mariana", "Federico", "Carolina",
];

const lastNames = [
  "Pereyra", "Gómez", "Fernández", "López", "Martínez", "Rodríguez", "Sosa", "Romero", "Acosta", "Silva",
  "Molina", "Castro", "Ríos", "Medina", "Herrera", "Arias", "Correa", "Vega", "Ponce", "Navarro",
  "Benítez", "Carrizo", "Ojeda", "Ledesma", "Funes", "Aguirre", "Toledo", "Bravo", "Cabrera", "Domínguez",
  "Suárez", "Godoy", "Luna", "Juárez", "Quiroga", "Miranda", "Peralta", "Ibarra", "Zárate", "Escudero",
];

const emailDomains = [
  { value: "gmail.com", weight: 62 },
  { value: "hotmail.com", weight: 18 },
  { value: "outlook.com", weight: 10 },
  { value: "yahoo.com.ar", weight: 6 },
  { value: "icloud.com", weight: 4 },
];

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function buildEmail(firstname: string, lastname: string, usedEmails: Set<string>) {
  const first = stripAccents(firstname.toLowerCase());
  const last = stripAccents(lastname.toLowerCase().split(" ")[0]);
  const domain = weightedPick(emailDomains);

  const candidates = [
    `${first}.${last}@${domain}`,
    `${first}${last}@${domain}`,
    `${first}.${last}${int(1, 99)}@${domain}`,
    `${first[0]}${last}${int(1, 999)}@${domain}`,
  ];

  for (const candidate of candidates) {
    if (!usedEmails.has(candidate)) {
      usedEmails.add(candidate);
      return candidate;
    }
  }

  const fallback = `${first}.${last}.${fakeUuid().slice(0, 8)}@${domain}`;
  usedEmails.add(fallback);
  return fallback;
}

const cities = [
  {
    city: "Córdoba", province: "Córdoba", phonePrefix: "351", weight: 26,
    venues: [
      { name: "Estadio Mario Alberto Kempes", address: "Av. Cárcano s/n, Chateau Carreras" },
      { name: "Quality Espacio", address: "Av. Cruz Roja Argentina 200" },
      { name: "Complejo Forja", address: "Arturo M. Bas 1040" },
      { name: "Teatro del Libertador", address: "Av. Vélez Sarsfield 365" },
      { name: "Plaza de la Música", address: "Av. Costanera s/n" },
      { name: "Studio Theater", address: "Rosario de Santa Fe 274" },
    ],
  },
  {
    city: "Buenos Aires", province: "Buenos Aires", phonePrefix: "11", weight: 30,
    venues: [
      { name: "Movistar Arena", address: "Humboldt 450, Villa Crespo" },
      { name: "Teatro Gran Rex", address: "Av. Corrientes 857" },
      { name: "Luna Park", address: "Av. Eduardo Madero 470" },
      { name: "Hipódromo de Palermo", address: "Av. del Libertador 4101" },
      { name: "Centro Costa Salguero", address: "Av. Costanera R. Obligado 1221" },
      { name: "Niceto Club", address: "Niceto Vega 5510" },
      { name: "La Trastienda", address: "Balcarce 460" },
    ],
  },
  {
    city: "Rosario", province: "Santa Fe", phonePrefix: "341", weight: 14,
    venues: [
      { name: "Anfiteatro Municipal", address: "Av. Belgrano y Bv. Oroño" },
      { name: "Metropolitano", address: "Junín 501" },
      { name: "Teatro El Círculo", address: "Laprida 1223" },
      { name: "Centro Cultural Parque España", address: "Sarmiento y el río" },
    ],
  },
  {
    city: "Mendoza", province: "Mendoza", phonePrefix: "261", weight: 9,
    venues: [
      { name: "Arena Maipú", address: "Emilio Civit 791, Maipú" },
      { name: "Teatro Independencia", address: "Chile y Espejo, Ciudad" },
      { name: "Bodega Norton", address: "Ruta 15 Km 23.5, Luján de Cuyo" },
    ],
  },
  {
    city: "Mar del Plata", province: "Buenos Aires", phonePrefix: "223", weight: 7,
    venues: [
      { name: "Estadio José María Minella", address: "Av. Justo s/n" },
      { name: "Teatro Auditorium", address: "Bv. Marítimo 2280" },
    ],
  },
  {
    city: "La Plata", province: "Buenos Aires", phonePrefix: "221", weight: 5,
    venues: [
      { name: "Estadio Único Diego Armando Maradona", address: "Av. 25 y 32" },
      { name: "Teatro Argentino", address: "Av. 51 entre 9 y 10" },
    ],
  },
  {
    city: "Salta", province: "Salta", phonePrefix: "387", weight: 4,
    venues: [
      { name: "Teatro Provincial", address: "Zuviria 70" },
      { name: "Usina Cultural", address: "España 1420" },
    ],
  },
  {
    city: "Tucumán", province: "Tucumán", phonePrefix: "381", weight: 5,
    venues: [
      { name: "Teatro San Martín", address: "Av. Sarmiento 601" },
      { name: "Hipódromo de Tucumán", address: "Av. Aconquija 1750" },
    ],
  },
];

type CityInfo = (typeof cities)[number];

function pickCity(): CityInfo {
  const total = cities.reduce((acc, c) => acc + c.weight, 0);
  let roll = rng() * total;
  for (const c of cities) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return cities[0];
}

const organizerBrands = [
  "Aurora Producciones", "Nómade Eventos", "Distrito Live", "Mona Eventos", "Club Prisma", "La Terraza Producciones",
  "Beat House", "Finde Club", "After Office AR", "Ritual Fest", "Urban Stage", "Bruma Producciones", "Nexo Cultura",
  "Arena Sur", "Litoral Music", "Indie Nights", "Reset Club", "Pulso Eventos", "Casa Norte", "Sunset Group",
  "Vértigo Shows", "Kilómetro Cero", "La Usina", "Marea Alta", "Zafiro Live", "Trópico Eventos", "Bajo Tierra",
  "Cielo Raso", "Norte Producciones", "Éter Group",
];

const bandNames = [
  "Los Planetas Errantes", "Vertiente", "Croma Noche", "Bahía Libre", "La Nave", "Núcleo Distrito",
  "Casa Andina", "Futura", "Los Jardines", "Mar de Fondo", "Karma Club", "Ruta 9", "Aire Simple",
  "Los Karens", "Bengala", "Piedra Libre", "Vaho", "Circuito", "Alma Nueva", "Temporada",
];

const djNames = [
  "DJ Luar", "Mila Beats", "Nico Dusk", "Vane Solar", "Tommy Waves", "Brisa", "Kova", "Selva Negra",
];

/* ============================ CATEGORÍAS Y TEMPLATES ============================ */

const categorySeed: Array<[number, string]> = [
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

type CategoryTemplate = {
  basePrice: number;
  minAge: () => number;
  hourRange: [number, number];
  titles: (city: string) => string;
  description: (title: string, brand: string, venue: string) => string;
  ticketTiers: Array<{ name: string; description: string; priceFactor: number; capacityFactor: number }>;
};

const musicTiers = [
  { name: "Early Bird", description: "Precio promocional por tiempo limitado", priceFactor: 0.7, capacityFactor: 0.15 },
  { name: "Preventa 1", description: "Primera tanda de preventa", priceFactor: 0.85, capacityFactor: 0.2 },
  { name: "General", description: "Acceso general al evento", priceFactor: 1, capacityFactor: 0.45 },
  { name: "VIP", description: "Sector preferencial + barra exclusiva", priceFactor: 1.9, capacityFactor: 0.15 },
  { name: "Backstage Experience", description: "Meet & greet + acceso backstage", priceFactor: 3.2, capacityFactor: 0.03 },
  { name: "Cortesía", description: "Entrada de cortesía (sin cargo)", priceFactor: 0, capacityFactor: 0.02 },
];

const categoryTemplates: Record<number, CategoryTemplate> = {
  1: {
    basePrice: 25000,
    minAge: () => weightedPick([{ value: 0, weight: 25 }, { value: 13, weight: 25 }, { value: 18, weight: 50 }]),
    hourRange: [20, 23],
    titles: (city) => pick([
      `${pick(bandNames)} en ${city}`,
      `${pick(bandNames)} presenta su nuevo álbum`,
      `Noche de ${pick(["rock nacional", "indie", "cumbia pop", "jazz fusión", "tango electrónico"])} en ${city}`,
      `${pick(bandNames)} + invitados especiales`,
      `${pick(djNames)} - ${pick(["Sunset Session", "Warehouse Set", "B2B All Night Long"])}`,
    ]),
    description: (title, brand, venue) =>
      `${brand} presenta ${title}. Una noche única en ${venue} con sonido de primer nivel, pantallas LED y barra durante todo el show. Puertas habilitadas 2 horas antes del comienzo. No te quedes afuera.`,
    ticketTiers: musicTiers,
  },
  2: {
    basePrice: 12000,
    minAge: () => weightedPick([{ value: 0, weight: 40 }, { value: 16, weight: 60 }]),
    hourRange: [7, 11],
    titles: (city) => pick([
      `Maratón ${city} ${int(2025, 2027)}`,
      `Carrera ${pick(["10K", "21K", "5K"])} ${city} - Edición ${pick(["Aniversario", "Nocturna", "Primavera", "Solidaria"])}`,
      `Torneo de ${pick(["Pádel", "Fútbol 5", "Beach Volley"])} - Copa ${city}`,
      `${city} ${pick(["Ride", "Gran Fondo", "Trail Run"])} ${int(2025, 2027)}`,
    ]),
    description: (title, brand, venue) =>
      `${title} organizado por ${brand}. Largada en ${venue}. Incluye chip de cronometraje, hidratación en circuito, remera oficial y medalla finisher. Cupos limitados por categoría.`,
    ticketTiers: [
      { name: "Inscripción General", description: "Incluye kit básico del corredor", priceFactor: 1, capacityFactor: 0.6 },
      { name: "Inscripción + Kit Premium", description: "Kit completo + medalla grabada", priceFactor: 1.6, capacityFactor: 0.25 },
      { name: "Inscripción Early", description: "Precio promocional primeras 100 inscripciones", priceFactor: 0.75, capacityFactor: 0.15 },
    ],
  },
  3: {
    basePrice: 30000,
    minAge: () => 0,
    hourRange: [9, 10],
    titles: (city) => pick([
      `${pick(["Nerdear.la", "CodeConf", "DevDay", "AI Summit", "Hackatech"])} ${city} ${int(2025, 2027)}`,
      `Meetup ${pick(["React", "Node.js", "Inteligencia Artificial", "Ciberseguridad", "Data Engineering", "DevOps"])} ${city}`,
      `Hackathon ${city} - ${pick(["Edición Fintech", "Edición IA", "48hs de código"])}`,
      `Congreso Argentino de ${pick(["Software", "Datos", "Inteligencia Artificial"])}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Un día completo de charlas, workshops y networking con referentes de la industria. Incluye coffee breaks, certificado de asistencia y acceso a las grabaciones post-evento.`,
    ticketTiers: [
      { name: "Early Bird", description: "Precio anticipado limitado", priceFactor: 0.65, capacityFactor: 0.2 },
      { name: "General", description: "Acceso a todas las charlas", priceFactor: 1, capacityFactor: 0.5 },
      { name: "Full Pass", description: "Charlas + workshops + after", priceFactor: 1.8, capacityFactor: 0.2 },
      { name: "Estudiante", description: "Con certificado de alumno regular", priceFactor: 0.45, capacityFactor: 0.1 },
    ],
  },
  4: {
    basePrice: 8000,
    minAge: () => 0,
    hourRange: [18, 20],
    titles: (city) => pick([
      `Muestra "${pick(["Territorios", "Memoria Viva", "Sur", "Lo Cotidiano", "Paisajes Internos"])}" - ${pick(firstNames)} ${pick(lastNames)}`,
      `Feria de Arte y Diseño ${city}`,
      `Ciclo de ${pick(["Cine Independiente", "Fotografía Documental", "Literatura"])} - Edición ${int(3, 15)}`,
      `Noche de los Museos ${city} ${int(2025, 2027)}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Curaduría de ${brand} con obras de artistas emergentes y consolidados de la escena local. Visita guiada incluida con la entrada.`,
    ticketTiers: [
      { name: "General", description: "Acceso a todas las salas", priceFactor: 1, capacityFactor: 0.7 },
      { name: "Inauguración", description: "Acceso a la inauguración + brindis", priceFactor: 2, capacityFactor: 0.15 },
      { name: "Estudiante/Jubilado", description: "Con acreditación", priceFactor: 0.5, capacityFactor: 0.15 },
    ],
  },
  5: {
    basePrice: 18000,
    minAge: () => 0,
    hourRange: [12, 20],
    titles: (city) => pick([
      `Festival de la ${pick(["Cerveza Artesanal", "Hamburguesa", "Empanada", "Pizza", "Parrilla"])} - ${city}`,
      `${pick(["Wine", "Burger", "Food Truck", "Sabores"])} Fest ${city} ${int(2025, 2027)}`,
      `Cena degustación: ${pick(["Cocina de autor", "Sabores regionales", "Cocina fusión"])} en ${pick(firstNames)} Kitchen`,
      `Feria Gastronómica ${city} - Edición ${pick(["Otoño", "Invierno", "Primavera", "Verano"])}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Más de ${int(15, 40)} stands gastronómicos, cocineros en vivo, música y propuestas para toda la familia. La entrada incluye ${pick(["una degustación de bienvenida", "vaso oficial del festival", "acceso a todas las charlas de cocina"])}.`,
    ticketTiers: [
      { name: "Pase General", description: "Acceso al predio", priceFactor: 1, capacityFactor: 0.55 },
      { name: "Pase + Degustación", description: "Incluye 5 tickets de degustación", priceFactor: 1.7, capacityFactor: 0.3 },
      { name: "VIP Gastronómico", description: "Degustaciones premium + sector exclusivo", priceFactor: 2.8, capacityFactor: 0.1 },
      { name: "Menores (hasta 12 años)", description: "Ingreso acompañado", priceFactor: 0.3, capacityFactor: 0.05 },
    ],
  },
  6: {
    basePrice: 40000,
    minAge: () => 0,
    hourRange: [9, 10],
    titles: (city) => pick([
      `Summit ${pick(["Emprendedores", "E-commerce", "Liderazgo", "Negocios Digitales"])} ${city} ${int(2025, 2027)}`,
      `Congreso de ${pick(["Ventas B2B", "Marketing", "Finanzas Personales", "Real Estate"])} - Edición ${int(2, 12)}`,
      `${city} Business Forum ${int(2025, 2027)}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Speakers nacionales e internacionales, casos reales y rondas de negocios. Incluye material digital, coffee breaks y acceso a la app de networking del evento.`,
    ticketTiers: [
      { name: "General", description: "Acceso a todas las conferencias", priceFactor: 1, capacityFactor: 0.55 },
      { name: "Business", description: "Conferencias + rondas de negocios", priceFactor: 1.9, capacityFactor: 0.3 },
      { name: "Corporate (mesa x4)", description: "Mesa corporativa para 4 personas", priceFactor: 4.5, capacityFactor: 0.15 },
    ],
  },
  7: {
    basePrice: 14000,
    minAge: () => weightedPick([{ value: 0, weight: 30 }, { value: 16, weight: 20 }, { value: 18, weight: 50 }]),
    hourRange: [19, 22],
    titles: (city) => pick([
      `${pick(firstNames)} ${pick(lastNames)} - ${pick(["Show en vivo", "Gira nacional", "Nuevo material"])} en ${city}`,
      `Noche de Stand Up - ${pick(["Edición especial", "Comedia sin filtro", "4 comediantes en escena"])}`,
      `${pick(["Impro Match", "Noche de Impro", "Clown & Café"])} en ${city}`,
      `Torneo de ${pick(["Trivia", "Gaming", "eSports"])} - Gran Final ${city}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Una noche a pura risa y entretenimiento producida por ${brand}. Apertura de puertas una hora antes. Barra y food trucks disponibles.`,
    ticketTiers: [
      { name: "General", description: "Ubicación libre por orden de llegada", priceFactor: 1, capacityFactor: 0.6 },
      { name: "Preferencial", description: "Primeras filas numeradas", priceFactor: 1.6, capacityFactor: 0.25 },
      { name: "Mesa VIP (x2)", description: "Mesa para 2 con servicio", priceFactor: 2.6, capacityFactor: 0.15 },
    ],
  },
  8: {
    basePrice: 20000,
    minAge: () => 0,
    hourRange: [9, 18],
    titles: (city) => pick([
      `Workshop: ${pick(["Fotografía nocturna", "Cerámica", "Escritura creativa", "Ilustración digital", "Huerta urbana"])}`,
      `Curso intensivo de ${pick(["Python desde cero", "Community Management", "Finanzas personales", "Oratoria"])}`,
      `Masterclass con ${pick(firstNames)} ${pick(lastNames)} - ${pick(["Edición limitada", "En vivo", "Con práctica"])}`,
      `Bootcamp ${city}: ${pick(["Diseño UX", "Data Analytics", "Emprendedurismo"])}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Formato intensivo con cupo reducido para garantizar la práctica. Incluye materiales, certificado digital y coffee break. Traé tu notebook.`,
    ticketTiers: [
      { name: "General", description: "Acceso al curso completo", priceFactor: 1, capacityFactor: 0.7 },
      { name: "Early Bird", description: "Descuento por inscripción anticipada", priceFactor: 0.75, capacityFactor: 0.2 },
      { name: "General + Consultoría 1:1", description: "Incluye sesión individual post-curso", priceFactor: 1.8, capacityFactor: 0.1 },
    ],
  },
  9: {
    basePrice: 15000,
    minAge: () => 18,
    hourRange: [22, 23],
    titles: (city) => pick([
      `${pick(["Neon", "Retro", "Y2K", "White", "UV"])} Party - ${city}`,
      `${pick(["Halloween", "Año Nuevo", "Fin de Año", "San Valentín", "Primavera"])} en ${pick(organizerBrands)}`,
      `${pick(djNames)} presenta: ${pick(["Warehouse", "Rooftop Session", "Sunset to Sunrise", "Open Air"])}`,
      `Previa Oficial - ${pick(["Edición Universitaria", "Edición Egresados", "Solo mayores"])}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Producción de ${brand} con ${int(2, 5)} DJs invitados, barra premium y visuales en vivo. Ingreso estrictamente mayor de edad con DNI. Dress code: ${pick(["sport elegante", "libre", "temático"])}.`,
    ticketTiers: musicTiers,
  },
  10: {
    basePrice: 45000,
    minAge: () => weightedPick([{ value: 0, weight: 30 }, { value: 16, weight: 30 }, { value: 18, weight: 40 }]),
    hourRange: [14, 17],
    titles: (city) => pick([
      `${pick(["Primavera Sound Cba", "Litoral Fest", "Montaña Viva", "Solsticio", "Río Arriba"])} Festival - Edición ${int(2, 9)}`,
      `Festival ${city} ${int(2025, 2027)} - ${pick(["2 días", "3 días", "Edición Aniversario"])}`,
      `${pick(["Cosquín", "Kilómetro Verde", "Tierra Adentro"])} - Festival de ${pick(["música y naturaleza", "artes", "cultura popular"])}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. ${int(15, 60)} artistas en ${int(2, 4)} escenarios, feria de emprendedores, patio gastronómico y camping habilitado. Line-up completo en las redes oficiales del festival.`,
    ticketTiers: [
      { name: "Early Bird (Abono)", description: "Abono completo a precio anticipado", priceFactor: 0.6, capacityFactor: 0.1 },
      { name: "Abono General", description: "Acceso a todos los días", priceFactor: 1, capacityFactor: 0.35 },
      { name: "Pase Diario", description: "Acceso por día", priceFactor: 0.55, capacityFactor: 0.35 },
      { name: "Abono VIP", description: "Acceso preferencial + espacios exclusivos", priceFactor: 2.2, capacityFactor: 0.15 },
      { name: "Camping (adicional)", description: "Zona de acampe por persona", priceFactor: 0.35, capacityFactor: 0.05 },
    ],
  },
  11: {
    basePrice: 10000,
    minAge: () => 0,
    hourRange: [18, 19],
    titles: (city) => pick([
      `After Office ${pick(["Founders", "Freelancers", "Marketers", "Devs & Founders"])} - ${city}`,
      `${city} ${pick(["Tech", "Startup", "Creative"])} Meetup #${int(5, 60)}`,
      `Ronda de Negocios ${pick(["Pymes", "Emprendedores", "Profesionales IT"])} ${city}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en ${venue}. Espacio de networking organizado por ${brand}: pitch de 60 segundos, rondas de conversación y after con música. Incluye primera consumición.`,
    ticketTiers: [
      { name: "General", description: "Acceso + primera consumición", priceFactor: 1, capacityFactor: 0.8 },
      { name: "Speaker/Pitch", description: "Incluye 3 minutos de pitch al auditorio", priceFactor: 1.5, capacityFactor: 0.2 },
    ],
  },
  12: {
    basePrice: 16000,
    minAge: () => weightedPick([{ value: 0, weight: 50 }, { value: 13, weight: 30 }, { value: 18, weight: 20 }]),
    hourRange: [20, 21],
    titles: (city) => pick([
      `"${pick(["El visitante", "Dos más dos", "La cocina del aire", "Esperando la 24", "Votemos", "Toc Toc"])}" - Teatro en ${city}`,
      `${pick(["Microteatro", "Impro Total", "Teatro Independiente"])}: ciclo de ${int(4, 10)} obras`,
      `"${pick(["El diluvio", "Casa de muñecas", "Art", "El zoo de cristal"])}" con elenco local - Temporada ${int(2025, 2027)}`,
      `Musical "${pick(["Barrios", "La esquina", "Tangos del sur"])}" - Funciones en ${city}`,
    ]),
    description: (title, brand, venue) =>
      `${title} en la sala ${venue}. Producción de ${brand}. Duración aproximada ${int(70, 120)} minutos con intervalo. Las puertas abren 30 minutos antes; no se permite el ingreso una vez comenzada la función.`,
    ticketTiers: [
      { name: "Pullman", description: "Platea alta", priceFactor: 0.8, capacityFactor: 0.4 },
      { name: "Platea", description: "Platea baja central", priceFactor: 1, capacityFactor: 0.45 },
      { name: "Palco VIP", description: "Palco para 2 personas", priceFactor: 2.2, capacityFactor: 0.15 },
    ],
  },
};

/* ============================ ESTADO EN MEMORIA ============================ */

type PlanName = "FREE" | "STARTER" | "PRO";

type PlanInfo = {
  id: number;
  name: PlanName;
  commissionPercent: number;
  serviceFeePercent: number;
};

const plans: PlanInfo[] = [
  { id: 1, name: "FREE", commissionPercent: 8.0, serviceFeePercent: 12.0 },
  { id: 2, name: "STARTER", commissionPercent: 5.0, serviceFeePercent: 9.0 },
  { id: 3, name: "PRO", commissionPercent: 2.5, serviceFeePercent: 6.0 },
];

type OrganizerState = {
  id: number;
  brand: string;
  firstname: string;
  lastname: string;
  city: CityInfo;
  plan: PlanInfo;
  popularity: number; // 0.3 - 3, pondera cuánto venden sus eventos
};

type BuyerState = {
  id: number;
  province: string;
  activityWeight: number; // power-law: pocos compran mucho
};

type EventState = {
  id: number;
  organizerId: number;
  city: CityInfo;
  categoryId: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  startDateTime: Date;
  createdAt: Date;
  isPast: boolean;
  popularity: number;
  couponIds: number[];
  promoterIds: number[]; // promoters habilitados para este evento
  scannerIds: number[]; // scanners del organizer (fallback: organizer)
};

type TicketTypeState = {
  id: number;
  eventId: number;
  organizerId: number;
  price: number;
  capacity: number;
  soldSoFar: number;
};

type CouponState = {
  id: number;
  eventId: number;
  discountPercent: number;
  maxUses: number;
  usedCount: number;
};

const organizersState: OrganizerState[] = [];
const buyersState: BuyerState[] = [];
const eventsState: EventState[] = [];
const ticketTypesState: TicketTypeState[] = [];
const couponsState: CouponState[] = [];
const promoterUserIds: number[] = [];
const scannerUserIds: number[] = [];
const organizerScanners = new Map<number, number[]>(); // organizerId -> scannerIds
const usedEmails = new Set<string>(["admin@eventlife.com", "organizer@eventlife.com", "user@eventlife.com"]);

/* IDs fijos de cuentas conocidas */
const ADMIN_ID = 1;
const DEMO_ORGANIZER_ID = 2;
const DEMO_USER_ID = 3;
const ORGANIZER_OFFSET = 4; // organizers generados desde id=4

let buyerWeightPrefix: number[] = []; // prefix sums para muestreo power-law

function buildBuyerWeights() {
  let acc = 0;
  buyerWeightPrefix = buyersState.map((buyer) => (acc += buyer.activityWeight));
}

function pickBuyer(): BuyerState {
  const total = buyerWeightPrefix[buyerWeightPrefix.length - 1];
  const roll = rng() * total;
  // búsqueda binaria sobre prefix sums
  let lo = 0;
  let hi = buyerWeightPrefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (buyerWeightPrefix[mid] < roll) lo = mid + 1;
    else hi = mid;
  }
  return buyersState[lo];
}

/* ============================ RESET ============================ */

async function resetData() {
  if (!config.reset) return;

  console.log("⚠️  VOLUME_RESET=true: limpiando TODAS las tablas...");
  await client.query(`
    TRUNCATE TABLE
      "webhook_log",
      "extra_item",
      "event_product",
      "product",
      "ticket",
      "payment_log",
      "coupon",
      "promoter_event_assignment",
      "promoter_group",
      "scanner_organizer_assignment",
      "ticket_type",
      "event",
      "category",
      "user_subscription",
      "subscription_plan",
      "refresh_token",
      "account_claim_token",
      "role_audit",
      "user_roles",
      "user",
      "role"
    RESTART IDENTITY CASCADE;
  `);
  console.log("✅ Tablas limpiadas\n");
}

/* ============================ SEEDERS BASE ============================ */

async function seedCategories() {
  const rows: InsertValue[][] = categorySeed.map(([id, name]) => [id, name]);
  progress("Categories", await batchInsert("category", ["id", "name"], rows));
}

async function seedSubscriptionPlans() {
  const rows: InsertValue[][] = [
    [1, "FREE", "Plan Gratuito", 0, 0, 3, 1, 0, false, 8.0, 12.0, 0, JSON.stringify({ advancedDashboard: false, exportSales: false, featuredEvents: false, prioritySupport: false, removeBranding: false, customBranding: false }), true, 0],
    [2, "STARTER", "Plan Starter", 3499, 34990, 10, 3, 10, true, 5.0, 9.0, 0, JSON.stringify({ advancedDashboard: true, exportSales: false, featuredEvents: false, prioritySupport: false, removeBranding: false, customBranding: false }), true, 1],
    [3, "PRO", "Plan Profesional", 8999, 89990, -1, -1, -1, true, 2.5, 6.0, 0, JSON.stringify({ advancedDashboard: true, exportSales: true, featuredEvents: true, prioritySupport: true, removeBranding: true, customBranding: true }), true, 2],
  ];

  progress(
    "Subscription Plans",
    await batchInsert(
      "subscription_plan",
      ["id", "name", "displayName", "monthlyPrice", "yearlyPrice", "maxEventsPerMonth", "maxTicketTypesPerEvent", "maxProductsInCatalog", "canSellExtras", "commissionPercent", "serviceFeePercent", "minimumServiceFee", "features", "active", "sortOrder"],
      rows,
    ),
  );
}

async function seedRoles() {
  const rows: InsertValue[][] = [
    [1, "user"],
    [2, "rrpp"],
    [3, "scanner"],
    [4, "organizer"],
    [5, "admin"],
  ];
  progress("Roles", await batchInsert("role", ["id", "name"], rows));
}

/* ============================ USERS ============================ */

const AVATAR = (n: number) => `https://i.pravatar.cc/300?img=${(n % 70) + 1}`;
const streetNames = ["Av. San Martín", "Bv. Oroño", "Av. Pellegrini", "Corrientes", "Belgrano", "Rivadavia", "Mitre", "Sarmiento", "9 de Julio", "Independencia", "Italia", "España", "San Juan", "Moreno"];

function birthDate(minYearsAgo: number, maxYearsAgo: number) {
  const year = NOW.getFullYear() - int(minYearsAgo, maxYearsAgo);
  return `${year}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`;
}

async function seedUsers() {
  const hashedPassword = await bcrypt.hash("12345678", 10);
  const now = NOW.toISOString();
  const rows: InsertValue[][] = [];

  const pushUser = (
    id: number,
    firstname: string,
    lastname: string,
    email: string,
    location: CityInfo,
    opts: { createdDaysAgo?: [number, number]; active?: boolean; isGuest?: boolean; claimed?: boolean; deleted?: boolean } = {},
  ) => {
    const createdAt = daysFromNow(-int(opts.createdDaysAgo?.[0] ?? 30, opts.createdDaysAgo?.[1] ?? 730)).toISOString();
    const deletedAt = opts.deleted ? daysFromNow(-int(1, 60)).toISOString() : null;
    rows.push([
      id,
      firstname,
      lastname,
      email,
      `9${location.phonePrefix}${int(4000000, 6999999)}`,
      AVATAR(id),
      "Argentina",
      location.province,
      location.city,
      `${pick(streetNames)} ${int(100, 5600)}`,
      birthDate(18, 60),
      hashedPassword,
      opts.active !== false && !opts.deleted,
      opts.isGuest === true,
      opts.claimed ? daysFromNow(-int(1, 90)).toISOString() : null,
      createdAt,
      now,
      deletedAt,
    ]);
  };

  // --- Cuentas conocidas ---
  pushUser(ADMIN_ID, "Admin", "Sistema", "admin@eventlife.com", cities[0], { createdDaysAgo: [400, 400] });
  pushUser(DEMO_ORGANIZER_ID, "Carlos", "Vega", "organizer@eventlife.com", cities[0], { createdDaysAgo: [300, 300] });
  pushUser(DEMO_USER_ID, "Marina", "Suárez", "user@eventlife.com", cities[1], { createdDaysAgo: [250, 250] });

  // --- Organizers ---
  organizersState.push({
    id: DEMO_ORGANIZER_ID,
    brand: "Vega Producciones",
    firstname: "Carlos",
    lastname: "Vega",
    city: cities[0],
    plan: plans[2], // PRO
    popularity: 2.2,
  });

  for (let i = 0; i < config.organizers; i++) {
    const id = ORGANIZER_OFFSET + i;
    const location = pickCity();
    const brand = i < organizerBrands.length ? organizerBrands[i] : `${pick(organizerBrands)} ${pick(["BA", "CBA", "Norte", "Sur", int(2, 9).toString()])}`;
    const firstname = pick(firstNames);
    const lastname = pick(lastNames);
    const plan = weightedPick<PlanInfo>([
      { value: plans[0], weight: 45 },
      { value: plans[1], weight: 30 },
      { value: plans[2], weight: 25 },
    ]);

    organizersState.push({
      id,
      brand,
      firstname,
      lastname,
      city: location,
      plan,
      popularity: 0.4 + Math.pow(rng(), 1.5) * 2.6,
    });

    pushUser(id, firstname, lastname, buildEmail(firstname, lastname, usedEmails), location, { createdDaysAgo: [60, 900] });
  }

  // --- Compradores ---
  // El usuario demo compra bastante (útil para probar "Mis entradas" a mano)
  buyersState.push({ id: DEMO_USER_ID, province: cities[1].province, activityWeight: 8 });

  const userOffset = ORGANIZER_OFFSET + config.organizers;

  for (let i = 0; i < config.users; i++) {
    const id = userOffset + i;
    const firstname = pick(firstNames);
    const lastname = `${pick(lastNames)}${chance(0.2) ? " " + pick(lastNames) : ""}`;
    const location = pickCity();
    const isGuest = chance(0.07);
    const deleted = chance(0.02);

    // power-law: la mayoría compra poco, pocos compran muchísimo
    const activityWeight = 0.05 + Math.pow(rng(), 3.2) * 12;

    buyersState.push({ id, province: location.province, activityWeight });

    // Algunos buyers también serán promoters (rrpp) o scanners
    if (chance(0.06)) promoterUserIds.push(id);
    if (chance(0.04)) scannerUserIds.push(id);

    pushUser(id, firstname, lastname, buildEmail(firstname, lastname, usedEmails), location, {
      createdDaysAgo: [1, 700],
      active: chance(0.97),
      isGuest,
      claimed: isGuest && chance(0.25),
      deleted,
    });
  }

  buildBuyerWeights();

  progress(
    "Users",
    await batchInsert(
      "user",
      ["id", "firstname", "lastname", "email", "phone", "imgPerfil", "pais", "provincia", "ciudad", "address", "birth", "password", "active", "isGuestAccount", "claimedAt", "createdAt", "updatedAt", "deletedAt"],
      rows,
    ),
  );
}

async function seedUserRoles() {
  const rows: InsertValue[][] = [];
  rows.push([ADMIN_ID, 5]);
  rows.push([DEMO_ORGANIZER_ID, 4], [DEMO_USER_ID, 1]);

  for (const organizer of organizersState) {
    if (organizer.id === DEMO_ORGANIZER_ID) continue;
    rows.push([organizer.id, 4]);
    if (chance(0.3)) rows.push([organizer.id, 3]); // algunos organizers también escanean
  }

  const promoterSet = new Set<number>(promoterUserIds);
  const scannerSet = new Set<number>(scannerUserIds);
  for (const promoterId of promoterSet) {
    rows.push([promoterId, 1], [promoterId, 2]);
  }
  for (const scannerId of scannerSet) {
    if (!promoterSet.has(scannerId)) rows.push([scannerId, 1]);
    rows.push([scannerId, 3]);
  }
  for (const buyer of buyersState) {
    if (buyer.id === DEMO_USER_ID) continue; // ya tiene su rol
    if (!promoterSet.has(buyer.id) && !scannerSet.has(buyer.id)) {
      rows.push([buyer.id, 1]);
    }
  }

  progress("User Roles", await batchInsert("user_roles", ["userId", "roleId"], rows));
}

async function seedUserSubscriptions() {
  const rows: InsertValue[][] = [];
  const now = NOW.toISOString();
  let id = 1;

  rows.push([id++, ADMIN_ID, 3, "active", "monthly", daysFromNow(-300).toISOString(), daysFromNow(65).toISOString(), null, daysFromNow(-300).toISOString(), now]);

  for (const organizer of organizersState) {
    const status = weightedPick([
      { value: "active", weight: 84 },
      { value: "expired", weight: 9 },
      { value: "cancelled", weight: 7 },
    ]);
    const billingCycle = organizer.plan.id === 1 ? "monthly" : weightedPick([{ value: "monthly", weight: 65 }, { value: "yearly", weight: 35 }]);
    const periodDays = billingCycle === "yearly" ? 365 : 30;
    const periodStart = daysFromNow(-int(5, billingCycle === "yearly" ? 300 : 28));
    const naturalPeriodEnd = new Date(periodStart.getTime() + periodDays * 86400000);
    // active: período vigente. expired: período ya terminó. cancelled: cancelado a mitad de período.
    const periodEnd = status === "active" ? naturalPeriodEnd : status === "expired" ? naturalPeriodEnd : null;
    const cancelledAt = status === "cancelled" ? randomDateBetween(periodStart, new Date(Math.min(naturalPeriodEnd.getTime(), NOW.getTime()))) : null;

    rows.push([
      id++,
      organizer.id,
      organizer.plan.id,
      status,
      billingCycle,
      periodStart.toISOString(),
      periodEnd ? periodEnd.toISOString() : null,
      cancelledAt ? cancelledAt.toISOString() : null,
      daysFromNow(-int(30, 180)).toISOString(),
      now,
    ]);
  }

  for (const buyer of buyersState) {
    rows.push([
      id++,
      buyer.id,
      1,
      "active",
      "monthly",
      daysFromNow(-int(1, 365)).toISOString(),
      null,
      null,
      daysFromNow(-int(1, 365)).toISOString(),
      now,
    ]);
  }

  progress(
    "User Subscriptions",
    await batchInsert(
      "user_subscription",
      ["id", "userId", "planId", "status", "billingCycle", "currentPeriodStart", "currentPeriodEnd", "cancelledAt", "createdAt", "updatedAt"],
      rows,
    ),
  );
}

/* ============================ EVENTS ============================ */

async function seedEvents() {
  const rows: InsertValue[][] = [];
  const now = NOW.toISOString();

  // Distribución de eventos por organizer proporcional a su popularidad:
  // organizers "grandes" tienen más eventos (como en la realidad).
  const organizerPool: OrganizerState[] = [];
  for (const organizer of organizersState) {
    const slots = Math.max(1, Math.round(organizer.popularity * 2));
    for (let s = 0; s < slots; s++) organizerPool.push(organizer);
  }

  // 75% de eventos en la ciudad del organizer, 25% en otras ciudades (giras)
  for (let i = 0; i < config.events; i++) {
    const id = i + 1;
    const organizer = pick(organizerPool);
    const categoryId = weightedPick([
      { value: 1, weight: 22 }, { value: 9, weight: 14 }, { value: 10, weight: 8 }, { value: 2, weight: 10 },
      { value: 3, weight: 8 }, { value: 4, weight: 6 }, { value: 5, weight: 8 }, { value: 6, weight: 6 },
      { value: 7, weight: 9 }, { value: 8, weight: 4 }, { value: 11, weight: 2 }, { value: 12, weight: 3 },
    ]);
    const template = categoryTemplates[categoryId];
    const location = chance(0.75) ? organizer.city : pickCity();
    const venue = pick(location.venues);

    // Fechas: pasado reciente / próximas 2 semanas / 2-8 semanas / lejano
    const daysOffset = weightedPick([
      { value: -int(1, 150), weight: 22 },
      { value: int(1, 14), weight: 26 },
      { value: int(15, 60), weight: 36 },
      { value: int(61, 180), weight: 16 },
    ]);
    const eventDate = daysFromNow(daysOffset);
    const date = toDateOnly(eventDate);
    const hour = int(template.hourRange[0], template.hourRange[1]);
    const minute = pick([0, 0, 0, 30]);
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    // Argentina = UTC-3
    const startDateTime = new Date(`${date}T${time}:00-03:00`);

    // El evento se creó entre 25 y 160 días antes de su realización
    const createdAt = randomDateBetween(daysFromNow(daysOffset - 160), daysFromNow(daysOffset - 25));
    const isPast = daysOffset < 0;
    const active = chance(isPast ? 0.94 : 0.97);
    const softDeleted = !active && chance(0.5);

    const title = template.titles(location.city);
    const popularity = organizer.popularity * (0.5 + Math.pow(rng(), 1.2) * 2);

    eventsState.push({
      id,
      organizerId: organizer.id,
      city: location,
      categoryId,
      date,
      time,
      startDateTime,
      createdAt,
      isPast,
      popularity,
      couponIds: [],
      promoterIds: [],
      scannerIds: [organizer.id],
    });

    rows.push([
      id,
      title,
      template.description(title, organizer.brand, venue.name).slice(0, 500),
      date,
      time,
      startDateTime.toISOString(),
      template.minAge(),
      `https://picsum.photos/seed/eventlife-${config.seed}-${id}/1200/700`,
      "Argentina",
      location.province,
      location.city,
      `${venue.name} - ${venue.address}`,
      organizer.brand,
      active,
      chance(0.16), // destacado
      chance(0.9), // isPublic
      categoryId,
      organizer.id,
      createdAt.toISOString(),
      now,
      softDeleted ? daysFromNow(-int(1, 30)).toISOString() : null,
    ]);
  }

  progress(
    "Events",
    await batchInsert(
      "event",
      ["id", "title", "description", "date", "time", "startDateTime", "minAge", "image", "pais", "provincia", "ciudad", "direccion", "organizer", "active", "destacado", "isPublic", "categoryId", "user_id", "createdAt", "updatedAt", "deletedAt"],
      rows,
    ),
  );
}

/* ============================ TICKET TYPES ============================ */

async function seedTicketTypes() {
  const rows: InsertValue[][] = [];
  const now = NOW.toISOString();
  let id = 1;

  for (const event of eventsState) {
    if (id > config.ticketTypes) break;

    const template = categoryTemplates[event.categoryId];
    // Eventos más populares tienen más capacidad y más tandas
    const totalCapacity = Math.round(
      weightedPick([
        { value: int(60, 200), weight: 30 },
        { value: int(200, 700), weight: 40 },
        { value: int(700, 2500), weight: 22 },
        { value: int(2500, 8000), weight: 8 },
      ]) * Math.min(1.5, 0.6 + event.popularity * 0.3),
    );

    const maxTiers = Math.min(template.ticketTiers.length, weightedPick([
      { value: 1, weight: 10 },
      { value: 2, weight: 22 },
      { value: 3, weight: 34 },
      { value: 4, weight: 24 },
      { value: 5, weight: 10 },
    ]));

    // Shuffle de tiers para que no todos los eventos tengan la misma primera tanda
    const tiers = [...template.ticketTiers].sort(() => rng() - 0.5).slice(0, maxTiers);
    const capacityFactorSum = tiers.reduce((acc, t) => acc + t.capacityFactor, 0);

    for (const tier of tiers) {
      if (id > config.ticketTypes) break;
      const capacity = Math.max(10, Math.round((totalCapacity * tier.capacityFactor) / capacityFactorSum));
      const price = tier.priceFactor === 0
        ? 0
        : Math.max(500, Math.round((template.basePrice * tier.priceFactor * (0.9 + rng() * 0.3)) / 500) * 500);

      ticketTypesState.push({
        id,
        eventId: event.id,
        organizerId: event.organizerId,
        price,
        capacity,
        soldSoFar: 0,
      });

      // soldCount y status se calculan al final desde los tickets reales
      rows.push([id, event.id, tier.name, tier.description, price, capacity, 0, "active", event.createdAt.toISOString(), now]);
      id++;
    }
  }

  progress(
    "Ticket Types",
    await batchInsert(
      "ticket_type",
      ["id", "eventId", "name", "description", "price", "capacity", "soldCount", "status", "createdAt", "updatedAt"],
      rows,
    ),
  );
}

/* ============================ COUPONS ============================ */

const couponCodeWords = ["BIENVENIDA", "VERANO", "AMIGOS", "LANZAMIENTO", "PREVENTA", "FAMILIA", "ESTUDIANTE", "FLASH", "TRIBU", "PRIMEROS"];

async function seedCoupons() {
  const rows: InsertValue[][] = [];
  const now = NOW.toISOString();
  let id = 1;
  const usedCodes = new Set<string>();

  for (const event of eventsState) {
    // ~28% de eventos tienen 1-2 cupones
    if (!chance(0.28)) continue;

    const couponCount = chance(0.8) ? 1 : 2;
    for (let c = 0; c < couponCount; c++) {
      const discountPercent = pick([10, 15, 20, 25, 30]);
      let code = `${pick(couponCodeWords)}${discountPercent}`;
      if (usedCodes.has(code)) code = `${code}X${event.id}`;
      usedCodes.add(code);

      const maxUses = weightedPick([
        { value: 0, weight: 25 }, // ilimitado
        { value: int(10, 50), weight: 45 },
        { value: int(51, 200), weight: 30 },
      ]);
      const expiresAt = chance(0.7)
        ? randomDateBetween(event.createdAt, event.startDateTime > NOW ? event.startDateTime : NOW).toISOString()
        : null;
      const isActive = chance(0.85) && !(event.isPast);

      const coupon: CouponState = {
        id,
        eventId: event.id,
        discountPercent,
        maxUses,
        usedCount: 0,
      };
      couponsState.push(coupon);
      event.couponIds.push(id);

      rows.push([id, code, coupon.discountPercent, maxUses, 0, expiresAt, isActive, event.id, event.createdAt.toISOString(), now]);
      id++;
    }
  }

  progress(
    "Coupons",
    await batchInsert(
      "coupon",
      ["id", "code", "discountPercent", "maxUses", "usedCount", "expiresAt", "isActive", "eventId", "createdAt", "updatedAt"],
      rows,
    ),
  );
}

/* ============================ PROMOTERS & SCANNERS ============================ */

async function seedPromoters() {
  const groupRows: InsertValue[][] = [];
  const assignmentRows: InsertValue[][] = [];
  const now = NOW.toISOString();
  let groupId = 1;
  let assignmentId = 1;
  const usedCodes = new Set<string>();
  const usedPairs = new Set<string>();

  const eventsByOrganizer = new Map<number, EventState[]>();
  for (const event of eventsState) {
    if (!eventsByOrganizer.has(event.organizerId)) eventsByOrganizer.set(event.organizerId, []);
    eventsByOrganizer.get(event.organizerId)!.push(event);
  }

  for (const organizer of organizersState) {
    // 55% de organizers trabajan con promoters
    if (!chance(0.55) || promoterUserIds.length === 0) continue;

    const promoterCount = Math.min(int(1, 4), promoterUserIds.length);
    const organizerEvents = eventsByOrganizer.get(organizer.id) ?? [];

    for (let p = 0; p < promoterCount; p++) {
      const promoterId = pick(promoterUserIds);
      const pairKey = `${organizer.id}-${promoterId}`;
      if (usedPairs.has(pairKey)) continue;
      usedPairs.add(pairKey);

      let code = `RRPP${String(promoterId).padStart(4, "0")}`;
      if (usedCodes.has(code)) code = `${code}-${organizer.id}`;
      usedCodes.add(code);

      const commission = weightedPick([
        { value: 5, weight: 30 },
        { value: 7.5, weight: 25 },
        { value: 10, weight: 30 },
        { value: 12.5, weight: 15 },
      ]);

      groupRows.push([groupId, organizer.id, promoterId, commission, code, chance(0.9), null, daysFromNow(-int(10, 200)).toISOString(), now]);

      // Asignar el promoter a 1..N eventos del organizer
      for (const event of organizerEvents) {
        if (!chance(0.6)) continue;
        const customCommission = chance(0.25) ? commission + pick([2, 2.5, 5]) : null;
        assignmentRows.push([assignmentId++, groupId, event.id, customCommission, true, event.createdAt.toISOString(), now]);
        event.promoterIds.push(promoterId);
      }

      groupId++;
    }
  }

  progress(
    "Promoter Groups",
    await batchInsert(
      "promoter_group",
      ["id", "organizerId", "promoterId", "commissionPercentage", "promoterCode", "isActive", "notes", "createdAt", "updatedAt"],
      groupRows,
    ),
  );
  progress(
    "Promoter Event Assignments",
    await batchInsert(
      "promoter_event_assignment",
      ["id", "promoterGroupId", "eventId", "customCommissionPercentage", "isActive", "createdAt", "updatedAt"],
      assignmentRows,
    ),
  );
}

async function seedScannerAssignments() {
  const rows: InsertValue[][] = [];
  const now = NOW.toISOString();
  let id = 1;
  const usedPairs = new Set<string>();

  for (const event of eventsState) {
    if (scannerUserIds.length === 0) break;
    // Eventos medianos/grandes suelen tener scanners dedicados
    if (!chance(0.4)) continue;

    const scannerId = pick(scannerUserIds);
    const pairKey = `${event.organizerId}-${scannerId}`;
    if (usedPairs.has(pairKey)) {
      // Ya está asignado al organizer: solo registrarlo para este evento
      event.scannerIds.push(scannerId);
      continue;
    }
    usedPairs.add(pairKey);

    if (!organizerScanners.has(event.organizerId)) organizerScanners.set(event.organizerId, []);
    organizerScanners.get(event.organizerId)!.push(scannerId);

    rows.push([id++, event.organizerId, scannerId, event.organizerId, true, daysFromNow(-int(5, 150)).toISOString(), now]);

    // El scanner queda habilitado para todos los eventos del organizer
    for (const other of eventsState) {
      if (other.organizerId === event.organizerId) other.scannerIds.push(scannerId);
    }
  }

  progress(
    "Scanner Assignments",
    await batchInsert(
      "scanner_organizer_assignment",
      ["id", "organizerId", "scannerId", "assignedById", "isActive", "createdAt", "updatedAt"],
      rows,
    ),
  );
}

/* ============================ PURCHASES (núcleo de coherencia) ============================ */

function buildQrSvgDataUrl(codigo: string) {
  // Placeholder SVG liviano (el QR real lo genera el backend on-demand en /ticket/:id/qr)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#fff"/><rect x="10" y="10" width="30" height="30" fill="#000"/><rect x="80" y="10" width="30" height="30" fill="#000"/><rect x="10" y="80" width="30" height="30" fill="#000"/><rect x="50" y="50" width="20" height="20" fill="#000"/><text x="60" y="115" font-size="8" text-anchor="middle" fill="#333">${codigo.slice(0, 18)}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function seedPurchases() {
  const paymentRows: InsertValue[][] = [];
  const ticketRows: InsertValue[][] = [];

  // Índices auxiliares
  const ticketTypesByEvent = new Map<number, TicketTypeState[]>();
  for (const tt of ticketTypesState) {
    if (!ticketTypesByEvent.has(tt.eventId)) ticketTypesByEvent.set(tt.eventId, []);
    ticketTypesByEvent.get(tt.eventId)!.push(tt);
  }
  const couponsById = new Map(couponsState.map((c) => [c.id, c]));
  const organizerById = new Map(organizersState.map((o) => [o.id, o]));

  // Pool de eventos comprables ponderado por popularidad
  // (los eventos inactivos/eliminados igual tuvieron ventas históricas)
  const eventWeightPrefix: number[] = [];
  {
    let acc = 0;
    for (const event of eventsState) {
      acc += Math.max(0.1, event.popularity) * (event.isPast ? 1.2 : 1);
      eventWeightPrefix.push(acc);
    }
  }
  const pickEvent = (): EventState => {
    const total = eventWeightPrefix[eventWeightPrefix.length - 1];
    const roll = rng() * total;
    let lo = 0;
    let hi = eventsState.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (eventWeightPrefix[mid] < roll) lo = mid + 1;
      else hi = mid;
    }
    return eventsState[lo];
  };

  let paymentId = 1;
  let ticketId = 1;
  let attempted = 0;
  const maxAttempts = config.purchases * 4; // evita loop infinito si todo está agotado

  while (paymentId <= config.purchases && attempted < maxAttempts) {
    attempted++;

    const event = pickEvent();
    const buyer = pickBuyer();

    // Preferencia geográfica: 55% de las compras son en la provincia del comprador.
    // Si el evento elegido no coincide, re-elegimos una vez (sesgo, no regla dura).
    const sameProvince = event.city.province === buyer.province;
    if (!sameProvince && chance(0.55)) continue;

    const types = ticketTypesByEvent.get(event.id);
    if (!types || types.length === 0) continue;

    // Elegir un ticket type con stock restante, ponderado por remanente
    const available = types.filter((t) => t.soldSoFar < t.capacity);
    if (available.length === 0) continue; // evento agotado

    const totalRemaining = available.reduce((acc, t) => acc + (t.capacity - t.soldSoFar), 0);
    let roll = rng() * totalRemaining;
    let ticketType = available[0];
    for (const t of available) {
      roll -= t.capacity - t.soldSoFar;
      if (roll <= 0) {
        ticketType = t;
        break;
      }
    }

    const quantity = Math.min(
      ticketType.capacity - ticketType.soldSoFar,
      weightedPick([
        { value: 1, weight: 42 },
        { value: 2, weight: 31 },
        { value: 3, weight: 13 },
        { value: 4, weight: 9 },
        { value: 5, weight: 4 },
        { value: 6, weight: 1 },
      ]),
    );

    // Fecha de compra: entre la publicación del evento y su realización (o hoy).
    // 10% de compras "último momento" (últimas 72hs) si el evento es futuro.
    const purchaseDeadline = event.startDateTime < NOW ? event.startDateTime : NOW;
    let purchaseDate: Date;
    if (!event.isPast && chance(0.1)) {
      purchaseDate = randomDateBetween(daysFromNow(-3), NOW);
    } else {
      purchaseDate = randomDateBetween(event.createdAt, purchaseDeadline);
    }
    // Eventos pasados no pueden tener compras recientes
    if (purchaseDate > purchaseDeadline) purchaseDate = purchaseDeadline;

    /* ---------- Cortesías (precio 0): tickets sin payment ---------- */
    if (ticketType.price === 0) {
      ticketType.soldSoFar += quantity;
      for (let q = 0; q < quantity; q++) {
        const codigo = `EL-${String(event.id).padStart(5, "0")}-${fakeUuid()}`;
        const used = event.isPast && chance(0.7);
        const usedAt = used ? randomDateBetween(event.startDateTime, new Date(event.startDateTime.getTime() + 3 * 3600000)) : null;
        ticketRows.push([
          ticketId++,
          codigo,
          buildQrSvgDataUrl(codigo),
          ticketType.id,
          buyer.id,
          null, // paymentLogId: compra gratuita, sin pago
          used ? "used" : "active",
          0,
          null,
          null,
          null,
          null,
          usedAt ? usedAt.toISOString() : null,
          used ? pick(event.scannerIds) : null,
          purchaseDate.toISOString(),
          usedAt ? usedAt.toISOString() : purchaseDate.toISOString(),
          null,
        ]);
      }
      continue;
    }

    /* ---------- Estado del pago ---------- */
    const status = weightedPick([
      { value: "completed", weight: 88 },
      { value: "failed", weight: 6 },
      { value: "processing", weight: 3 },
      { value: "refunded", weight: 3 },
    ]);

    // 'processing' solo tiene sentido en pagos recientes de eventos futuros
    if (status === "processing" && (event.isPast || purchaseDate < daysFromNow(-2))) {
      continue;
    }

    const organizer = organizerById.get(ticketType.organizerId)!;
    const plan = organizer.plan;

    // Promoter: 16% de las ventas son por RRPP (solo si el evento tiene promoters asignados)
    const soldByPromoterId = event.promoterIds.length > 0 && chance(0.16) ? pick(event.promoterIds) : null;
    const promoterPct = soldByPromoterId ? weightedPick([
      { value: 5, weight: 30 },
      { value: 7.5, weight: 25 },
      { value: 10, weight: 30 },
      { value: 12.5, weight: 15 },
    ]) : null;

    // Cupón: si el evento tiene cupón con usos disponibles, 35% de chance de usarlo
    let coupon: CouponState | null = null;
    if (event.couponIds.length > 0 && chance(0.35)) {
      const candidate = couponsById.get(pick(event.couponIds))!;
      if (candidate.maxUses === 0 || candidate.usedCount < candidate.maxUses) {
        coupon = candidate;
      }
    }

    const unitPrice = ticketType.price;
    const baseAmount = money(unitPrice * quantity);
    const discountAmount = coupon ? money(baseAmount * (coupon.discountPercent / 100)) : 0;
    const totalAmount = money(baseAmount - discountAmount);
    const serviceFeeAmount = money(totalAmount * (plan.serviceFeePercent / 100));
    const buyerTotalAmount = money(totalAmount + serviceFeeAmount);
    const commissionAmount = money(totalAmount * (plan.commissionPercent / 100));

    const isRefunded = status === "refunded";
    const refundedAt = isRefunded ? randomDateBetween(purchaseDate, NOW) : null;
    const thisPaymentId = paymentId++;

    paymentRows.push([
      thisPaymentId,
      String(54000000000 + thisPaymentId * 7919 + int(0, 7918)), // mpPaymentId estilo MP, determinista y único
      `${event.id}|${ticketType.id}|${buyer.id}|${quantity}`,
      buyer.id,
      JSON.stringify([{ type: "ticket", referenceId: ticketType.id, quantity, unitPrice }]),
      quantity,
      totalAmount,
      baseAmount,
      discountAmount,
      plan.serviceFeePercent,
      serviceFeeAmount,
      buyerTotalAmount,
      plan.commissionPercent,
      status === "completed" || isRefunded ? commissionAmount : 0,
      plan.name,
      organizer.id,
      status,
      purchaseDate.toISOString(),
      refundedAt ? refundedAt.toISOString() : null,
      isRefunded ? (chance(0.8) ? organizer.id : ADMIN_ID) : null,
      isRefunded ? pick(["Solicitud del comprador", "Evento reprogramado", "Compra duplicada", "No pude asistir", "Problema con la acreditación"]) : null,
      isRefunded ? buyerTotalAmount : null,
      null, // deletedAt
    ]);

    // failed/processing NO generan tickets (como en la vida real)
    if (status === "failed" || status === "processing") continue;

    ticketType.soldSoFar += quantity;
    if (coupon) coupon.usedCount++;

    for (let q = 0; q < quantity; q++) {
      const codigo = `EL-${String(event.id).padStart(5, "0")}-${fakeUuid()}`;
      const purchasePricePerTicket = money(totalAmount / quantity);

      let ticketStatus: string;
      let usedAt: Date | null = null;

      if (isRefunded) {
        ticketStatus = "cancelled";
      } else if (event.isPast) {
        // Eventos ya realizados: la mayoría de las entradas se usaron
        ticketStatus = weightedPick([
          { value: "used", weight: 82 },
          { value: "active", weight: 13 }, // no-show
          { value: "cancelled", weight: 5 },
        ]);
        if (ticketStatus === "used") {
          usedAt = randomDateBetween(event.startDateTime, new Date(event.startDateTime.getTime() + 3 * 3600000));
        }
      } else {
        ticketStatus = chance(0.97) ? "active" : "cancelled";
      }

      const promoterAmount = promoterPct ? money(purchasePricePerTicket * (promoterPct / 100)) : null;

      ticketRows.push([
        ticketId++,
        codigo,
        buildQrSvgDataUrl(codigo),
        ticketType.id,
        buyer.id,
        thisPaymentId,
        ticketStatus,
        purchasePricePerTicket,
        soldByPromoterId,
        promoterPct,
        promoterAmount,
        soldByPromoterId ? `RRPP${String(soldByPromoterId).padStart(4, "0")}` : null,
        usedAt ? usedAt.toISOString() : null,
        usedAt ? pick(event.scannerIds) : null,
        purchaseDate.toISOString(),
        usedAt ? usedAt.toISOString() : purchaseDate.toISOString(),
        null,
      ]);
    }
  }

  progress(
    "Payments",
    await batchInsert(
      "payment_log",
      ["id", "mpPaymentId", "externalReference", "userId", "items", "quantity", "totalAmount", "baseAmount", "discountAmount", "serviceFeePercent", "serviceFeeAmount", "buyerTotalAmount", "commissionPercent", "commissionAmount", "organizerPlanName", "organizerId", "status", "createdAt", "refundedAt", "refundedBy", "refundReason", "refundAmount", "deletedAt"],
      paymentRows,
    ),
  );

  progress(
    "Tickets",
    await batchInsert(
      "ticket",
      ["id", "codigo_unico", "qrCode", "ticketTypeId", "userId", "paymentLogId", "status", "purchasePrice", "soldByPromoterId", "promoterCommissionPercentage", "promoterCommissionAmount", "promoterCode", "usedAt", "scannedById", "createdAt", "updatedAt", "deletedAt"],
      ticketRows,
    ),
  );

  if (paymentId <= config.purchases) {
    console.log(`⚠️  Se generaron ${paymentId - 1} de ${config.purchases} compras (capacidad agotada). Subí VOLUME_EVENTS o VOLUME_TICKET_TYPES si querés más volumen.`);
  }
}

/* ============================ CONSISTENCIA FINAL ============================ */

async function enforceConsistency() {
  console.log("🔧 Aplicando actualizaciones de consistencia...");

  // soldCount real = tickets active/used (cancelled no cuentan como vendidos).
  await client.query(`
    UPDATE ticket_type tt
    SET "soldCount" = sub.cnt,
        status = CASE
          WHEN sub.cnt >= tt.capacity THEN 'sold_out'::ticket_type_status_enum
          ELSE 'active'::ticket_type_status_enum
        END
    FROM (
      SELECT "ticketTypeId", COUNT(*)::int AS cnt
      FROM ticket
      WHERE status IN ('active', 'used') AND "deletedAt" IS NULL
      GROUP BY "ticketTypeId"
    ) sub
    WHERE tt.id = sub."ticketTypeId";
  `);

  // usedCount real de cupones
  for (const coupon of couponsState) {
    if (coupon.usedCount > 0) {
      await client.query(`UPDATE coupon SET "usedCount" = $1 WHERE id = $2`, [coupon.usedCount, coupon.id]);
    }
  }

  console.log("✅ Consistencia aplicada\n");
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
    { seq: "coupon_id_seq", table: "coupon" },
    { seq: "promoter_group_id_seq", table: "promoter_group" },
    { seq: "promoter_event_assignment_id_seq", table: "promoter_event_assignment" },
    { seq: "scanner_organizer_assignment_id_seq", table: "scanner_organizer_assignment" },
    { seq: "ticket_id_seq", table: "ticket" },
    { seq: "payment_log_id_seq", table: "payment_log" },
  ];

  for (const item of sequenceQueries) {
    try {
      await client.query(
        `SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${item.table}"), 0) + 1, false)`,
        [item.seq],
      );
    } catch {
      console.warn(`⚠️  No se pudo resetear sequence ${item.seq} (puede no existir).`);
    }
  }

  console.log("✅ Sequences reset");
}

/* ============================ VERIFICACIÓN ============================ */

async function verifyIntegrity() {
  console.log("\n🔍 Verificación de integridad:");

  const checks: Array<[string, string]> = [
    ["Pagos completed/refunded sin tickets (debería ser 0)", `
      SELECT COUNT(*) AS n FROM payment_log p
      WHERE p.status IN ('completed','refunded')
        AND NOT EXISTS (SELECT 1 FROM ticket t WHERE t."paymentLogId" = p.id)
    `],
    ["Tickets active/used sin pago y con precio > 0 (debería ser 0)", `
      SELECT COUNT(*) AS n FROM ticket t
      JOIN ticket_type tt ON tt.id = t."ticketTypeId"
      WHERE t.status IN ('active','used') AND t."paymentLogId" IS NULL AND tt.price > 0
    `],
    ["Ticket types con soldCount != tickets reales (debería ser 0)", `
      SELECT COUNT(*) AS n FROM ticket_type tt
      WHERE tt."soldCount" <> COALESCE((
        SELECT COUNT(*) FROM ticket t
        WHERE t."ticketTypeId" = tt.id AND t.status IN ('active','used') AND t."deletedAt" IS NULL
      ), 0)
    `],
    ["Ticket types que exceden capacity (debería ser 0)", `
      SELECT COUNT(*) AS n FROM ticket_type WHERE "soldCount" > capacity
    `],
    ["Compras posteriores al evento (debería ser 0)", `
      SELECT COUNT(*) AS n FROM payment_log p
      JOIN ticket_type tt ON tt.id = (p.items->0->>'referenceId')::int
      JOIN event e ON e.id = tt."eventId"
      WHERE p."createdAt" > e."startDateTime" AND p.status <> 'processing'
    `],
  ];

  for (const [label, query] of checks) {
    const result = await client.query(query);
    console.log(`  ${result.rows[0].n === "0" ? "✅" : "❌"} ${label}: ${result.rows[0].n}`);
  }

  const summary = await client.query(`
    SELECT 'users' AS tabla, COUNT(*) AS n FROM "user"
    UNION ALL SELECT 'events', COUNT(*) FROM event
    UNION ALL SELECT 'ticket_types', COUNT(*) FROM ticket_type
    UNION ALL SELECT 'payments', COUNT(*) FROM payment_log
    UNION ALL SELECT 'tickets', COUNT(*) FROM ticket
    UNION ALL SELECT 'coupons', COUNT(*) FROM coupon
    UNION ALL SELECT 'promoter_groups', COUNT(*) FROM promoter_group
    UNION ALL SELECT 'scanner_assignments', COUNT(*) FROM scanner_organizer_assignment
    ORDER BY tabla
  `);

  console.log("\n📊 Resumen final:");
  for (const row of summary.rows) {
    console.log(`  ${row.tabla}: ${row.n}`);
  }
}

/* ============================ MAIN ============================ */

async function main() {
  const hasPgVars = env.PGHOST && env.PGUSER && env.PGPASSWORD && env.PGDATABASE;
  if (!connectionUrl && !hasPgVars) {
    throw new Error("Falta DATABASE_URL/POSTGRES_URL o las variables PG* en el entorno.");
  }

  console.log("\n🚀 EventLife Volume Seed v2 (realista + coherente)");
  console.log("Config:", { ...config, seed: `"${config.seed}"` });
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
    await seedCoupons();
    await seedPromoters();
    await seedScannerAssignments();
    await seedPurchases();
    await enforceConsistency();
    await resetSequences();

    await client.query("COMMIT");

    await verifyIntegrity();
    await client.query("ANALYZE");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  console.log(`\n✅ Total de filas insertadas: ${totalInserted}`);
  console.log("\n🔑 Cuentas de prueba (password: 12345678):");
  console.log("  admin@eventlife.com | organizer@eventlife.com | user@eventlife.com");
  console.log("\n🎉 Volume seed completed!");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
