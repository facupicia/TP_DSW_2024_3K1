import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { Category } from "../category/category.entity";

function mysqlDS() {
    return new DataSource({
        type: "mysql",
        host: process.env.MYSQL_HOST || process.env.MYSQL_ADDON_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        username: process.env.MYSQL_USER || process.env.MYSQL_ADDON_USER || "root",
        password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ADDON_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || process.env.DB_NAME || "eventlife",
        synchronize: false,
        logging: false,
        entities: [User, Event, Ticket, Category],
    });
}

function postgresDS() {
    return new DataSource({
        type: "postgres",
        url: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        ssl: true,
        synchronize: true,
        logging: false,
        entities: [User, Event, Ticket, Category],
        extra: { ssl: { rejectUnauthorized: false } },
    });
}

async function run() {
    const mysql = mysqlDS();
    const pg = postgresDS();
    await mysql.initialize();
    await pg.initialize();

    const cats = await mysql.getRepository(Category).find();
    if (cats.length) await pg.getRepository(Category).save(cats);

    const users = await mysql.getRepository(User).find();
    if (users.length) await pg.getRepository(User).save(users);

    const events = await mysql.getRepository(Event).find();
    if (events.length) await pg.getRepository(Event).save(events);

    const tickets = await mysql.getRepository(Ticket).find();
    if (tickets.length) await pg.getRepository(Ticket).save(tickets);

    await mysql.destroy();
    await pg.destroy();
    process.exit(0);
}

run().catch((e) => {
    console.error("MIGRATION_ERROR", e);
    process.exit(1);
});

