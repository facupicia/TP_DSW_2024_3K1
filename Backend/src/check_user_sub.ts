import "reflect-metadata";
import AppDataSource from "./db";
import { UserSubscription, SubscriptionStatus } from "./subscription/user_subscription.entity";
import { User } from "./user/user.entity";
import { SubscriptionPlan } from "./subscription/subscription_plan.entity";

async function check() {
    try {
        await AppDataSource.initialize();
        console.log("Database connected");

        const userId = 14;

        const subs = await AppDataSource.getRepository(UserSubscription).find({
            where: { userId: userId },
            relations: ["plan"],
            order: { createdAt: "DESC" }
        });

        console.log(`Found ${subs.length} subscriptions for user ${userId}:`);

        subs.forEach(sub => {
            console.log("------------------------------------------");
            console.log(`ID: ${sub.id}`);
            console.log(`Plan: ${sub.plan?.name} (${sub.plan?.displayName})`);
            console.log(`Status: ${sub.status}`);
            console.log(`Start: ${sub.currentPeriodStart}`);
            console.log(`End: ${sub.currentPeriodEnd}`);
            console.log(`Now: ${new Date()}`);
            if (sub.currentPeriodEnd) {
                console.log(`Is Expired? ${new Date() > sub.currentPeriodEnd}`);
            }
            console.log("------------------------------------------");
        });

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await AppDataSource.destroy();
    }
}

check();
