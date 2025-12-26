# Auditoría Técnica del Backend

## Resumen Ejecutivo
- Monolito Express + TypeORM + Postgres con JWT, Zod, CORS, Helmet, Rate Limit, MercadoPago, Nodemailer y Swagger.
- Riesgos altos: webhook de pagos sin validación de firma, endpoints de usuario sin autenticación, CORS hardcodeado, ausencia de `reflect-metadata`, concurrencia en compra/validación de tickets y decremento de capacidad inconsistente.
- Se proponen medidas inmediatas en seguridad y consistencia transaccional, seguidas de estandarización arquitectónica, observabilidad y rendimiento.

## Arquitectura Actual
- Framework y middlewares: `express`, `helmet`, `express-rate-limit`, `cors`, `morgan` en `Backend/src/app.ts:1-59`.
- Routers por dominio: `user`, `event`, `ticket`, `category`, `payment` en `Backend/src/app.ts:84-91`.
- Base de datos: TypeORM `DataSource` con entidades `User`, `Event`, `Ticket`, `Category`, `PaymentLog`, `RoleAudit` en `Backend/src/db.ts:12-25`.
- Seguridad y auth: JWT (`Backend/src/lib/generateToken.ts`) y middlewares (`Backend/src/middlewares/authToken.ts`, `Backend/src/middlewares/checkRole.ts`).
- Pagos: MercadoPago con creación de preferencias y webhook en `Backend/src/payment/payment.controller.ts` y rutas en `Backend/src/payment/payment.routes.ts`.
- Documentación: Swagger programático en `Backend/src/docs/swagger.ts`.
- Observabilidad: `morgan` y manejador global de errores en `Backend/src/middlewares/errorHandler.ts`.

## Puntos Flojos

### Seguridad
- Webhook sin verificación de firma: captura `x-signature` pero no valida HMAC (`Backend/src/payment/payment.controller.ts:174-185, 191-196`).
- Endpoints sensibles sin autenticación: `GET /api/user/:id` y `DELETE /api/user/:id` carecen de `checkAuthToken` y `checkRoleAuth` (`Backend/src/routers/user.routes.ts:29-33`).
- CORS hardcodeado, se ignora helper `isOriginAllowed`: lista fija en `Backend/src/app.ts:30-39` aunque existen `allowedOriginsRaw` y `isOriginAllowed` (`Backend/src/app.ts:21-29`).
- SSL con certificados no validados (`rejectUnauthorized: false`) en `Backend/src/db.ts:24`.
- Falta `import 'reflect-metadata'` requerido por TypeORM en `Backend/src/index.ts:1`.

### Rendimiento
- Conteos repetidos de tickets en compras/webhook: `Backend/src/payment/payment.controller.ts:248-254` y `Backend/src/ticket/ticket.controller.ts:48-55`.
- SSE recalcula agregados cada 5s con joins: `Backend/src/event/event.controller.ts:236-265`.
- Caché en memoria limitado: `Backend/src/utils/cache.ts:27` y uso en `Backend/src/event/event.controller.ts:360-388`.

### Concurrencia
- Riesgo de oversell: decrementos directos de `capacity` sin bloqueo de fila en `Backend/src/payment/payment.controller.ts:257-259` y `Backend/src/ticket/ticket.controller.ts:66-68`.
- Validación de ticket no atómica: actualización directa a `USED` (`Backend/src/ticket/ticket.controller.ts:162-166`) sin condición por estado.

### Estructura y Duplicación
- Lógica de compra, decremento de capacidad y envío de correo duplicada entre `payment.controller` y `ticket.controller` (`Backend/src/payment/payment.controller.ts:260-283` y `Backend/src/ticket/ticket.controller.ts:69-99`).
- Mezcla inconsistente de acceso a datos: `BaseEntity`, repos y `QueryRunner` sin una convención clara.

### Errores y Logging
- Respuestas de error heterogéneas; se evita `next(err)` para un manejo centralizado (p.ej. `Backend/src/user/user.controller.ts:30`).
- Logging con potencial PII en pagos: `Backend/src/payment/payment.controller.ts:32-34, 80-81, 195-196`.

