/**
 * Data-only migration script
 * Migrates data from legacy 'rol' column to 'roles' column.
 *
 * Safe to run even if the legacy 'rol' column no longer exists.
 * Run manually with:
 *   npx ts-node src/database/migrations/migrate-roles-data.ts
 */

import AppDataSource from "../../db";

async function columnExists(
  queryRunner: any,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await queryRunner.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return result.length > 0;
}

export async function migrateRolesData() {
  console.log("Starting role migration...");
  console.log("Starting data migration...\n");

  let shouldDestroyDataSource = false;
  let queryRunner: any;

  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      shouldDestroyDataSource = true;
    }

    queryRunner = AppDataSource.createQueryRunner();

    const hasRolesColumn = await columnExists(queryRunner, "user", "roles");
    const hasRolColumn = await columnExists(queryRunner, "user", "rol");

    if (!hasRolesColumn) {
      console.log('✓ Column "roles" does not exist. Skipping role migration.');
      return;
    }

    const checkResult = await queryRunner.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN roles IS NOT NULL AND roles != '' THEN 1 END) as with_roles
      FROM "user"
    `);

    console.log("Current state:");
    console.log(`  Total users: ${checkResult[0].total}`);
    console.log(`  With 'roles': ${checkResult[0].with_roles}`);

    if (!hasRolColumn) {
      console.log("  With legacy 'rol': 0");
      console.log('\n✓ Legacy column "rol" does not exist. Nothing to migrate.');
      return;
    }

    const legacyCheck = await queryRunner.query(`
      SELECT COUNT(*) as with_rol
      FROM "user"
      WHERE rol IS NOT NULL AND rol != ''
    `);

    console.log(`  With legacy 'rol': ${legacyCheck[0].with_rol}`);
    console.log("");

    const usersToMigrate = await queryRunner.query(`
      SELECT id, firstname, lastname, rol
      FROM "user"
      WHERE (roles IS NULL OR roles = '')
        AND rol IS NOT NULL
        AND rol != ''
    `);

    if (usersToMigrate.length === 0) {
      console.log("✓ No users need migration. All users already have roles data.");
      return;
    }

    console.log(`Found ${usersToMigrate.length} users to migrate:\n`);

    let migrated = 0;

    for (const user of usersToMigrate) {
      await queryRunner.query(
        `UPDATE "user" SET roles = $1 WHERE id = $2`,
        [user.rol, user.id]
      );

      console.log(
        `  ✓ User ${user.id} (${user.firstname ?? ""} ${user.lastname ?? ""}): ${user.rol} → ${user.rol}`
      );

      migrated++;
    }

    console.log(`\n✓ Migration completed! Migrated ${migrated} users.`);

    const finalCheck = await queryRunner.query(`
      SELECT COUNT(*) as with_roles
      FROM "user"
      WHERE roles IS NOT NULL AND roles != ''
    `);

    console.log(
      `\nFinal state: ${finalCheck[0].with_roles}/${checkResult[0].total} users have roles data.`
    );
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    throw error;
  } finally {
    if (queryRunner) {
      await queryRunner.release();
    }

    if (shouldDestroyDataSource && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

if (require.main === module) {
  migrateRolesData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n✗ Migration failed:", error);
      process.exit(1);
    });
}
