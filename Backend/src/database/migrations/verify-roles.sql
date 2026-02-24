-- Verificación del estado de la migración de roles

-- 1. Verificar columnas existentes
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'user' 
AND column_name IN ('rol', 'roles')
ORDER BY ordinal_position;

-- 2. Verificar datos migrados
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN roles IS NOT NULL AND roles != '' THEN 1 END) as with_roles,
    COUNT(CASE WHEN rol IS NOT NULL AND rol != '' THEN 1 END) as with_legacy_rol
FROM "user";

-- 3. Ver algunos ejemplos de usuarios
SELECT 
    id, 
    firstname, 
    lastname, 
    COALESCE(roles, 'NULL') as roles,
    COALESCE(rol, 'NULL') as legacy_rol
FROM "user" 
LIMIT 10;

-- 4. Si hay usuarios sin roles pero con rol legacy, migrar:
-- UPDATE "user" 
-- SET roles = rol 
-- WHERE (roles IS NULL OR roles = '') AND rol IS NOT NULL;

-- 5. Verificar distribución de roles
SELECT 
    COALESCE(roles, rol, 'user') as role_value,
    COUNT(*) as user_count
FROM "user"
GROUP BY COALESCE(roles, rol, 'user')
ORDER BY user_count DESC;