### Dependencias y Configuración
- Dependencias no utilizadas: `@nestjs/typeorm`, `nanoid` (sólo presentes en `Backend/package.json:27,39`).
- CORS y URLs del cliente hardcodeadas en `Backend/src/app.ts:31-35`.

### Modelo de Datos
- Typos en columnas de actualización: `updateAd` en `Backend/src/user/user.entity.ts:51` y `Backend/src/event/event.entity.ts:50`.

## Malas Prácticas Detectadas
- Violaciones SOLID: controladores orquestan negocio, DB, caché y correo; falta capa de servicios/repositorios.
- Acoplamiento excesivo y baja cohesión: controladores importan múltiples módulos y tareas asíncronas.
- Documentación incompleta: Swagger parcial, sin endpoints de eventos/tickets/pagos.
- Tests insuficientes: existen pruebas de smoke en `Backend/tests`, faltan integración, concurrencia y firma del webhook.
- Configuraciones hardcodeadas: CORS y `CLIENT_URL` no centralizadas ni validadas.
- Logging inadecuado: uso de `console.*` sin niveles, sin trazas por request ni sanitización.

## Impacto Potencial
- Seguridad: riesgo de fraude por falsificación de pagos, acceso no autorizado, MITM por SSL laxo.
- Consistencia: oversell y doble validación de tickets; estados incoherentes ante fallos parciales.
- Rendimiento: carga de CPU/DB por SSE y conteos frecuentes sin caché distribuido.
- Mantenibilidad: duplicación y mezcla de responsabilidades complican evolución y observabilidad.

## Recomendaciones Específicas

### Seguridad
- Validar firma del webhook MercadoPago: usar `x-signature` con HMAC y cuerpo crudo; rechazar si no coincide.
- Proteger `GET/DELETE /api/user/:id` con `checkAuthToken` y `checkRoleAuth`.
- CORS dinámico: usar `isOriginAllowed(origin)` alimentado por `CLIENT_URLS` del entorno.
- Importar `reflect-metadata` al inicio de `Backend/src/index.ts`.
- Configurar `ssl.rejectUnauthorized: true` en producción y carga de CA adecuada.

### Concurrencia y Consistencia
- Transacciones con bloqueo pesimista sobre `Event` en compra/cancelación; atomizar validación de ticket con `UPDATE ... WHERE status=VALID` y verificación de `affected`.
- Definir semántica de `capacity` como máximo; disponibilidad derivada por `COUNT(*)`. Si se mantiene como “restante”, hacerlo atómico bajo lock de fila.

### Arquitectura
- Extraer `TicketService` y `PaymentService` con métodos `checkStock`, `decrementCapacity`, `createTickets`, `sendTicketsEmail`; repos TypeORM (`getRepository`) como estándar; `QueryRunner` sólo para operaciones críticas.
- Estandarizar errores con util `httpError(status, code, message)` y `next(err)`; respuestas con `code` y `message` uniformes.

### Rendimiento y Caché
- Redis para cachés (`events:all`, métricas), invalidación a eventos de dominio (crear/actualizar/borrar evento, compra/cancelación).
- Reducir frecuencia de SSE o migrar a endpoint “pull” con filtros; precomputar agregados.
- Índices: `Ticket(eventId,userId,codigo_unico)`, `Event(user_id)` y `PaymentLog(mpPaymentId)` único.

### Observabilidad
- Logger estructurado (pino/winston) con `request-id`, niveles y sanitización; trazas por request.
- Métricas Prometheus/Grafana: latencias, throughput, errores, colas, dependencias externas.

### Configuración
- Módulo `config` con validación Zod de `.env`; eliminar hardcodes de CORS/URLs y centralizar valores.

### Datos
- Migración `updateAd` → `updatedAt`; desactivar `synchronize` en producción y usar migraciones.

