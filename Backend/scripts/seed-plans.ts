/**
 * Script para crear planes de suscripción iniciales
 * 
 * Ejecutar: npx ts-node scripts/seed-plans.ts
 */

import AppDataSource from '../src/db';
import { SubscriptionPlan } from '../src/subscription/subscription_plan.entity';

async function seedPlans() {
    try {
        await AppDataSource.initialize();
        console.log('✓ Base de datos conectada');

        const planRepo = AppDataSource.getRepository(SubscriptionPlan);

        // Verificar si ya existen planes
        const existingPlans = await planRepo.count();
        if (existingPlans > 0) {
            console.log(`⚠️  Ya existen ${existingPlans} planes en la base de datos`);
            console.log('   Usa --force para recrearlos');
            
            // Mostrar planes existentes
            const plans = await planRepo.find();
            console.log('\nPlanes existentes:');
            plans.forEach(p => console.log(`  - ${p.name}: $${p.monthlyPrice}/mes`));
            
            await AppDataSource.destroy();
            return;
        }

        // Plan FREE
        const freePlan = planRepo.create({
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
                removeBranding: false,
                customBranding: false
            },
            active: true,
            sortOrder: 0
        });

        // Plan PRO
        const proPlan = planRepo.create({
            name: 'PRO',
            displayName: 'Plan Pro',
            monthlyPrice: 9990, // ~10 USD en ARS
            yearlyPrice: 99900, // 2 meses gratis
            maxEventsPerMonth: -1, // Ilimitado
            maxTicketTypesPerEvent: -1, // Ilimitado
            commissionPercent: 3.00,
            features: {
                advancedDashboard: true,
                exportSales: true,
                featuredEvents: true,
                prioritySupport: true,
                removeBranding: true,
                customBranding: true
            },
            active: true,
            sortOrder: 1
        });

        await planRepo.save([freePlan, proPlan]);

        console.log('\n✅ Planes creados exitosamente:');
        console.log('  - FREE: $0/mes (8% comisión)');
        console.log('  - PRO: $9,990/mes (3% comisión)');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await AppDataSource.destroy();
    }
}

seedPlans();
