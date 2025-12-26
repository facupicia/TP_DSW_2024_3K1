import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { Category } from "../category/category.entity";

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
        logging: false,
        entities: [User, Event, Ticket, Category],
        extra: { ssl: { rejectUnauthorized: false } },
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
    const pg = postgresDS();
    await pg.initialize();
    const counts = await countAll(pg);
    console.table({ postgres: counts });
    await pg.destroy();
    process.exit(0);
}

run().catch((e) => {
    console.error("VERIFY_ERROR", e);
    process.exit(1);
});

