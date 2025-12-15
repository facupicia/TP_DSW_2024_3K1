# Migración a PostgreSQL con Neon

## Configuración Inicial
- Crea proyecto en Neon y una base de datos con rama `main`.
- Obtén la cadena `POSTGRES_URL` (SSL) y usuarios con permisos mínimos.
- Configura SSL y acceso de IPs si aplica.

## Variables de entorno
- `POSTGRES_URL` o `DATABASE_URL`
- Alternativa granular:
  - `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- Backend detecta Postgres automáticamente si estas variables están presentes.

## Proceso de Migración
1. Congela cambios en ventana de baja actividad.
2. Exporta esquema y datos de MySQL:
   - Usa `mysqldump` o herramienta equivalente.
3. Importa a Neon:
   - Usa `pgloader` para convertir y cargar.
   - Alternativa: scripts ETL con Node (mysql2 → pg).
4. Validación:
   - Cuenta de filas por tabla.
   - Integridad referencial.
   - Pruebas funcionales.

## Post-migración
- Monitorización:
  - Panel de Neon, alertas de uso y latencia.
- Backups:
  - Utiliza branching de Neon para snapshots.
- Optimización:
  - Índices para consultas frecuentes.
  - Ajustes de `LIMIT/OFFSET`, joins y filtros.

## Downtime mínimo
- Estrategia:
  - Crear rama `import` en Neon, importar datos allí.
  - Probar contra `import`.
  - Switch del backend a `main` una vez validado (merge/switch de rama en Neon).

## Rollback
- Mantén MySQL activo durante la transición.
- Si falla, apunta el backend de nuevo a MySQL.
- Usa la rama anterior de Neon para revertir.

## Pruebas de rendimiento
- Compara tiempos de endpoints clave.
- Ajusta índices y `EXPLAIN ANALYZE`.

## Notas
- Asegura `CLIENT_URLS` correcto para CORS en producción.
- Verifica health `/health` (`db: up`).

