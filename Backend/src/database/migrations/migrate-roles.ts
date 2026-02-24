/**
 * Migration script to convert single 'rol' column to 'roles' array
 * Run with: npx ts-node src/database/migrations/migrate-roles.ts
 */

import AppDataSource from "../../db";
import { User } from "../../user/user.entity";

async function migrateRoles() {
    console.log('Starting role migration...');
    
    try {
        // Initialize data source
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        
        const userRepo = AppDataSource.getRepository(User);
        
        // Get all users with their current 'rol' field
        // We need to access the old 'rol' column before it's renamed
        const queryRunner = AppDataSource.createQueryRunner();
        
        // Check if 'rol' column exists
        const hasRolColumn = await queryRunner.hasColumn('user', 'rol');
        const hasRolesColumn = await queryRunner.hasColumn('user', 'roles');
        
        if (!hasRolColumn) {
            console.log('No legacy "rol" column found. Migration may have already run.');
            if (hasRolesColumn) {
                console.log('"roles" column exists. Skipping migration.');
            }
            await queryRunner.release();
            process.exit(0);
        }
        
        // Get all users with their current role
        const users = await queryRunner.query(`
            SELECT id, rol FROM "user" WHERE rol IS NOT NULL
        `);
        
        console.log(`Found ${users.length} users to migrate`);
        
        // Update each user to have roles array
        for (const userData of users) {
            const roles = [userData.rol]; // Convert single role to array
            
            await queryRunner.query(`
                UPDATE "user" SET roles = $1 WHERE id = $2
            `, [roles.join(','), userData.id]);
            
            console.log(`Migrated user ${userData.id}: ${userData.rol} -> [${roles.join(', ')}]`);
        }
        
        console.log('Migration completed successfully!');
        console.log(`Migrated ${users.length} users`);
        
        await queryRunner.release();
        process.exit(0);
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateRoles();
