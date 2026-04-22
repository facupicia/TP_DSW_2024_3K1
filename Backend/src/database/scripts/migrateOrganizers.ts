/**
 * Migration Script: Promote existing event creators to 'organizer' role
 * 
 * This script finds all users who have created events but still have 'user' role
 * and promotes them to 'organizer' role.
 * 
 * Run with: npx ts-node src/scripts/migrateOrganizers.ts
 */

import "reflect-metadata";
import AppDataSource from "../../config/database";
import { User } from "../../user/user.entity";
import { Role, getRoleNames } from "../../user/role.entity";
import { Event } from "../../event/event.entity";

async function migrateOrganizers() {
    try {
        await AppDataSource.initialize();
        console.log("📦 Database connected");

        // Ensure organizer role exists
        const roleRepo = AppDataSource.getRepository(Role);
        let organizerRole = await roleRepo.findOne({ where: { name: 'organizer' } });
        if (!organizerRole) {
            organizerRole = roleRepo.create({ name: 'organizer' });
            await roleRepo.save(organizerRole);
        }

        // Find all users who have created events
        const usersWithEvents = await AppDataSource
            .getRepository(Event)
            .createQueryBuilder("event")
            .select("DISTINCT event.user_id", "userId")
            .getRawMany();

        const userIds = usersWithEvents.map(row => row.userId);

        if (userIds.length === 0) {
            console.log("ℹ️ No users with events found");
            return;
        }

        console.log(`🔍 Found ${userIds.length} users with events`);

        // Load users and promote those with only 'user' role
        const userRepo = AppDataSource.getRepository(User);
        let promotedCount = 0;
        for (const userId of userIds) {
            const user = await userRepo.findOne({ where: { id: userId }, relations: ['roles'] });
            if (!user) continue;

            const roleNames = getRoleNames(user);
            if (roleNames.length === 1 && roleNames[0] === 'user') {
                user.roles = [organizerRole];
                await userRepo.save(user);
                promotedCount++;
            }
        }

        console.log(`✅ Promoted ${promotedCount} users to 'organizer' role`);

    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    } finally {
        await AppDataSource.destroy();
        console.log("🔌 Database connection closed");
    }
}

migrateOrganizers();
