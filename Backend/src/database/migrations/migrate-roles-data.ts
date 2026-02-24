/**
 * Data-only migration script
 * Migrates data from 'rol' column to 'roles' column
 * Run with: npx ts-node src/database/migrations/migrate-roles-data.ts
 */

import AppDataSource from "../../db";

async function migrateRolesData() {
    console.log('Starting data migration...\n');
    
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        
        const queryRunner = AppDataSource.createQueryRunner();
        
        // Check current state
        const checkResult = await queryRunner.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN roles IS NOT NULL AND roles != '' THEN 1 END) as with_roles,
                COUNT(CASE WHEN rol IS NOT NULL AND rol != '' THEN 1 END) as with_rol
            FROM "user"
        `);
        
        console.log('Current state:');
        console.log(`  Total users: ${checkResult[0].total}`);
        console.log(`  With 'roles': ${checkResult[0].with_roles}`);
        console.log(`  With legacy 'rol': ${checkResult[0].with_rol}`);
        console.log('');
        
        // Find users that need migration (have rol but no roles)
        const usersToMigrate = await queryRunner.query(`
            SELECT id, firstname, lastname, rol
            FROM "user"
            WHERE (roles IS NULL OR roles = '') 
              AND rol IS NOT NULL
        `);
        
        if (usersToMigrate.length === 0) {
            console.log('✓ No users need migration. All users already have roles data.');
            await queryRunner.release();
            process.exit(0);
        }
        
        console.log(`Found ${usersToMigrate.length} users to migrate:\n`);
        
        // Migrate each user
        let migrated = 0;
        for (const user of usersToMigrate) {
            await queryRunner.query(
                `UPDATE "user" SET roles = $1 WHERE id = $2`,
                [user.rol, user.id]
            );
            console.log(`  ✓ User ${user.id} (${user.firstname} ${user.lastname}): ${user.rol} → [${user.rol}]`);
            migrated++;
        }
        
        console.log(`\n✓ Migration completed! Migrated ${migrated} users.`);
        
        // Verify final state
        const finalCheck = await queryRunner.query(`
            SELECT COUNT(*) as with_roles
            FROM "user"
            WHERE roles IS NOT NULL AND roles != ''
        `);
        console.log(`\nFinal state: ${finalCheck[0].with_roles}/${checkResult[0].total} users have roles data.`);
        
        await queryRunner.release();
        process.exit(0);
        
    } catch (error) {
        console.error('\n✗ Migration failed:', error);
        process.exit(1);
    }
}

migrateRolesData();
