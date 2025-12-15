import "reflect-metadata";
import AppDataSource from "../db";

async function run() {
    await AppDataSource.initialize();
    const type = (AppDataSource.options as any).type;
    if (type === "postgres") {
        const rows = await AppDataSource.query(
            "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('ticket','event','\"user\"') AND column_name IN ('usedAt','createdAt','updateAd') ORDER BY table_name, column_name"
        );
        console.table(rows);
    } else {
        const rows = await AppDataSource.query(
            "SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name, DATA_TYPE as data_type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('ticket','event','user') AND COLUMN_NAME IN ('usedAt','createdAt','updateAd') ORDER BY TABLE_NAME, COLUMN_NAME"
        );
        console.table(rows);
    }
    await AppDataSource.destroy();
    process.exit(0);
}

run().catch((e) => {
    console.error("TEST_TIMESTAMP_ERROR", e);
    process.exit(1);
});

