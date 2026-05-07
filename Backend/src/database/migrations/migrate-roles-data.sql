-- Data-only migration: copy legacy rol values to roles column.
-- Safe to run even if the legacy rol column no longer exists.

DO $$
DECLARE
  has_roles_column boolean;
  has_rol_column boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user'
      AND column_name = 'roles'
  ) INTO has_roles_column;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user'
      AND column_name = 'rol'
  ) INTO has_rol_column;

  IF NOT has_roles_column THEN
    RAISE NOTICE 'Column "roles" does not exist. Skipping role migration.';
    RETURN;
  END IF;

  IF NOT has_rol_column THEN
    RAISE NOTICE 'Legacy column "rol" does not exist. Nothing to migrate.';
    RETURN;
  END IF;

  RAISE NOTICE 'Migrating values from "rol" to "roles"...';

  UPDATE "user"
  SET roles = rol
  WHERE (roles IS NULL OR roles = '')
    AND rol IS NOT NULL
    AND rol != '';

  UPDATE "user"
  SET roles = 'user'
  WHERE roles IS NULL OR roles = '';
END $$;

DO $$
DECLARE
  total_users bigint;
  with_roles bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user'
      AND column_name = 'roles'
  ) THEN
    EXECUTE 'SELECT COUNT(*), COUNT(CASE WHEN roles IS NOT NULL AND roles != '''' THEN 1 END) FROM "user"'
    INTO total_users, with_roles;

    RAISE NOTICE 'Role migration result: %/% users have roles data.', with_roles, total_users;
  ELSE
    RAISE NOTICE 'Column "roles" does not exist. No verification query was run.';
  END IF;
END $$;
