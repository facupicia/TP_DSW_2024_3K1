import "reflect-metadata";
import AppDataSource from "../db";

async function run() {
    try {
        const opts = AppDataSource.options as any;
        console.log("DB_OPTS", {
            type: opts.type,
            host: opts.host,
            url: opts.url ? "***" : undefined,
            database: opts.database,
            ssl: opts.ssl ? true : false
        });
        await AppDataSource.initialize();
        const result = await AppDataSource.query("SELECT 1");
        console.log("DB_OK", result);
        await AppDataSource.destroy();
        process.exit(0);
    } catch (e: any) {
        console.error("DB_ERROR", e?.message || e);
        process.exit(1);
    }
}

run();

