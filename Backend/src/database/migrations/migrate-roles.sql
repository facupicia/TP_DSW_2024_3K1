-- Migration: Convert single 'rol' column to 'roles' array (simple-array format)
-- Run this SQL in your PostgreSQL database

-- Step 1: Add the new 'roles' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user' AND column_name = 'roles') THEN
        ALTER TABLE "user" ADD COLUMN roles text;
    END IF;
END $$;

-- Step 2: Migrate data from 'rol' to 'roles'
-- Convert single role value to comma-separated format for simple-array
UPDATE "user" 
SET roles = rol 
WHERE rol IS NOT NULL AND (roles IS NULL OR roles = '');

-- Step 3: Set default for users without roles
UPDATE "user" 
SET roles = 'user' 
WHERE roles IS NULL OR roles = '';

-- Step 4: Verify migration
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN roles IS NOT NULL THEN 1 END) as users_with_roles,
    COUNT(CASE WHEN rol IS NOT NULL THEN 1 END) as users_with_legacy_rol
FROM "user";

-- NOTE: After verifying the migration works correctly, you can drop the old column:
-- ALTER TABLE "user" DROP COLUMN rol;
-- But keep it for now as a backup