### Dependencias
- Remover paquetes no utilizados (`@nestjs/typeorm`, `nanoid`); auditoría de vulnerabilidades periódica.

## Propuestas para Robustez y Escalabilidad
- Arquitectura modular/microservicios: separar Auth/Usuarios, Eventos/Tickets, Pagos, Notificaciones, Analytics; contratos HTTP/cola.
- Circuit breakers y resiliencia: para MercadoPago/SMTP usando `opossum`/`cockatiel`; `retry` exponencial y `timeout` por servicio.
- Caché distribuido: Redis para listas y métricas; claves por usuario/evento; TTLs e invalidación.
- Auto-escalado: contenerización y HPA en Kubernetes; separar API y workers de colas.
- Monitoreo y métricas: Prometheus con histogramas de latencias, contadores de errores y gauges de colas; Grafana dashboards.
- Colas para procesamiento asíncrono: BullMQ/RabbitMQ para emails, reconciliación de pagos y PDFs.
- Sharding/particionamiento: por `user_id` o rango de `event_id`; particiones por fecha para tickets si volumen crece.
- API Gateway: Kong/Nginx para rate limit, auth, enrutado y observabilidad agregada.

## Plan de Acción Priorizado

### Alta Prioridad
- Validar firma del webhook y usar cuerpo crudo; sanitizar logs de pagos. Esfuerzo: 0.5–1 día. Beneficio: muy alto. Riesgo: muy alto.
- Proteger `GET/DELETE /api/user/:id` con auth/roles. Esfuerzo: 0.25 día. Beneficio: alto. Riesgo: alto.
- Importar `reflect-metadata` y revisar inicialización TypeORM. Esfuerzo: 0.1 día. Beneficio: medio. Riesgo: medio.
- Unificar CORS con `isOriginAllowed` y `CLIENT_URLS`. Esfuerzo: 0.25 día. Beneficio: medio. Riesgo: medio.
- Transacciones con lock en compra/cancelación; definir semántica de `capacity`. Esfuerzo: 1–2 días. Beneficio: muy alto. Riesgo: alto.

### Prioridad Media
- Validación de ticket atómica. Esfuerzo: 0.5 día. Beneficio: alto. Riesgo: medio.
- Extraer `TicketService`/`PaymentService` y centralizar email. Esfuerzo: 2–3 días. Beneficio: alto. Riesgo: medio.
- Estandarizar manejo de errores con `next(err)` y códigos. Esfuerzo: 1 día. Beneficio: alto. Riesgo: medio.
- Índices y caché Redis. Esfuerzo: 1–2 días. Beneficio: alto. Riesgo: medio.

### Prioridad Baja
- Migración `updateAd` → `updatedAt` y desactivar `synchronize` en prod. Esfuerzo: 0.5–1 día. Beneficio: medio. Riesgo: bajo.
- Optimizar SSE o mover a pull. Esfuerzo: 0.5 día. Beneficio: medio. Riesgo: bajo.
- Limpiar dependencias no usadas. Esfuerzo: 0.25 día. Beneficio: bajo. Riesgo: bajo.
- SSL con `rejectUnauthorized: true` y CA. Esfuerzo: 0.5 día. Beneficio: medio. Riesgo: bajo.

## Ejemplos de Código Refactorizado

### CORS dinámico (`Backend/src/app.ts`)
```ts
app.use(cors({
  origin: (origin, cb) => cb(null, isOriginAllowed(origin) ? origin : false),
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  optionsSuccessStatus: 204
}))
```

### `reflect-metadata` (`Backend/src/index.ts`)
```ts
import 'reflect-metadata'
```

### Firma de Webhook y cuerpo crudo (`Backend/src/payment/payment.routes.ts`)
```ts
import express from 'express'
router.post('/webhook', express.raw({ type: '*/*' }), validateSignature, paymentWebhook)
```

