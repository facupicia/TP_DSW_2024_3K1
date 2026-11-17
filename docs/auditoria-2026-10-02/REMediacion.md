# Correcciones de EventLife — 2 de octubre de 2026

Se implementaron correcciones para los 24 hallazgos del informe inicial. Ese informe y sus reproducciones documentan el estado anterior; las pruebas vigentes están en `Backend/tests` y en los specs de Angular.

## Cambios principales

| Hallazgos | Resultado |
|---|---|
| 01–02 | Una compra parcialmente agotada revierte la emisión y el inventario con savepoint. La compensación monetaria queda persistida. El webhook confirma recepción después de guardar el trabajo; una falla de persistencia responde 503. |
| 03–05 | La devolución exige vínculos exactos a `paymentLogId`, bloquea el pago y restaura solo las filas que cambian de estado. Una intención única conserva la clave de idempotencia de MP. Cancelación local, devolución pendiente y confirmación monetaria son estados separados. |
| 06 | Se conserva `promoter_code`, se verifica la asignación al evento y se evita duplicar la comisión al comprar múltiples tipos de entrada. |
| 07–08 | Rotación de refresh serializada, reclamo de cuentas de un solo uso, invalidación al convertir guests con Google y versión de credenciales para invalidar sesiones anteriores. |
| 09–10 | El estado de una compra requiere su propietario o un token aleatorio de checkout. El frontend consulta la referencia exacta y no confirma una compra anterior. |
| 11–12 | Dependencias actualizadas, lockfiles coherentes, auditorías sin alertas, instalación con `npm ci`, Node 22 y pruebas obligatorias en CI. |
| 13–15 | Emails e intenciones de devolución usan una outbox PostgreSQL en la misma transacción de negocio. Hay leases, tres trabajos concurrentes por proceso, reintentos y deduplicación. Redis queda opcional para el arranque. BullMQ conserva compatibilidad con trabajos anteriores. |
| 16 | Fechas de eventos calculadas desde fecha, hora y zona IANA explícita; backfill en Buenos Aires para los eventos ficticios existentes. |
| 17–19 | Errores internos sin detalles técnicos en respuestas, `HttpError` compartido, control de Origin en operaciones con cookies, reautenticación para cambiar email/contraseña e invalidación de sesiones. |
| 20–22 | Ruta de evento corregida, labels y botones accesibles, foco visible, menú oculto fuera de la navegación de teclado, toasts adaptados a móviles y exportaciones CSV protegidas contra fórmulas. |
| 23–24 | Documentación y comandos actualizados. Reservas de entradas y extras persistidas en PostgreSQL durante diez minutos, con bloqueo e índice de vencimiento. Si MP no crea la preferencia, la reserva deja de estar activa. |

También se implementó recuperación de contraseña con enlaces de 30 minutos, propósito separado del reclamo de cuenta, consumo atómico y revocación de sesiones. El OAuth de MercadoPago comprueba un estado ligado al navegador. Los precios, cargos y comisión de plataforma se congelan al crear el checkout; los descuentos se distribuyen en centavos. Se rechazan eventos de distintos organizadores y monedas distintas de ARS.

## Validación

Verificación final del 2 de octubre de 2026: instalación limpia con `npm ci` aprobada en ambos proyectos, seguida de las compilaciones, pruebas y auditorías indicadas debajo. Las pruebas contra PostgreSQL y el smoke HTTP también se repitieron sobre el backend recién compilado.

- Backend: compilación TypeScript y 25 pruebas automatizadas aprobadas. Parte de ellas ejecutan las consultas y la migración en PGlite, un PostgreSQL embebido aislado. Los proveedores externos se simulan. La consulta de extras se genera con TypeORM y ejecuta sus joins y bloqueo de stock en PostgreSQL aislado.
- Frontend: compilación de producción y 13 pruebas Karma en ChromeHeadless aprobadas. Incluyen referencia de compra, token de checkout, cancelación de requests, actualización de roles sin cerrar sesión, selección del plan PRO y actualización del perfil tras comprar una suscripción.
- TypeORM: 24 entidades y 11 migraciones cargadas correctamente. El descubrimiento excluye scripts antiguos de `dist` y evita cargar `.ts` y `.js` juntos.
- Smoke HTTP: arranque sin Redis, health check, rechazo de CSRF y privacidad del estado de compra aprobados.
- PostgreSQL configurado: migración nueva aplicada y verificada tras la aclaración del usuario de que todos los datos son ficticios. Verificación de `UPDATE RETURNING`, stock concurrente, `SKIP LOCKED` y rollback en un esquema temporal, eliminado al terminar.
- `npm audit` completo: cero vulnerabilidades reportadas en ambos proyectos. Resultados actuales: `dependencias-backend-corregidas.json` y `dependencias-frontend-corregidas.json`.

