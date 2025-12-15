# Plan de Refactorización Incremental

## Objetivos
- Modularidad, mantenibilidad y rendimiento.
- Patrones de diseño apropiados.
- Pruebas y documentación consistentes.

## Estructura Propuesta
- `src/`
  - `app.ts`, `index.ts`
  - `middlewares/` (auth, error, rate-limit)
  - `event/` (entity, controller, routes)
  - `ticket/` (entity, controller, routes)
  - `payment/` (controller, routes)
  - `category/` (entity, controller, routes)
  - `utils/` (cache, qr, logger)
  - `lib/` (mailer, token)
  - `docs/`
  - `tests/`

## Patrones
- Separación de capas: rutas, controladores, utilidades.
- Caché TTL para endpoints intensivos (`getEvents`, `getEventsByUser`).
- Webhook con transacciones y side-effects aislados.

## Rendimiento
- Caché TTL global aplicada a eventos.
- Reutilización de utilidades (QR, mail).
- Reducción de código duplicado entre controllers.

## Estilo y Documentación
- Convenciones de nombres consistentes.
- Documentos en `docs/` con decisiones y endpoints.
- Comentarios puntuales en controladores para flujos críticos.

## Pruebas
- Scripts de prueba con `ts-node-dev` en `tests/`.
- Cobertura mínima: autenticación, pago (preferencia), webhook, agregaciones.

## Estrategia de Branches
- `refactor/backend-utils`
- `refactor/payment-webhook`
- `refactor/event-cache`
- `refactor/frontend-tickets`
- Revisiones y pruebas antes de mergear a `main`.

## Validación
- Pruebas manuales y scripts.
- Logs estructurados para diagnósticos.

