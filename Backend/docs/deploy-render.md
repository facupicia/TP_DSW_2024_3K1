# Deploy en Render.com (Backend)

## Requisitos
- Node 18+
- Base de datos PostgreSQL accesible públicamente (Neon u otro proveedor con SSL)
- Variables de entorno configuradas

## Variables de Entorno
- `PORT` (Render provee, default 3000)
- `NODE_ENV=production`
- `CLIENT_URL` (URL del frontend en Netlify)
- `MP_ACCESS_TOKEN` (token de Mercado Pago)
- `MP_NOTIFICATION_URL` (webhook público: `https://<tu-render>/api/payment/webhook`)
- PostgreSQL (elige `POSTGRES_URL`/`DATABASE_URL` o variables granulares):
  - `POSTGRES_URL` o `DATABASE_URL` (cadena con SSL)
  - Alternativa granular: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

## Pasos
1. Subir el repo a Git y crear servicio Web en Render.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Health check: `/health`
5. Configurar variables de entorno anteriores (PostgreSQL con SSL).

## Notas
- `synchronize` en TypeORM está desactivado en producción.
- CORS usa `CLIENT_URL`.
- Webhook de MP crea tickets automáticamente si el pago es `approved`.

