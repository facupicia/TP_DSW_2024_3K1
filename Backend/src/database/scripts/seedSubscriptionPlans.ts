/**
 * Seed Script: Create default subscription plans (FREE and PRO)
 * 
 * Run with: npx ts-node src/scripts/seedSubscriptionPlans.ts
 */

import "reflect-metadata";
import AppDataSource from "../../config/database";
import { SubscriptionPlan } from "../../subscription/subscription_plan.entity";
import { UserSubscription, SubscriptionStatus } from "../../subscription/user_subscription.entity";
import { User } from "../../user/user.entity";

async function seedSubscriptionPlans() {
    try {
        await AppDataSource.initialize();
        console.log("📦 Database connected");

        const planRepo = AppDataSource.getRepository(SubscriptionPlan);
        const subscriptionRepo = AppDataSource.getRepository(UserSubscription);
        const userRepo = AppDataSource.getRepository(User);

        // ============ CREATE PLANS ============
        console.log("\n📋 Creating subscription plans...");

        // FREE Plan
        let freePlan = await planRepo.findOne({ where: { name: 'FREE' } });
        if (!freePlan) {
            freePlan = planRepo.create({
                name: 'FREE',
                displayName: 'Plan Gratuito',
                monthlyPrice: 0,
                yearlyPrice: null,
                maxEventsPerMonth: 3,
                maxTicketTypesPerEvent: 1,
                commissionPercent: 8.00,
                features: {
                    advancedDashboard: false,
                    exportSales: false,
                    featuredEvents: false,
                    prioritySupport: false,
                    removeBranding: false
                },
                sortOrder: 0,
                active: true
            });
            await planRepo.save(freePlan);
            console.log("  ✅ Created FREE plan");
        } else {
            console.log("  ℹ️ FREE plan already exists");
        }

        // PRO Plan
        let proPlan = await planRepo.findOne({ where: { name: 'PRO' } });
        if (!proPlan) {
            proPlan = planRepo.create({
                name: 'PRO',
                displayName: 'Plan Profesional',
                monthlyPrice: 4999.00, // $4,999 ARS
                yearlyPrice: 39999.00, // $39,999 ARS (2 months free)
                maxEventsPerMonth: -1, // Unlimited
                maxTicketTypesPerEvent: -1, // Unlimited
                commissionPercent: 2.50,
                features: {
                    advancedDashboard: true,
                    exportSales: true,
                    featuredEvents: true,
                    prioritySupport: true,
                    removeBranding: true,
                    customBranding: true
                },
                sortOrder: 1,
                active: true
            });
            await planRepo.save(proPlan);
            console.log("  ✅ Created PRO plan");
        } else {
            console.log("  ℹ️ PRO plan already exists");
        }

        // ============ ASSIGN FREE TO ORGANIZERS ============
        console.log("\n👥 Assigning FREE plan to existing organizers...");

        // Find all organizers without a subscription
        const organizers = await userRepo.find({
            where: { roles: 'organizer' }
        });

        let assignedCount = 0;
        for (const organizer of organizers) {
            // Check if already has a subscription
            const existingSub = await subscriptionRepo.findOne({
                where: { userId: organizer.id, status: SubscriptionStatus.ACTIVE }
            });

            if (!existingSub) {
                const subscription = subscriptionRepo.create({
                    userId: organizer.id,
                    planId: freePlan.id,
                    status: SubscriptionStatus.ACTIVE,
                    billingCycle: 'monthly',
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: null // FREE never expires
                });
                await subscriptionRepo.save(subscription);
                assignedCount++;
            }
        }

        console.log(`  ✅ Assigned FREE plan to ${assignedCount} organizers`);
        console.log(`  ℹ️ Total organizers: ${organizers.length}`);

        // ============ SUMMARY ============
        console.log("\n📊 Final summary:");
        const allPlans = await planRepo.find({ order: { sortOrder: 'ASC' } });
        for (const plan of allPlans) {
            const subCount = await subscriptionRepo.count({
                where: { planId: plan.id, status: SubscriptionStatus.ACTIVE }
            });
            console.log(`  - ${plan.name}: ${subCount} active subscriptions`);
        }

    } catch (error) {
        console.error("❌ Seed failed:", error);
        process.exit(1);
    } finally {
        await AppDataSource.destroy();
        console.log("\n🔌 Database connection closed");
    }
}

seedSubscriptionPlans();
