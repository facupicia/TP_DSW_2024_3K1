/**
 * Seed Script: Create default subscription plans (FREE, STARTER, PRO)
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
                maxProductsInCatalog: 0,
                canSellExtras: false,
                commissionPercent: 8.00,
                serviceFeePercent: 12.00,
                minimumServiceFee: 0,
                features: {
                    advancedDashboard: false,
                    exportSales: false,
                    featuredEvents: false,
                    prioritySupport: false,
                    removeBranding: false,
                    customBranding: false
                },
                sortOrder: 0,
                active: true
            });
            await planRepo.save(freePlan);
            console.log("  ✅ Created FREE plan");
        } else {
            console.log("  ℹ️ FREE plan already exists");
        }

        // STARTER Plan
        let starterPlan = await planRepo.findOne({ where: { name: 'STARTER' } });
        if (!starterPlan) {
            starterPlan = planRepo.create({
                name: 'STARTER',
                displayName: 'Plan Starter',
                monthlyPrice: 3499.00,
                yearlyPrice: 34990.00,
                maxEventsPerMonth: 10,
                maxTicketTypesPerEvent: 3,
                maxProductsInCatalog: 10,
                canSellExtras: true,
                commissionPercent: 5.00,
                serviceFeePercent: 9.00,
                minimumServiceFee: 0,
                features: {
                    advancedDashboard: true,
                    exportSales: false,
                    featuredEvents: false,
                    prioritySupport: false,
                    removeBranding: false,
                    customBranding: false
                },
                sortOrder: 1,
                active: true
            });
            await planRepo.save(starterPlan);
            console.log("  ✅ Created STARTER plan");
        } else {
            console.log("  ℹ️ STARTER plan already exists");
        }

        // PRO Plan
        let proPlan = await planRepo.findOne({ where: { name: 'PRO' } });
        if (!proPlan) {
            proPlan = planRepo.create({
                name: 'PRO',
                displayName: 'Plan Profesional',
                monthlyPrice: 8999.00,
                yearlyPrice: 89990.00,
                maxEventsPerMonth: -1,
                maxTicketTypesPerEvent: -1,
                maxProductsInCatalog: -1,
                canSellExtras: true,
                commissionPercent: 2.50,
                serviceFeePercent: 6.00,
                minimumServiceFee: 0,
                features: {
                    advancedDashboard: true,
                    exportSales: true,
                    featuredEvents: true,
                    prioritySupport: true,
                    removeBranding: true,
                    customBranding: true
                },
                sortOrder: 2,
                active: true
            });
            await planRepo.save(proPlan);
            console.log("  ✅ Created PRO plan");
        } else {
            console.log("  ℹ️ PRO plan already exists");
        }

        // ============ ASSIGN FREE TO ORGANIZERS ============
        console.log("\n👥 Assigning FREE plan to existing organizers without active subscription...");

        const organizers = await userRepo.createQueryBuilder('user')
            .innerJoin('user.roles', 'role')
            .where('role.name = :role', { role: 'organizer' })
            .getMany();

        let assignedCount = 0;
        for (const organizer of organizers) {
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
                    currentPeriodEnd: null
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
