/**
 * Database Seed Script
 * Run with: npm run seed
 */
import AppDataSource from './config/database';
import { Category } from './category/category.entity';
import { User } from './user/user.entity';
import { Event } from './event/event.entity';
import { TicketType, TicketTypeStatus } from './ticketType/ticketType.entity';
import { SubscriptionPlan } from './subscription/subscription_plan.entity';
import { PromoterGroup } from './promoter/promoter.entity';
import { PromoterEventAssignment } from './promoter/promoter.entity';
import { PaymentLog, PaymentStatus } from './payment/payment.entity';
import bcrypt from 'bcrypt';

async function seed() {
    console.log('🌱 Starting database seed...\n');
    
    try {
        // Initialize connection
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        
        try {
            // 1. Categories
            console.log('📁 Creating categories...');
            const categories = [
                { id: 1, name: 'Música' },
                { id: 2, name: 'Deportes' },
                { id: 3, name: 'Tecnología' },
                { id: 4, name: 'Arte y Cultura' },
                { id: 5, name: 'Gastronomía' },
                { id: 6, name: 'Negocios' },
                { id: 7, name: 'Entretenimiento' },
                { id: 8, name: 'Educación' }
            ];
            
            for (const cat of categories) {
                await queryRunner.manager.query(
                    `INSERT INTO category (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
                    [cat.id, cat.name]
                );
            }
            console.log('✅ Categories created\n');

            // 2. Subscription Plans
            console.log('💎 Creating subscription plans...');
            const plans = [
                {
                    id: 1,
                    name: 'FREE',
                    displayName: 'Gratis',
                    monthlyPrice: 0,
                    yearlyPrice: 0,
                    maxEventsPerMonth: 1,
                    maxTicketTypesPerEvent: 1,
                    commissionPercent: 15,
                    features: { advancedDashboard: false, exportSales: false, featuredEvents: false, prioritySupport: false },
                    active: true,
                    sortOrder: 1
                },
                {
                    id: 2,
                    name: 'STARTER',
                    displayName: 'Starter',
                    monthlyPrice: 9999,
                    yearlyPrice: 99999,
                    maxEventsPerMonth: 5,
                    maxTicketTypesPerEvent: 3,
                    commissionPercent: 10,
                    features: { advancedDashboard: true, exportSales: false, featuredEvents: false, prioritySupport: false },
                    active: true,
                    sortOrder: 2
                },
                {
                    id: 3,
                    name: 'PRO',
                    displayName: 'Pro',
                    monthlyPrice: 29999,
                    yearlyPrice: 299999,
                    maxEventsPerMonth: -1,
                    maxTicketTypesPerEvent: -1,
                    commissionPercent: 5,
                    features: { advancedDashboard: true, exportSales: true, featuredEvents: true, prioritySupport: true },
                    active: true,
                    sortOrder: 3
                }
            ];
            
            for (const plan of plans) {
                await queryRunner.manager.query(
                    `INSERT INTO subscription_plan (id, name, "displayName", "monthlyPrice", "yearlyPrice", "maxEventsPerMonth", "maxTicketTypesPerEvent", "commissionPercent", features, active, "sortOrder", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [plan.id, plan.name, plan.displayName, plan.monthlyPrice, plan.yearlyPrice, 
                     plan.maxEventsPerMonth, plan.maxTicketTypesPerEvent, plan.commissionPercent, 
                     JSON.stringify(plan.features), plan.active, plan.sortOrder]
                );
            }
            console.log('✅ Subscription plans created\n');

            // 2.5 User Subscriptions (for organizers)
            console.log('📅 Creating user subscriptions...');
            const userSubscriptions = [
                // Organizer 1: FREE plan (monthly)
                { id: 1, userId: 1, planId: 1, status: 'active', billingCycle: 'monthly' },
                // Organizer 2: PRO plan (annual) - para probar MRR
                { id: 2, userId: 2, planId: 3, status: 'active', billingCycle: 'annual' },
                // Organizer 3: STARTER plan (monthly)
                { id: 3, userId: 3, planId: 2, status: 'active', billingCycle: 'monthly' },
                // Usuarios regulares con FREE plan
                { id: 4, userId: 4, planId: 1, status: 'active', billingCycle: 'monthly' },
                { id: 5, userId: 5, planId: 1, status: 'active', billingCycle: 'monthly' },
                { id: 6, userId: 6, planId: 1, status: 'active', billingCycle: 'monthly' },
                { id: 7, userId: 7, planId: 1, status: 'active', billingCycle: 'monthly' },
                { id: 8, userId: 8, planId: 1, status: 'active', billingCycle: 'monthly' },
                { id: 9, userId: 9, planId: 1, status: 'active', billingCycle: 'monthly' },
                { id: 10, userId: 10, planId: 1, status: 'active', billingCycle: 'monthly' },
                // Admin con PRO
                { id: 11, userId: 11, planId: 3, status: 'active', billingCycle: 'monthly' }
            ];

            for (const sub of userSubscriptions) {
                await queryRunner.manager.query(
                    `INSERT INTO user_subscription (id, "userId", "planId", status, "billingCycle", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, NOW(), NULL, NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [sub.id, sub.userId, sub.planId, sub.status, sub.billingCycle]
                );
            }
            console.log('✅ User subscriptions created\n');

            // 3. Users (Organizers and Regular Users)
            console.log('👤 Creating users...');
            const hashedPassword = await bcrypt.hash('123456', 10);
            
            const users = [
                // Organizers
                { id: 1, firstname: 'Carlos', lastname: 'López', email: 'carlos.organizador@gmail.com', phone: '3514567890', roles: ['organizer'] },
                { id: 2, firstname: 'María', lastname: 'González', email: 'maria.eventos@gmail.com', phone: '3515678901', roles: ['organizer'] },
                { id: 3, firstname: 'Diego', lastname: 'Fernández', email: 'diego.producciones@gmail.com', phone: '3516789012', roles: ['organizer'] },
                // Regular Users
                { id: 4, firstname: 'Juan', lastname: 'Pérez', email: 'juan.usuario@gmail.com', phone: '3517890123', roles: ['user'] },
                { id: 5, firstname: 'Ana', lastname: 'Rodríguez', email: 'ana.compras@gmail.com', phone: '3518901234', roles: ['user'] },
                { id: 6, firstname: 'Laura', lastname: 'Martínez', email: 'laura.eventos@gmail.com', phone: '3519012345', roles: ['user'] },
                { id: 7, firstname: 'Pedro', lastname: 'Sánchez', email: 'pedro.fan@gmail.com', phone: '3510123456', roles: ['user'] },
                { id: 8, firstname: 'Lucía', lastname: 'Ramírez', email: 'lucia.tickets@gmail.com', phone: '3511234567', roles: ['user'] },
                { id: 9, firstname: 'Martín', lastname: 'Torres', email: 'martin.comprador@gmail.com', phone: '3512345678', roles: ['user'] },
                { id: 10, firstname: 'Sofía', lastname: 'López', email: 'sofia.music@gmail.com', phone: '3513456789', roles: ['user'] },
                // Admin
                { id: 11, firstname: 'Admin', lastname: 'Sistema', email: 'admin@eventlife.com', phone: '3513456789', roles: ['admin'] }
            ];
            
            for (const user of users) {
                await queryRunner.manager.query(
                    `INSERT INTO "user" (id, firstname, lastname, email, phone, "imgPerfil", pais, provincia, ciudad, address, birth, password, roles, active, "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [user.id, user.firstname, user.lastname, user.email, user.phone,
                     'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png',
                     'Argentina', 'Córdoba', 'Córdoba Capital', 'Dirección ejemplo', '1990-01-01',
                     hashedPassword, user.roles.join(',')]
                );
            }
            console.log('✅ Users created\n');

            // 4. Events
            console.log('🎉 Creating events...');
            const events = [
                { id: 1, title: 'Festival de Rock 2026', description: 'El festival de rock más grande de la región.', date: '2026-03-15', time: '20:00', minAge: 18, image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800', ciudad: 'Córdoba', direccion: 'Estadio Kempes', organizer: 'Rock Productions', destacado: true, categoryId: 1, userId: 1 },
                { id: 2, title: 'Conferencia Tech 2026', description: 'La conferencia de tecnología más importante.', date: '2026-04-20', time: '09:00', minAge: 0, image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800', ciudad: 'Buenos Aires', direccion: 'Centro de Convenciones', organizer: 'Tech Argentina', destacado: true, categoryId: 3, userId: 2 },
                { id: 3, title: 'Maratón Buenos Aires 2026', description: 'La maratón más importante de Argentina.', date: '2026-05-10', time: '07:00', minAge: 16, image: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800', ciudad: 'Buenos Aires', direccion: 'Plaza de Mayo', organizer: 'Running BA', destacado: false, categoryId: 2, userId: 2 },
                { id: 4, title: 'Feria Gastronómica Córdoba', description: 'Los mejores food trucks y chefs locales.', date: '2026-06-05', time: '12:00', minAge: 0, image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800', ciudad: 'Córdoba', direccion: 'Parque Sarmiento', organizer: 'Foodie CBA', destacado: false, categoryId: 5, userId: 1 },
                { id: 5, title: 'Concierto de Jazz al Aire Libre', description: 'Una noche de jazz bajo las estrellas.', date: '2026-07-20', time: '19:30', minAge: 0, image: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800', ciudad: 'Rosario', direccion: 'Parque Independencia', organizer: 'Jazz Rosario', destacado: false, categoryId: 1, userId: 3 },
                { id: 6, title: 'Exposición de Arte Contemporáneo', description: 'Obras de artistas emergentes.', date: '2026-08-15', time: '18:00', minAge: 0, image: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=800', ciudad: 'Córdoba', direccion: 'Centro Cultural Córdoba', organizer: 'Arte CBA', destacado: true, categoryId: 4, userId: 1 }
            ];
            
            for (const evt of events) {
                await queryRunner.manager.query(
                    `INSERT INTO event (id, title, description, date, time, "minAge", image, pais, provincia, ciudad, direccion, organizer, destacado, active, "isPublic", "categoryId", "user_id", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, true, $14, $15, NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [evt.id, evt.title, evt.description, evt.date, evt.time, evt.minAge, evt.image,
                     'Argentina', 'Córdoba', evt.ciudad, evt.direccion, evt.organizer, evt.destacado, evt.categoryId, evt.userId]
                );
            }
            console.log('✅ Events created\n');

            // 5. Ticket Types
            console.log('🎫 Creating ticket types...');
            const ticketTypes = [
                { id: 1, eventId: 1, name: 'Entrada General', description: 'Acceso general al festival', price: 15000, capacity: 1000, soldCount: 0 },
                { id: 2, eventId: 1, name: 'VIP', description: 'Acceso VIP con zona preferencial', price: 30000, capacity: 200, soldCount: 0 },
                { id: 3, eventId: 1, name: 'Backstage', description: 'Meet & Greet con las bandas', price: 50000, capacity: 50, soldCount: 0 },
                { id: 4, eventId: 2, name: 'Pase General', description: 'Acceso a todas las charlas', price: 8000, capacity: 500, soldCount: 0 },
                { id: 5, eventId: 2, name: 'Pase PRO', description: 'Acceso a workshops y networking', price: 15000, capacity: 100, soldCount: 0 },
                { id: 6, eventId: 2, name: 'Estudiante', description: 'Descuento especial', price: 4000, capacity: 200, soldCount: 0 },
                { id: 7, eventId: 3, name: '42K Competitiva', description: 'Carrera competitiva oficial', price: 12000, capacity: 3000, soldCount: 0 },
                { id: 8, eventId: 3, name: '21K Recreativa', description: 'Media maratón sin chip', price: 8000, capacity: 2000, soldCount: 0 },
                { id: 9, eventId: 3, name: 'Caminata 5K', description: 'Para toda la familia', price: 5000, capacity: 5000, soldCount: 0 },
                { id: 10, eventId: 4, name: 'Pase Diario', description: 'Acceso un día', price: 2000, capacity: 5000, soldCount: 0 },
                { id: 11, eventId: 4, name: 'Pase Fin de Semana', description: 'Viernes, sábado y domingo', price: 5000, capacity: 2000, soldCount: 0 },
                { id: 12, eventId: 4, name: 'VIP Gastronómico', description: 'Degustaciones exclusivas', price: 15000, capacity: 100, soldCount: 0 },
                { id: 13, eventId: 5, name: 'Gratis', description: 'Entrada libre', price: 0, capacity: 2000, soldCount: 0 },
                { id: 14, eventId: 6, name: 'General', description: 'Acceso a todas las salas', price: 3000, capacity: 500, soldCount: 0 },
                { id: 15, eventId: 6, name: 'Con Inauguración', description: 'Acceso + evento de inauguración', price: 8000, capacity: 100, soldCount: 0 }
            ];
            
            for (const tt of ticketTypes) {
                await queryRunner.manager.query(
                    `INSERT INTO ticket_type (id, "eventId", name, description, price, capacity, "soldCount", status, "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [tt.id, tt.eventId, tt.name, tt.description, tt.price, tt.capacity, tt.soldCount]
                );
            }
            console.log('✅ Ticket types created\n');

            // 6. Promoter Groups
            console.log('👥 Creating promoter groups...');
            const promoterGroups = [
                { id: 1, organizerId: 1, promoterId: 4, commissionPercentage: 10, promoterCode: 'PROMO-JUAN01', notes: 'Promotor estrella' },
                { id: 2, organizerId: 1, promoterId: 5, commissionPercentage: 12, promoterCode: 'PROMO-ANA02', notes: 'Especialista en universitarios' },
                { id: 3, organizerId: 2, promoterId: 6, commissionPercentage: 8, promoterCode: 'PROMO-LAU03', notes: 'Ventas corporativas' },
                { id: 4, organizerId: 2, promoterId: 7, commissionPercentage: 15, promoterCode: 'PROMO-PED04', notes: 'Influencer tech' },
                { id: 5, organizerId: 3, promoterId: 8, commissionPercentage: 10, promoterCode: 'PROMO-LUCI05', notes: 'Ventas generales' },
                { id: 6, organizerId: 1, promoterId: 9, commissionPercentage: 10, promoterCode: 'PROMO-MART06', notes: 'Multi-organizador CBA' },
                { id: 7, organizerId: 2, promoterId: 9, commissionPercentage: 12, promoterCode: 'PROMO-MART07', notes: 'Multi-organizador BA' }
            ];
            
            for (const pg of promoterGroups) {
                await queryRunner.manager.query(
                    `INSERT INTO promoter_group (id, "organizerId", "promoterId", "commissionPercentage", "promoterCode", "isActive", notes, "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [pg.id, pg.organizerId, pg.promoterId, pg.commissionPercentage, pg.promoterCode, pg.notes]
                );
            }
            console.log('✅ Promoter groups created\n');

            // 7. Promoter Event Assignments
            console.log('🎯 Creating promoter event assignments...');
            const assignments = [
                { id: 1, promoterGroupId: 1, eventId: 1, customCommission: null },
                { id: 2, promoterGroupId: 1, eventId: 4, customCommission: 8 },
                { id: 3, promoterGroupId: 1, eventId: 6, customCommission: null },
                { id: 4, promoterGroupId: 2, eventId: 1, customCommission: 15 },
                { id: 5, promoterGroupId: 2, eventId: 4, customCommission: null },
                { id: 6, promoterGroupId: 3, eventId: 2, customCommission: null },
                { id: 7, promoterGroupId: 3, eventId: 3, customCommission: 10 },
                { id: 8, promoterGroupId: 4, eventId: 2, customCommission: 18 },
                { id: 9, promoterGroupId: 4, eventId: 3, customCommission: null },
                { id: 10, promoterGroupId: 5, eventId: 5, customCommission: null },
                { id: 11, promoterGroupId: 5, eventId: 6, customCommission: 12 },
                { id: 12, promoterGroupId: 6, eventId: 1, customCommission: null },
                { id: 13, promoterGroupId: 6, eventId: 4, customCommission: 9 },
                { id: 14, promoterGroupId: 7, eventId: 2, customCommission: null },
                { id: 15, promoterGroupId: 7, eventId: 3, customCommission: 11 }
            ];
            
            for (const assign of assignments) {
                await queryRunner.manager.query(
                    `INSERT INTO promoter_event_assignment (id, "promoterGroupId", "eventId", "customCommissionPercentage", "isActive", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, true, NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [assign.id, assign.promoterGroupId, assign.eventId, assign.customCommission]
                );
            }
            console.log('✅ Promoter event assignments created\n');

            await queryRunner.commitTransaction();
            console.log('🎉 Seed completed successfully!');
            
            // Summary
            console.log('\n📊 Summary:');
            const results = await queryRunner.manager.query(`
                SELECT 'Categories' as table_name, COUNT(*) as count FROM category
                UNION ALL SELECT 'Users', COUNT(*) FROM "user"
                UNION ALL SELECT 'Events', COUNT(*) FROM event
                UNION ALL SELECT 'Ticket Types', COUNT(*) FROM ticket_type
                UNION ALL SELECT 'Subscription Plans', COUNT(*) FROM subscription_plan
                UNION ALL SELECT 'User Subscriptions', COUNT(*) FROM user_subscription
                UNION ALL SELECT 'Promoter Groups', COUNT(*) FROM promoter_group
                UNION ALL SELECT 'Promoter Assignments', COUNT(*) FROM promoter_event_assignment
            `);
            
            for (const row of results) {
                console.log(`  ${row.table_name}: ${row.count}`);
            }
            
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
        
    } catch (error) {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
        process.exit(0);
    }
}

seed();