## Operación y despliegue

La compra de entradas con extras conserva el bloqueo de inventario usando un alias minúsculo compatible con `FOR UPDATE OF` en PostgreSQL. El perfil muestra el nombre del plan activo y fuerza su actualización tras el checkout; la opción que anuncia PRO ahora selecciona exclusivamente ese plan, en lugar del primer plan pago (STARTER). La tarjeta del plan pago ya no queda oculta por una condición contradictoria.

La promoción a organizador al crear un evento conserva la sesión: carga la versión real de credenciales, invalida la caché de permisos después del commit y devuelve token y roles juntos. El frontend actualiza su perfil en memoria sin una consulta intermedia. Los controladores de promotores devuelven 403 por falta de rol, reservando 401 para ausencia de sesión; anteriormente `/promoter/has-events` devolvía 401 con roles cacheados y disparaba refresh/logout. Las pruebas reproducen esa secuencia y comprueban el acceso con la misma sesión tras invalidar la caché.

La migración `DurableCommerce1790964000000` ya está aplicada en la base configurada localmente. Los datos ficticios se conservaron; las fechas se recalcularon con la zona explícita. No se desplegó el código en Render ni Netlify.

En otras bases con el esquema anterior, instalar con `npm ci`, compilar y ejecutar `npm run db:migrate:prod` antes de iniciar réplicas. Las migraciones ya no se ejecutan automáticamente en cada arranque; producción rechaza migraciones pendientes y `DB_SYNC=true`. No usar los seeds como mecanismo de migración. Una base completamente vacía necesita primero el esquema inicial histórico del proyecto.

CI y hosting siguen los parches de Node 22; el mínimo de compatibilidad es 22.12.0. La validación local utilizó 22.12.0. Mantener la rama actualizada según el [calendario oficial de Node](https://github.com/nodejs/Release).

Redis es opcional. Sin Redis, las ventas, emails y devoluciones persisten en PostgreSQL; el rate limiter usa memoria por proceso. Para límites compartidos entre múltiples réplicas, configurar Redis. Si Redis está configurado y falla, el limitador distribuido mantiene su comportamiento de rechazo, sin dejar pasar solicitudes ilimitadas.

El worker de outbox arranca en el proceso HTTP, con tres trabajos simultáneos, leases de dos minutos y heartbeat. Los fallos reintentan con backoff hasta una hora entre intentos. Puede arrancarse en un proceso dedicado usando las mismas funciones. Los emails tienen entrega al menos una vez: un fallo después del envío externo y antes del ACK puede repetir un correo. Los pagos y devoluciones tienen idempotencia persistida. El payload se vacía después de completar el trabajo.

`GET /api/admin/operations` muestra trabajos pendientes/reintentando y devoluciones rechazadas. `POST /api/admin/refunds/:id/retry` permite al admin reintentar una devolución fallida, conservando la misma clave de idempotencia. Revisar el error del proveedor antes de reintentar. No se admite devolución parcial ni una compra con entradas/extras utilizados. Los pagos históricos sin vínculos verificables no se cancelan automáticamente.

Los endpoints de sesión requieren un Origin incluido en `CLIENT_URLS` o `CLIENT_URL`. Clientes de pruebas HTTP deben enviarlo explícitamente. El OAuth y refresh entre dominios siguen sujetos a las políticas de cookies del navegador; para producción con restricciones de cookies de terceros conviene publicar frontend y API bajo el mismo dominio.

## Comandos de verificación

```sh
cd Backend
npm ci
npm test
npm run build
npm audit
# Comandos explícitos que usan la DB configurada:
npm run test:postgres
npm run test:smoke

cd ../Frontend
npm ci
npm run build
npm run test:ci
npm audit
```

La suite aislada de backend no usa `.env`, conexiones externas ni pagos. Las pruebas PostgreSQL usan un esquema temporal exclusivo y verifican su nombre antes de eliminarlo. El smoke HTTP solo arranca si no hay trabajos pendientes y deshabilita BullMQ durante la prueba.

La validación no incluye cobros/reembolsos reales, una prueba E2E contra MercadoPago/Google/Brevo ni una evaluación visual completa de accesibilidad. Antes de abrir ventas reales, completar el flujo con credenciales sandbox, confirmar la entrega de email y configurar las alertas operativas. El backend todavía utiliza `strict:false`; el tipado estricto puede incorporarse gradualmente por módulo.

Referencia utilizada para las devoluciones: [API oficial de MercadoPago](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-api-payments/create-refund/post).
