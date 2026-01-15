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
import { Event } from "../../event/event.entity";

async function migrateOrganizers() {
    try {
        await AppDataSource.initialize();
        console.log("📦 Database connected");

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

        // Update users with 'user' role to 'organizer'
        const result = await AppDataSource
            .getRepository(User)
            .createQueryBuilder()
            .update(User)
            .set({ rol: 'organizer' })
            .where("id IN (:...ids)", { ids: userIds })
            .andWhere("rol = :rol", { rol: 'user' })
            .execute();

        console.log(`✅ Promoted ${result.affected} users to 'organizer' role`);

    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    } finally {
        await AppDataSource.destroy();
        console.log("🔌 Database connection closed");
    }
}

migrateOrganizers();
