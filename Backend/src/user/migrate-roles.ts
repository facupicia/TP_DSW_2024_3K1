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

        // Legacy role migration has been completed. This function now only ensures
        // that the predefined roles exist in the Role table.
    } catch (error) {
        console.error('❌ Error migrating legacy roles:', error);
        // Do not throw to avoid blocking app startup
    }
}
