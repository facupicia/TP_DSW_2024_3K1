import fs from "fs";
import path from "path";
import AppDataSource from "../../config/database";

async function runQueryIndexes() {
    const migrationPath = path.join(__dirname, "../migrations/add-query-optimization-indexes.sql");

    try {
        console.log("Initializing database connection...");
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }

        const sql = fs.readFileSync(migrationPath, "utf-8");
        console.log(`Applying query optimization indexes from: ${migrationPath}`);

        await AppDataSource.query(sql);

        console.log("Query optimization indexes applied successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error applying query optimization indexes:", error);
        process.exit(1);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}

runQueryIndexes();
