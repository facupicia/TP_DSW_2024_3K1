# Checkout y Pasarela de Pago

## Resumen de Cambios
- Middleware de autenticación actualizado para devolver 401 y códigos de error claros.
- Middleware global de errores con logging estructurado.
- `createPreference` robustecido: validaciones adicionales, verificación de configuración y reintentos con backoff.
- Frontend envía `Authorization: Bearer` y maneja timeouts y mensajes de error.
- Rutas de `checkout/success`, `checkout/failure`, `checkout/pending` agregadas.

## Endpoints
- `POST /api/payment/create-preference`
  - Request body: `{ ticketQuantity: number, eventId: number }`
  - Auth: Requiere `Authorization: Bearer <token>`
  - Response (200): `{ id: string, init_point: string }`

## Códigos de Error (Backend)
- `401 AUTH_NO_TOKEN`: No se envió token.
- `401 AUTH_INVALID_TOKEN`: El token es inválido.
- `401 AUTH_VALIDATION_ERROR`: Token inválido o expirado.
- `400 INVALID_PRICE`: Precio del evento inválido.
- `400`: `Cantidad inválida.` (cantidad <= 0 o no numérica).
- `404`: `Usuario o Evento no encontrado.`
- `409`: `Sin stock. Quedan: N`
- `500 CONFIG_MISSING_MP_TOKEN`: Falta `MP_ACCESS_TOKEN` en configuración.
- `502 PAYMENT_GATEWAY_UNAVAILABLE`: Error temporal al crear la preferencia en la pasarela.
- `500 PREFERENCE_CREATE_ERROR`: Error inesperado al crear la preferencia.

## Requisitos de Configuración
- `.env`:
  - `PORT=3000`
  - `CLIENT_URL=http://localhost:4200`
  - `MP_ACCESS_TOKEN=***` (en sandbox usa token que comienza con `TEST-`; producción comienza con `APP_USR-`)
  - `MP_TEST_PAYER_EMAIL=test_user_xxxxxx@testuser.com` (solo sandbox)
  - Credenciales de DB (ver `src/db.ts`)

## Logging
- Morgan (`dev`) para solicitudes HTTP.
- Logging estructurado para errores globales y de autenticación.
- `process.on('unhandledRejection' | 'uncaughtException')` para capturar errores no controlados.

## Buenas Prácticas
- Validar entrada: cantidad > 0, `eventId` presente y numérico.
- Verificar precio del evento `> 0` y numérico.
- Reintentos con backoff para la creación de preferencia (3 intentos).
- Usar HTTPS en producción y dominios configurados en `back_urls`.
- En sandbox (localhost/http), usar un comprador de prueba distinto del vendedor: configure `MP_TEST_PAYER_EMAIL` y use tarjetas de prueba de MP.
 - No mezcles entornos: si `CLIENT_URL` es `http://localhost` y tu `MP_ACCESS_TOKEN` empieza con `APP_USR-`, el backend responderá `INVALID_ENV_CONFIG`. Cambia a `TEST-...`.

## Mantenimiento
- Revisar periódicamente las credenciales de Mercado Pago.
- Monitorear los logs y ajustar niveles si se requiere más detalle.
- Añadir más pruebas de integración cuando se disponga de un entorno de test con DB.

