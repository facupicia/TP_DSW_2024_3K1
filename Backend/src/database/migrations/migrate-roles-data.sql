-- Data-only migration: Copy rol values to roles column
-- Run this if the schema already has both columns

-- Step 1: Check current state
SELECT 
    'BEFORE MIGRATION' as status,
    COUNT(*) as total_users,
    COUNT(CASE WHEN roles IS NOT NULL AND roles != '' THEN 1 END) as with_roles,
    COUNT(CASE WHEN rol IS NOT NULL AND rol != '' THEN 1 END) as with_legacy_rol
FROM "user";

-- Step 2: Migrate users that have 'rol' but no 'roles'
UPDATE "user" 
SET roles = rol 
WHERE (roles IS NULL OR roles = '') 
  AND rol IS NOT NULL;

-- Step 3: Set default 'user' for any remaining empty roles
UPDATE "user" 
SET roles = 'user' 
WHERE roles IS NULL OR roles = '';

-- Step 4: Verify after migration
SELECT 
    'AFTER MIGRATION' as status,
    COUNT(*) as total_users,
    COUNT(CASE WHEN roles IS NOT NULL AND roles != '' THEN 1 END) as with_roles
FROM "user";

-- Step 5: Show some examples
SELECT 
    id, 
    firstname, 
    lastname, 
    roles
FROM "user" 
ORDER BY id
LIMIT 10;
