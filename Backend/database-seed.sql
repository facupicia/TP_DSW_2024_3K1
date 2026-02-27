-- =====================================================
-- EVENTLIFE DATABASE SEED SCRIPT
-- Populate database with example data
-- Note: Tickets are left empty for testing
-- =====================================================

-- =====================================================
-- 1. CATEGORIES
-- =====================================================
INSERT INTO category (id, name) VALUES 
(1, 'Música'),
(2, 'Deportes'),
(3, 'Tecnología'),
(4, 'Arte y Cultura'),
(5, 'Gastronomía'),
(6, 'Negocios'),
(7, 'Entretenimiento'),
(8, 'Educación')
ON CONFLICT (id) DO NOTHING;

SELECT setval('category_id_seq', (SELECT MAX(id) FROM category));

-- =====================================================
-- 2. USERS (Organizers and Regular Users)
-- Password: '123456' hashed with bcrypt (10 rounds)
-- $2a$10$YourHashedPasswordHere... (placeholder)
-- =====================================================

-- Organizers
INSERT INTO "user" (id, firstname, lastname, email, phone, "imgPerfil", pais, provincia, ciudad, address, birth, password, roles, "mpUserId", "mpAccessToken", "mpRefreshToken", "mpTokenExpiresAt") VALUES
(1, 'Carlos', 'López', 'carlos.organizador@gmail.com', '3514567890', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Córdoba', 'Córdoba Capital', 'Av. Colón 1234', '1985-03-15', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'organizer', NULL, NULL, NULL, NULL),
(2, 'María', 'González', 'maria.eventos@gmail.com', '3515678901', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Buenos Aires', 'La Plata', 'Calle 7 N° 890', '1990-07-22', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'organizer', NULL, NULL, NULL, NULL),
(3, 'Diego', 'Fernández', 'diego.producciones@gmail.com', '3516789012', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Santa Fe', 'Rosario', 'Bv. Oroño 789', '1988-11-30', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'organizer', NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Regular Users
INSERT INTO "user" (id, firstname, lastname, email, phone, "imgPerfil", pais, provincia, ciudad, address, birth, password, roles) VALUES
(4, 'Juan', 'Pérez', 'juan.usuario@gmail.com', '3517890123', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Córdoba', 'Villa María', 'Calle San Martín 456', '1995-06-20', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'user'),
(5, 'Ana', 'Rodríguez', 'ana.compras@gmail.com', '3518901234', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Mendoza', 'Mendoza', 'Calle Las Heras 321', '1998-02-14', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'user'),
(6, 'Laura', 'Martínez', 'laura.eventos@gmail.com', '3519012345', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Córdoba', 'Río Cuarto', 'Av. Italia 654', '1992-09-08', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'user'),
(7, 'Pedro', 'Sánchez', 'pedro.fan@gmail.com', '3510123456', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Buenos Aires', 'Mar del Plata', 'Av. Luro 1234', '1997-12-01', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'user'),
(8, 'Lucía', 'Ramírez', 'lucia.tickets@gmail.com', '3511234567', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Tucumán', 'San Miguel de Tucumán', 'Av. Alem 567', '1993-04-18', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'user'),
(9, 'Martín', 'Torres', 'martin.comprador@gmail.com', '3512345678', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Córdoba', 'Carlos Paz', 'Av. San Martín 123', '1996-08-25', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'user'),
(10, 'Sofía', 'López', 'sofia.music@gmail.com', '3513456789', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Entre Ríos', 'Paraná', 'Calle Buenos Aires 789', '1994-01-10', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'user')
ON CONFLICT (id) DO NOTHING;

-- Admin User
INSERT INTO "user" (id, firstname, lastname, email, phone, "imgPerfil", pais, provincia, ciudad, address, birth, password, roles) VALUES
(11, 'Admin', 'Sistema', 'admin@eventlife.com', '3513456789', 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png', 'Argentina', 'Córdoba', 'Córdoba Capital', 'Av. San Martín 500', '1990-01-15', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjXNl0QJ4V5WqQjvJ4kX1R9a5Y1a3a2', 'admin')
ON CONFLICT (id) DO NOTHING;

SELECT setval('user_id_seq', (SELECT MAX(id) FROM "user"));

-- =====================================================
-- 3. EVENTS (Past, Present and Future)
-- =====================================================

-- Future Events
INSERT INTO event (id, title, description, date, time, "minAge", image, pais, provincia, ciudad, direccion, organizer, destacado, active, "isPublic", "categoryId", "user_id", "createdAt", "updatedAt") VALUES
(1, 'Festival de Rock 2026', 'El festival de rock más grande de la región. Bandas locales e internacionales en un evento imperdible.', '2026-03-15', '20:00', 18, 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800', 'Argentina', 'Córdoba', 'Córdoba', 'Estadio Kempes', 'Rock Productions', true, true, true, 1, 1, NOW(), NOW()),
(2, 'Conferencia Tech 2026', 'La conferencia de tecnología más importante del país. Workshops, charlas y networking.', '2026-04-20', '09:00', 0, 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800', 'Argentina', 'Buenos Aires', 'Buenos Aires', 'Centro de Convenciones', 'Tech Argentina', true, true, true, 3, 2, NOW(), NOW()),
(3, 'Maratón Buenos Aires 2026', 'La maratón más importante de Argentina. 42K por las calles de la ciudad.', '2026-05-10', '07:00', 16, 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800', 'Argentina', 'Buenos Aires', 'Buenos Aires', 'Plaza de Mayo', 'Running BA', false, true, true, 2, 2, NOW(), NOW()),
(4, 'Feria Gastronómica Córdoba', 'Los mejores food trucks y chefs locales en un fin de semana de sabores.', '2026-06-05', '12:00', 0, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800', 'Argentina', 'Córdoba', 'Córdoba', 'Parque Sarmiento', 'Foodie CBA', false, true, true, 5, 1, NOW(), NOW()),
(5, 'Concierto de Jazz al Aire Libre', 'Una noche de jazz bajo las estrellas. Trae tu manta y disfruta.', '2026-07-20', '19:30', 0, 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800', 'Argentina', 'Santa Fe', 'Rosario', 'Parque Independencia', 'Jazz Rosario', false, true, true, 1, 3, NOW(), NOW()),
(6, 'Exposición de Arte Contemporáneo', 'Obras de artistas emergentes de todo el país. Inauguración con catering.', '2026-08-15', '18:00', 0, 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=800', 'Argentina', 'Córdoba', 'Córdoba', 'Centro Cultural Córdoba', 'Arte CBA', true, true, true, 4, 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Past Events (for stats)
INSERT INTO event (id, title, description, date, time, "minAge", image, pais, provincia, ciudad, direccion, organizer, destacado, active, "isPublic", "categoryId", "user_id", "createdAt", "updatedAt") VALUES
(7, 'Festival de Verano 2025', 'La edición del verano pasado con más de 10.000 asistentes.', '2025-01-15', '18:00', 18, 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800', 'Argentina', 'Córdoba', 'Villa Carlos Paz', 'Anfiteatro', 'Summer Fest', true, true, true, 7, 1, NOW() - INTERVAL '3 months', NOW()),
(8, 'Congreso de Innovación 2025', 'El evento tech más grande del año pasado.', '2025-02-20', '09:00', 0, 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800', 'Argentina', 'Buenos Aires', 'Buenos Aires', 'Hotel Hilton', 'Tech Conf', true, true, true, 3, 2, NOW() - INTERVAL '4 months', NOW()),
(9, 'Carrera Nocturna 2025', '10K bajo la luna llena por las calles de la ciudad.', '2025-03-10', '20:00', 16, 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800', 'Argentina', 'Córdoba', 'Córdoba', 'Plaza San Martín', 'Run CBA', false, true, true, 2, 1, NOW() - INTERVAL '2 months', NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('event_id_seq', (SELECT MAX(id) FROM event));

-- =====================================================
-- 4. TICKET TYPES (For each event)
-- =====================================================
INSERT INTO ticket_type (id, "eventId", name, description, price, capacity, "soldCount", status, "createdAt", "updatedAt") VALUES
-- Event 1: Festival Rock
(1, 1, 'Entrada General', 'Acceso general al festival', 15000.00, 1000, 0, 'active', NOW(), NOW()),
(2, 1, 'VIP', 'Acceso VIP con zona preferencial y bar privado', 30000.00, 200, 0, 'active', NOW(), NOW()),
(3, 1, 'Backstage', 'Meet & Greet con las bandas', 50000.00, 50, 0, 'active', NOW(), NOW()),

-- Event 2: Tech Conference
(4, 2, 'Pase General', 'Acceso a todas las charlas', 8000.00, 500, 0, 'active', NOW(), NOW()),
(5, 2, 'Pase PRO', 'Acceso a workshops y networking', 15000.00, 100, 0, 'active', NOW(), NOW()),
(6, 2, 'Estudiante', 'Descuento especial con credencial', 4000.00, 200, 0, 'active', NOW(), NOW()),

-- Event 3: Maratón
(7, 3, '42K Competitiva', 'Carrera competitiva oficial', 12000.00, 3000, 0, 'active', NOW(), NOW()),
(8, 3, '21K Recreativa', 'Media maratón sin chip', 8000.00, 2000, 0, 'active', NOW(), NOW()),
(9, 3, 'Caminata 5K', 'Para toda la familia', 5000.00, 5000, 0, 'active', NOW(), NOW()),

-- Event 4: Feria Gastronómica
(10, 4, 'Pase Diario', 'Acceso un día a la feria', 2000.00, 5000, 0, 'active', NOW(), NOW()),
(11, 4, 'Pase Fin de Semana', 'Acceso viernes, sábado y domingo', 5000.00, 2000, 0, 'active', NOW(), NOW()),
(12, 4, 'VIP Gastronómico', 'Degustaciones exclusivas y chef''s table', 15000.00, 100, 0, 'active', NOW(), NOW()),

-- Event 5: Jazz
(13, 5, 'Gratis', 'Entrada libre y gratuita', 0.00, 2000, 0, 'active', NOW(), NOW()),

-- Event 6: Arte
(14, 6, 'General', 'Acceso a todas las salas', 3000.00, 500, 0, 'active', NOW(), NOW()),
(15, 6, 'Con Inauguración', 'Acceso + evento de inauguración', 8000.00, 100, 0, 'active', NOW(), NOW()),

-- Past Events (for stats)
(16, 7, 'Early Bird', 'Preventa especial', 10000.00, 500, 450, 'sold_out', NOW() - INTERVAL '4 months', NOW()),
(17, 7, 'General', 'Entrada regular', 15000.00, 2000, 1980, 'sold_out', NOW() - INTERVAL '4 months', NOW()),
(18, 8, 'Tech Pass', 'Acceso completo', 12000.00, 300, 280, 'sold_out', NOW() - INTERVAL '5 months', NOW()),
(19, 9, 'Runner', '10K oficial', 6000.00, 1500, 1200, 'sold_out', NOW() - INTERVAL '3 months', NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('ticket_type_id_seq', (SELECT MAX(id) FROM ticket_type));

-- =====================================================
-- 5. SUBSCRIPTION PLANS
-- =====================================================
INSERT INTO subscription_plan (id, name, description, "monthlyPrice", "yearlyPrice", features, limits, active, "createdAt", "updatedAt") VALUES
(1, 'FREE', 'Plan gratuito para empezar', 0, 0, 
'["1 evento activo", "50 tickets por evento", "Soporte básico"]',
'{"maxActiveEvents": 1, "maxTicketsPerEvent": 50, "maxPromoters": 0, "commissionPercentage": 15}',
true, NOW(), NOW()),

(2, 'STARTER', 'Para organizadores emergentes', 9999, 99999,
'["5 eventos activos", "200 tickets por evento", "3 promotores", "Comisión 10%", "Soporte email"]',
'{"maxActiveEvents": 5, "maxTicketsPerEvent": 200, "maxPromoters": 3, "commissionPercentage": 10}',
true, NOW(), NOW()),

(3, 'PRO', 'Para profesionales del evento', 29999, 299999,
'["Eventos ilimitados", "Tickets ilimitados", "Promotores ilimitados", "Comisión 5%", "Soporte prioritario", "Estadísticas avanzadas", "API access"]',
'{"maxActiveEvents": -1, "maxTicketsPerEvent": -1, "maxPromoters": -1, "commissionPercentage": 5}',
true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('subscription_plan_id_seq', (SELECT MAX(id) FROM subscription_plan));

-- =====================================================
-- 6. PROMOTER GROUPS (RRPP assignments)
-- =====================================================
INSERT INTO promoter_group (id, "organizerId", "promoterId", "commissionPercentage", "promoterCode", "isActive", notes, "createdAt", "updatedAt") VALUES
-- Users 4 and 5 are promoters for Organizer 1
(1, 1, 4, 10.00, 'PROMO-JUAN01', true, 'Promotor estrella', NOW(), NOW()),
(2, 1, 5, 12.00, 'PROMO-ANA02', true, 'Especialista en universitarios', NOW(), NOW()),

-- Users 6 and 7 are promoters for Organizer 2
(3, 2, 6, 8.00, 'PROMO-LAU03', true, 'Ventas corporativas', NOW(), NOW()),
(4, 2, 7, 15.00, 'PROMO-PED04', true, 'Influencer tech', NOW(), NOW()),

-- User 8 is promoter for Organizer 3
(5, 3, 8, 10.00, 'PROMO-LUCI05', true, 'Ventas generales', NOW()),

-- User 9 is promoter for both Organizer 1 and 2 (multiple assignments)
(6, 1, 9, 10.00, 'PROMO-MART06', true, 'Multi-organizador CBA', NOW(), NOW()),
(7, 2, 9, 12.00, 'PROMO-MART07', true, 'Multi-organizador BA', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('promoter_group_id_seq', (SELECT MAX(id) FROM promoter_group));

-- =====================================================
-- 7. PROMOTER EVENT ASSIGNMENTS
-- Promoters assigned to specific events
-- =====================================================
INSERT INTO promoter_event_assignment (id, "promoterGroupId", "eventId", "customCommissionPercentage", "isActive", "createdAt", "updatedAt") VALUES
-- Promoter 1 (Juan) -> Events 1, 4, 6
(1, 1, 1, NULL, true, NOW(), NOW()),
(2, 1, 4, 8.00, true, NOW(), NOW()),
(3, 1, 6, NULL, true, NOW(), NOW()),

-- Promoter 2 (Ana) -> Events 1, 4
(4, 2, 1, 15.00, true, NOW(), NOW()),
(5, 2, 4, NULL, true, NOW(), NOW()),

-- Promoter 3 (Laura) -> Events 2, 3
(6, 3, 2, NULL, true, NOW(), NOW()),
(7, 3, 3, 10.00, true, NOW(), NOW()),

-- Promoter 4 (Pedro) -> Events 2, 3
(8, 4, 2, 18.00, true, NOW(), NOW()),
(9, 4, 3, NULL, true, NOW(), NOW()),

-- Promoter 5 (Lucía) -> Events 5, 6
(10, 5, 5, NULL, true, NOW(), NOW()),
(11, 5, 6, 12.00, true, NOW(), NOW()),

-- Promoter 6 (Martín) -> Multiple events across organizers
(12, 6, 1, NULL, true, NOW(), NOW()),
(13, 6, 4, 9.00, true, NOW(), NOW()),
(14, 7, 2, NULL, true, NOW(), NOW()),
(15, 7, 3, 11.00, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('promoter_event_assignment_id_seq', (SELECT MAX(id) FROM promoter_event_assignment));

-- =====================================================
-- 8. PAYMENT LOGS (Example completed payments)
-- These represent successful sales made by promoters
-- =====================================================
INSERT INTO payment_log (id, "mpPaymentId", "externalReference", "userId", "ticketTypeId", "unitPrice", quantity, "totalAmount", "commissionPercent", "commissionAmount", "organizerPlanName", "organizerId", status, "createdAt") VALUES
-- Past event sales by promoters
(1, 'PAYMENT_001', 'EXT_REF_001', 4, 16, 10000.00, 2, 20000.00, 10.00, 2000.00, 'PRO', 1, 'completed', NOW() - INTERVAL '3 months'),
(2, 'PAYMENT_002', 'EXT_REF_002', 5, 16, 10000.00, 1, 10000.00, 10.00, 1000.00, 'PRO', 1, 'completed', NOW() - INTERVAL '3 months'),
(3, 'PAYMENT_003', 'EXT_REF_003', 4, 17, 15000.00, 3, 45000.00, 10.00, 4500.00, 'PRO', 1, 'completed', NOW() - INTERVAL '3 months'),
(5, 'PAYMENT_005', 'EXT_REF_005', 6, 18, 12000.00, 2, 24000.00, 5.00, 1200.00, 'PRO', 2, 'completed', NOW() - INTERVAL '4 months'),
(6, 'PAYMENT_006', 'EXT_REF_006', 7, 18, 12000.00, 1, 12000.00, 15.00, 1800.00, 'PRO', 2, 'completed', NOW() - INTERVAL '4 months'),
(7, 'PAYMENT_007', 'EXT_REF_007', 6, 19, 6000.00, 5, 30000.00, 10.00, 3000.00, 'PRO', 1, 'completed', NOW() - INTERVAL '2 months'),
(8, 'PAYMENT_008', 'EXT_REF_008', 8, 19, 6000.00, 2, 12000.00, 8.00, 960.00, 'PRO', 2, 'completed', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

SELECT setval('payment_log_id_seq', (SELECT MAX(id) FROM payment_log));

-- =====================================================
-- TICKETS TABLE - LEFT EMPTY AS REQUESTED
-- =====================================================
-- Note: Tickets will be created automatically when users 
-- complete the purchase flow through the application

-- =====================================================
-- VERIFY DATA
-- =====================================================
SELECT 'CATEGORIES' as table_name, COUNT(*) as count FROM category
UNION ALL SELECT 'USERS', COUNT(*) FROM "user"
UNION ALL SELECT 'EVENTS', COUNT(*) FROM event
UNION ALL SELECT 'TICKET_TYPES', COUNT(*) FROM ticket_type
UNION ALL SELECT 'SUBSCRIPTION_PLANS', COUNT(*) FROM subscription_plan
UNION ALL SELECT 'PROMOTER_GROUPS', COUNT(*) FROM promoter_group
UNION ALL SELECT 'PROMOTER_EVENT_ASSIGNMENTS', COUNT(*) FROM promoter_event_assignment
UNION ALL SELECT 'PAYMENT_LOGS', COUNT(*) FROM payment_log;