`validateSignature`:
```ts
import { Request, Response, NextFunction } from 'express'
import { createHmac } from 'crypto'
export function validateSignature(req: Request, res: Response, next: NextFunction) {
  const sig = req.header('x-signature') || ''
  const secret = process.env.MP_WEBHOOK_SECRET || ''
  if (!secret) return res.status(500).json({ code: 'WEBHOOK_SECRET_MISSING' })
  const expected = createHmac('sha256', secret).update(req.body as Buffer).digest('hex')
  if (sig.split('=')[1] !== expected) return res.status(401).json({ code: 'INVALID_SIGNATURE' })
  next()
}
```

### Compra con lock y transacción
```ts
const qr = AppDataSource.createQueryRunner()
await qr.connect()
await qr.startTransaction()
try {
  const event = await qr.manager.createQueryBuilder(Event,'e')
    .setLock('pessimistic_write')
    .where('e.id = :id',{ id: eventId })
    .getOne()
  if (!event) return res.status(404).json({ code: 'EVENT_NOT_FOUND' })
  const sold = await qr.manager.count(Ticket,{ where: { event: { id: event.id } } })
  const available = event.capacity - sold
  if (available < amount) return res.status(409).json({ code: 'NO_STOCK' })
  event.capacity -= amount
  await qr.manager.save(event)
  const tickets = await Promise.all(Array.from({ length: amount }, async () => {
    const codigo_unico = randomUUID()
    const qrCode = await generarQRUrl(codigo_unico)
    return qr.manager.create(Ticket,{ event, user, eventId: event.id, userId: user.id, codigo_unico, qrCode, titleEvent: event.title, purchasePrice: event.price, status: TicketStatus.VALID })
  }))
  await qr.manager.save(Ticket, tickets)
  await qr.commitTransaction()
  return res.status(200).json({ tickets_created: amount })
} catch (e) {
  await qr.rollbackTransaction()
  return res.status(500).json({ code: 'INTERNAL_ERROR' })
} finally {
  await qr.release()
}
```

### Validación de ticket atómica
```ts
const idOrCode = String(code)
const repo = AppDataSource.getRepository(Ticket)
const existing = await repo.findOne({ where: [{ codigo_unico: idOrCode }, { id: parseInt(idOrCode) || -1 }] })
if (!existing) return res.status(404).json({ valid: false })
const result = await repo.createQueryBuilder()
  .update(Ticket)
  .set({ status: TicketStatus.USED, usedAt: new Date() })
  .where('id = :id AND status = :status',{ id: existing.id, status: TicketStatus.VALID })
  .execute()
if (!result.affected) return res.status(400).json({ valid: false })
return res.json({ valid: true })
```

### Manejo de errores centralizado
```ts
function httpError(status: number, code: string, message: string) {
  const err: any = new Error(message)
  err.status = status
  err.code = code
  return err
}
// next(httpError(401,'AUTH_REQUIRED','No autorizado'))
```

### Configuración tipada
```ts
import { z } from 'zod'
const Env = z.object({
  SECRET_KEY: z.string().min(1),
  MP_ACCESS_TOKEN: z.string().min(1),
  CLIENT_URLS: z.string().min(1),
  POSTGRES_URL: z.string().optional(),
  DATABASE_URL: z.string().optional()
})
export const env = Env.parse(process.env)
```

## Anexos
- Archivos clave revisados:
  - `Backend/src/app.ts`, `Backend/src/index.ts`, `Backend/src/db.ts`
  - `Backend/src/payment/payment.controller.ts`, `Backend/src/payment/payment.routes.ts`
  - `Backend/src/ticket/ticket.controller.ts`, `Backend/src/event/event.controller.ts`
  - `Backend/src/middlewares/*`, `Backend/src/lib/*`, `Backend/src/docs/swagger.ts`
- Tests existentes: `Backend/tests/*.ts` (auth, roles, payment, idempotencia)
- Dependencias: `Backend/package.json:26-64`

---

Este informe prioriza seguridad y consistencia transaccional, seguido de estandarización de arquitectura, observabilidad y rendimiento. Se recomienda implementar de inmediato las mejoras de alta prioridad y acompañarlas con pruebas automatizadas y documentación actualizada.

