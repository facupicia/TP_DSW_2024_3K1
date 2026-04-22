import AppDataSource from "../config/database";
import { User } from "./user.entity";
import { Role } from "./role.entity";

/**
 * Idempotent migration from legacy simple-array roles to normalized Role table.
 * Run this after AppDataSource.initialize() and before serving traffic.
 */
export async function migrateLegacyRoles(): Promise<void> {
    try {
        const dataSource = AppDataSource;
        if (!dataSource.isInitialized) {
            console.log("⏭️ Skipping role migration: DataSource not initialized");
            return;
        }

        const userRepo = dataSource.getRepository(User);
        const roleRepo = dataSource.getRepository(Role);

        // 1. Ensure predefined roles exist
        const roleNames = ['user', 'rrpp', 'scanner', 'organizer', 'admin'];
        const rolesMap: Record<string, Role> = {};
        for (const name of roleNames) {
            let role = await roleRepo.findOne({ where: { name } });
            if (!role) {
                role = roleRepo.create({ name });
                await roleRepo.save(role);
                console.log(`🔑 Created role: ${name}`);
            }
            rolesMap[name] = role;
        }

        // 2. Find users with legacy roles that haven't been migrated yet
        // We detect unmigrated users by checking if user_roles is empty
        const usersWithLegacy = await userRepo
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.roles', 'role')
            .where('user.roles IS NOT NULL')
            .getMany();

        let migratedCount = 0;
        for (const user of usersWithLegacy) {
            // Skip if already has roles in the new table
            if (user.roles && user.roles.length > 0) continue;

            const legacy = user.legacyRoles;
            if (!legacy || legacy.length === 0) continue;

            const roleNamesForUser = Array.isArray(legacy)
                ? legacy
                : (legacy as any).toString().split(',').map((r: string) => r.trim()).filter(Boolean);

            const rolesToAssign: Role[] = [];
            for (const rName of roleNamesForUser) {
                if (rolesMap[rName]) {
                    rolesToAssign.push(rolesMap[rName]);
                }
            }

            if (rolesToAssign.length === 0) {
                // Fallback: assign 'user' if no valid roles found
                rolesToAssign.push(rolesMap['user']);
            }

            user.roles = rolesToAssign;
            await userRepo.save(user);
            migratedCount++;
        }

        if (migratedCount > 0) {
            console.log(`✅ Migrated ${migratedCount} users from legacy roles to Role table`);
        } else {
            console.log('✓ No legacy roles to migrate');
        }
    } catch (error) {
        console.error('❌ Error migrating legacy roles:', error);
        // Do not throw to avoid blocking app startup
    }
}
