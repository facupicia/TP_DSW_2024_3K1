import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { Category } from "../category/category.entity";

function ds(opts: {
    type: "mysql" | "postgres";
    url?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
}) {
    return new DataSource({
        type: opts.type as any,
        url: opts.url,
        host: opts.host,
        port: opts.port,
        username: opts.user,
        password: opts.password,
        database: opts.database,
        ssl: opts.type === "postgres" ? true : undefined,
        logging: false,
        entities: [User, Event, Ticket, Category],
        extra: opts.type === "postgres" ? { ssl: { rejectUnauthorized: false } } : undefined,
    });
}

async function countAll(conn: DataSource) {
    const r = {
        categories: await conn.getRepository(Category).count(),
        users: await conn.getRepository(User).count(),
        events: await conn.getRepository(Event).count(),
        tickets: await conn.getRepository(Ticket).count(),
    };
    return r;
}

async function run() {
    const mysql = ds({
        type: "mysql",
        host: process.env.MYSQL_HOST || process.env.MYSQL_ADDON_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || process.env.MYSQL_ADDON_USER || "root",
        password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ADDON_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || process.env.DB_NAME || "eventlife",
    });
    const pg = ds({
        type: "postgres",
        url: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    });

    await mysql.initialize();
    await pg.initialize();
    const a = await countAll(mysql);
    const b = await countAll(pg);
    console.table({ mysql: a, postgres: b });
    await mysql.destroy();
    await pg.destroy();
    process.exit(0);
}

run().catch((e) => {
    console.error("VERIFY_ERROR", e);
    process.exit(1);
});

