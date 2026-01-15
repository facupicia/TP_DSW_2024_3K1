import fs from 'fs';
import path from 'path';
import AppDataSource from '../../config/database';

async function runMigration() {
    try {
        console.log("Initializing database connection...");
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database connected.");

        const migrationPath = path.join(__dirname, '../../sql/migration_v2.sql');
        console.log(`Reading migration file from: ${migrationPath}`);

        if (!fs.existsSync(migrationPath)) {
            console.error("Migration file not found!");
            process.exit(1);
        }

        const sql = fs.readFileSync(migrationPath, 'utf-8');

        console.log("Executing migration...");
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();

        // Ejecutamos el SQL. 
        // Nota: split(';') es una forma ingenua de separar comandos, pero para este script simple
        // donde usamos bloques DO $$ puede ser problemático si partimos mal.
        // TypeORM query runner suele aceptar strings largos con múltiples comandos en Postgres.
        await queryRunner.query(sql);

        console.log("Migration executed successfully!");

        await queryRunner.release();
        // No destruimos la conexión si el script se queda colgado, pero aquí es un script de una sola vez.
        // await AppDataSource.destroy(); 
        process.exit(0);
    } catch (error) {
        console.error("Error running migration:", error);
        process.exit(1);
    }
}

runMigration();
