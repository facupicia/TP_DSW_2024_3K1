import AppDataSource from "../db";

async function run() {
    const ds = AppDataSource;
    if (!ds.isInitialized) await ds.initialize();
    const q = ds.createQueryRunner();
    await q.connect();
    try {
        await q.query(`ALTER TABLE "user" RENAME COLUMN "updateAd" TO "updatedAt";`);
        await q.query(`ALTER TABLE "event" RENAME COLUMN "updateAd" TO "updatedAt";`);
        console.log("Columns renamed to updatedAt");
    } catch (e: any) {
        console.error("MIGRATION_ERROR", e?.message || e);
    } finally {
        await q.release();
        await ds.destroy();
    }
}

run();

