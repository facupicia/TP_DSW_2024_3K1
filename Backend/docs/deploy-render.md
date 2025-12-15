# Deploy en Render.com (Backend)

## Requisitos
- Node 18+
- Base de datos MySQL accesible públicamente
- Variables de entorno configuradas

## Variables de Entorno
- `PORT` (Render provee, default 3000)
- `NODE_ENV=production`
- `CLIENT_URL` (URL del frontend en Netlify)
- `MP_ACCESS_TOKEN` (token de Mercado Pago)
- `MP_NOTIFICATION_URL` (webhook público: `https://<tu-render>/api/payment/webhook`)
- MySQL:
  - `MYSQL_HOST`
  - `MYSQL_PORT`
  - `MYSQL_USER`
  - `MYSQL_PASSWORD`
  - `MYSQL_DATABASE`

## Pasos
1. Subir el repo a Git y crear servicio Web en Render.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Health check: `/health`
5. Configurar variables de entorno anteriores.

## Notas
- `synchronize` en TypeORM está desactivado en producción.
- CORS usa `CLIENT_URL`.
- Webhook de MP crea tickets automáticamente si el pago es `approved`.

