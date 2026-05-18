# EventLife - Skill Interna del Proyecto

> Documento técnico reutilizable para agentes de IA. Léelo **completo** antes de modificar cualquier parte del sistema.

---

## 1. Resumen del Proyecto

**EventLife** es una plataforma SaaS/marketplace Full-Stack para la gestión de eventos y venta de entradas con código QR.

### Qué resuelve
- Permite a **organizadores** crear eventos, definir tipos de entrada, vender tickets y gestionar accesos mediante escáner QR.
- Permite a **asistentes** descubrir eventos, comprar entradas de forma segura (MercadoPago) y recibir tickets con QR en email.
- Es un **marketplace**: cobra comisiones por venta y ofrece planes de suscripción (FREE/PRO) con diferentes límites y tarifas.

### Usuarios y roles (jerarquía)
| Rol | Permisos |
|-----|----------|
| `admin` | Acceso total: métricas, usuarios, roles, categorías, comisiones |
| `organizer` | Crear/editar/eliminar eventos propios, gestionar promoters/scanners, ver stats |
| `scanner` | Escanear/validar tickets de eventos asignados a su organizador |
| `rrpp` (promoter) | Vender tickets con código propio, ver comisiones y eventos asignados |
| `user` | Comprar tickets, ver "mis tickets", editar perfil |

### Modelo de negocio
- **Comisión por transacción**: % configurable por plan del organizador.
- **Cargo de servicio**: % configurable cobrado al comprador (ej. 15%).
- **Suscripciones PRO**: Pago mensual/anual que da más eventos, más tipos de entrada y menor comisión.
- **Marketplace con MP OAuth**: Los organizadores conectan su cuenta de MercadoPago para recibir pagos directos. EventLife retiene la comisión vía split de pago (o token de plataforma como fallback).

---

## 2. Arquitectura y Stack

### Backend (`Backend/`)
| Capa | Tecnología | Notas |
|------|-----------|-------|
| Runtime | Node.js 18 | |
| Framework | Express 4.19 | |
| Lenguaje | TypeScript (`strict: false`) | |
| ORM | TypeORM 0.3.20 | `BaseEntity` + `DataSource` |
| DB | PostgreSQL 16 (Neon) | SSL en producción |
| Cache | Redis 4.6.13 | Rate limiting (prod), stats admin |
| Auth | JWT (HS256) + Refresh Tokens (SHA256 en DB, cookie httpOnly) + Google OAuth |
| Pagos | MercadoPago SDK (`mercadopago`) | Marketplace OAuth + Webhooks |
| Validación | Zod 3.23.8 | Env vars + request schemas |
| Email | Brevo/Sendinblue (SMTP) | Templates HTML con escapeHtml |
| Upload | Cloudinary | Imágenes de evento/perfil |
| Docs | Swagger UI (dev only) | `/api-docs` |

### Frontend (`Frontend/`)
| Capa | Tecnología | Notas |
|------|-----------|-------|
| Framework | Angular 17.3 | Standalone components |
| SSR | Angular SSR | `provideClientHydration` |
| Estilos | Tailwind CSS 3.4 | Responsive con `sm:`, `md:`, `lg:` |
| UI | Angular Material 17.3 | |
| Gráficos | ApexCharts + ng-apexcharts | Dashboards |
| QR | `@zxing/ngx-scanner` + `qrcode` (backend) | |
| Mapas | Leaflet 1.9.4 | Detalle de evento |
| Toasts | ngx-toastr 19.1 | Debounce de 3s |

---

## 3. Estructura de Carpetas

```
TP_DSW_2024_3K1/
├── Backend/
│   ├── src/
│   │   ├── index.ts              # Entrypoint: init DB, graceful shutdown
│   │   ├── app.ts                # Express pipeline (body parsers -> helmet -> CORS -> rate limit -> routes)
│   │   ├── db.ts                 # Re-export de DataSource
│   │   ├── config/
│   │   │   ├── env.ts            # Validación Zod de variables de entorno
│   │   │   ├── database.ts       # TypeORM DataSource (migraciones, synchronize en dev)
│   │   │   └── redis.ts          # Cliente Redis
│   │   ├── common/
│   │   │   ├── middleware/       # authToken, checkRole, rateLimit, errorHandler, schemaValidacion
│   │   │   ├── services/         # logger (con redacción), mailer, generateToken, sessionTokens, encryption, geolocation
│   │   │   └── utils/            # qr.ts (generación de QR PNG)
│   │   ├── user/                 # User, Role, RefreshToken, RoleAudit, AccountClaimToken
│   │   ├── event/                # Event (organizador)
│   │   ├── ticketType/           # TicketType (dentro de Event)
│   │   ├── ticket/               # Ticket (compra/entrada individual)
│   │   ├── payment/              # PaymentLog, Preference, Webhook processing, Refund, MP OAuth
│   │   ├── subscription/         # SubscriptionPlan, UserSubscription
│   │   ├── category/             # Category
│   │   ├── coupon/               # Coupon (descuentos por evento)
│   │   ├── scanner/              # ScannerOrganizerAssignment + validación QR
│   │   ├── promoter/             # PromoterGroup, PromoterEventAssignment
│   │   ├── admin/                # Métricas de plataforma
│   │   └── upload/               # Subida de imágenes a Cloudinary
│   ├── tests/                    # Tests manuales con ts-node-dev
│   └── database/migrations/      # Migraciones TypeORM
│
├── Frontend/
│   ├── src/app/
│   │   ├── pages/                # Componentes de página (lazy loaded)
│   │   ├── components/           # Componentes reutilizables (KPIs, charts, header, footer)
│   │   ├── services/             # Servicios HTTP
│   │   ├── guards/               # auth, admin, organizer, scanner, promoter
│   │   ├── interceptors/         # auth (añade Bearer), error (maneja 401/403/429)
│   │   ├── interfaces/           # Modelos TypeScript
│   │   ├── pipes/                # CurrencyFormatter, PercentFormatter
│   │   ├── app.routes.ts         # Definición de rutas con lazy loading
│   │   └── app.config.ts         # Config Angular
│   └── src/environments/         # environment.ts / environment.development.ts
```

---

## 4. Convenciones Críticas

### Backend
- **Cada módulo** sigue la estructura: `{modulo}.entity.ts`, `{modulo}.controller.ts`, `{modulo}.routes.ts`, `{modulo}.service.ts`.
- **Entidades**: heredan de `BaseEntity`, usan `timestamptz`, soft delete con `@DeleteDateColumn` donde aplique.
- **Timestamps**: TODAS las entidades deben usar `type: 'timestamptz'` (no `timestamp`).
- **Auth middleware**: `checkAuthToken` verifica JWT + consulta DB para `active=true` y `deletedAt IS NULL`. Ahora tiene cache de 5s en memoria (`Map`).
- **Logger**: SIEMPRE usar `logger.info/warn/error` del servicio centralizado. NUNCA usar `console.error` o `console.log` en controllers.
- **Errores**: En producción, los errores 4xx y 5xx retornan mensajes genéricos. NUNCA exponer `error.message` del ORM/DB al cliente.
- **Webhooks de MP**: Siempre responder 200. Errores de negocio irrecuperables retornan 200 (para que MP no reintente). Errores transitorios de infraestructura retornan 500.

### Frontend
- **Standalone components**: `standalone: true` en TODOS los componentes.
- **Inyección**: Preferir `inject()` sobre constructor.
- **Auth token**: Se guarda en **memoria** (`access-token.store.ts`), NO en `localStorage` (legacy). El refresh token va en cookie `httpOnly`.
- **HTTP**: Usar `withCredentials: true` para requests autenticados.

---

## 5. Flujos Críticos

### 5.1 Login / Auth
1. Frontend envía `POST /api/user/login` (email + password) o `POST /api/user/google` (credential).
2. Backend valida y retorna **access token** (JWT en memoria) + establece cookie **refresh token** (`httpOnly`, `secure` en prod).
3. El `auth.interceptor.ts` añade `Authorization: Bearer <token>` a cada request.
4. Si una request retorna 401, el interceptor intenta `POST /api/user/refresh`. Si falla, hace logout y navega a `/login`.
5. **Rate limiting**: Login/register tienen `authRateLimiter` (configurable vía env).

### 5.2 Crear Evento
1. Organizer `POST /api/event/new` con datos del evento + array de `ticketTypes`.
2. Backend valida:
   - Usuario autenticado y activo.
   - Tiene cuenta de MercadoPago vinculada (`mpUserId`).
   - Límites del plan de suscripción (`canCreateEvent`, `canCreateTicketTypes`).
3. Si es FREE y no tiene MP vinculado, retorna 403 `MP_NOT_LINKED`.
4. Se crea el evento y los ticket types con transacción atómica.

### 5.3 Compra de Ticket (Checkout)
1. Usuario selecciona ticket en frontend (`/ticket/:eventId`).
2. Frontend muestra timer de 10 min.
3. `POST /api/payment/create-preference` con `ticketTypeId`, `quantity`, opcionalmente `couponId` y `promoterCode`.
4. Backend:
   - Valida stock atómicamente (`pessimistic_write`).
   - Calcula precio + descuento + service fee + comisión.
   - Crea preferencia en MP (token del organizador si es marketplace, o token de plataforma).
   - Retorna `init_point`.
5. Frontend guarda metadata en `localStorage.lastPurchase` y redirige a MP.
6. Post-pago, MP redirige a `/checkout/success`, `/checkout/failure` o `/checkout/pending`.
7. Frontend hace polling a `GET /api/ticket/last-purchase` (autenticado) o `GET /api/payment/status?external_reference=...` (guest).

### 5.4 Webhook de MercadoPago
1. MP notifica a `POST /api/payment/webhook` con firma HMAC-SHA256.
2. Middleware `createValidateMPWebhookSignature` valida firma + anti-replay (timestamp < 5 min).
3. Controlador llama `resolveWebhookPayment` para obtener el pago con el token correcto (plataforma u organizador).
4. Si el pago está aprobado, llama `processApprovedPayment`:
   - Extrae info de `external_reference` o metadata.
   - Valida monto con tolerancia de `$0.01 ARS`.
   - Si el cupón expiró/agotó entre preferencia y pago, **procesa sin descuento** (no rechaza el pago).
   - Crea `PaymentLog` (idempotencia por `mpPaymentId` unique).
   - Actualiza stock atómicamente (`updateStockAtomic`).
   - Crea tickets con `createTicketsForPurchase` (UUID + QR por unidad).
   - Envía email con QR (asíncrono, no bloqueante).
   - Actualiza uso del cupón.
5. Si `PaymentLog` ya existe (duplicado), recupera los tickets ya creados.
6. **Siempre** responde 200 a MP.

### 5.5 Validación QR (Escáner)
1. Scanner accede a `/scanner` (requiere rol `scanner`, `organizer` o `admin`).
2. Frontend usa `@zxing/ngx-scanner` para leer QR.
3. Envía código único (UUID) a `POST /api/scanner/validate`.
4. Backend:
   - Sanitiza y busca ticket por `codigo_unico`.
   - Verifica que el scanner tenga permiso (`canValidateEvent`).
   - Valida que `ticketType.status === ACTIVE` y `event.active === true`.
   - Valida que el evento no haya terminado (>24h) ni sea muy futuro (<-3h).
   - Hace UPDATE condicional atómico: solo si `status === ACTIVE` lo marca como `USED`.
5. Si ya fue usado, retorna 409 "Entrada YA utilizada".

### 5.6 Reembolso
1. Organizer o admin `POST /api/payment/refund/:paymentId`.
2. `refund.service.ts`:
   - Busca el `PaymentLog`.
   - Actualiza DB primero: marca `REFUNDED`, cancela tickets (status `CANCELLED`), restaura stock (`GREATEST(soldCount - 1, 0)`).
   - Hace commit.
   - LUEGO llama API de MP para el reembolso real.
3. Esto garantiza consistencia interna aunque MP falle.

---

## 6. Entidades y Relaciones Principales

```
User 1:N Event (organizador)
User 1:N Ticket (comprador)
User 1:N PaymentLog (comprador)
User 1:N RefreshToken
User N:N Role (vía user_roles)
User 1:N PromoterGroup (como organizer)
User 1:N PromoterGroup (como promoter)
User 1:N ScannerOrganizerAssignment (como organizer/scanner)

Event N:1 Category
Event 1:N TicketType (cascade)
Event 1:N PromoterEventAssignment

TicketType 1:N Ticket
TicketType N:1 Event (onDelete: CASCADE)

Ticket N:1 TicketType (onDelete: RESTRICT)
Ticket N:1 User (comprador, onDelete: RESTRICT)
Ticket N:1 User (soldByPromoter, nullable, onDelete: SET NULL)
Ticket N:1 User (scannedBy, nullable, onDelete: SET NULL)
Ticket N:1 PaymentLog (nullable, onDelete: SET NULL)  <-- NUEVO

PaymentLog N:1 User (comprador)
PaymentLog N:1 TicketType
PaymentLog N:1 User (organizer, nullable)
PaymentLog N:1 User (refundedBy, nullable)

Coupon N:1 Event (onDelete: CASCADE)

SubscriptionPlan 1:N UserSubscription
UserSubscription N:1 User (onDelete: CASCADE)
UserSubscription N:1 SubscriptionPlan (onDelete: RESTRICT)
```

### Campos clave por entidad
| Entidad | Campo clave | Notas |
|---------|-------------|-------|
| `User` | `active`, `deletedAt` | Desactivar un usuario debe revocar sus refresh tokens |
| `User` | `mpUserId` | **UNIQUE** desde fix/auditoria-eventlife |
| `Event` | `date`, `time` | Siempre usar `getEventDateTime()` para combinarlos (fallback `00:00`) |
| `TicketType` | `soldCount` | Denormalizado; se mantiene manualmente. Riesgo de drift si hay bugs. |
| `Ticket` | `codigo_unico` | UUID v4, unique, usado para escaneo |
| `Ticket` | `status` | `ACTIVE` -> `USED` (atómico) o `CANCELLED` |
| `PaymentLog` | `mpPaymentId` | **UNIQUE**, idempotencia de webhooks |
| `PaymentLog` | `status` | `PROCESSING`, `COMPLETED`, `FAILED`, `REFUNDED` |
| `PaymentLog` | `deletedAt` | **NUEVO** soft delete para entidades financieras |
| `Coupon` | `usedCount`, `maxUses`, `expiresAt` | Validar antes de crear preferencia Y al procesar pago |

---

## 7. Seguridad

### Auth
- JWT: `HS256`, `iss: 'eventlife-api'`, `aud: CLIENT_URL`. Expira en 15m por defecto.
- Refresh tokens: SHA256 hash en DB, rotación con detección de reutilización (revoca todos si se detecta reuse).
- `checkAuthToken`: consulta DB cada request (ahora con cache de 5s en memoria) para verificar `active=true` y `deletedAt IS NULL`.
- `optionalAuthToken`: continúa como anónimo si token inválido.

### Rate Limiting
| Ruta | Límite |
|------|--------|
| Global | 120 req/min por IP |
| Auth (login/register) | Configurable vía env (default: 5 intentos / 15 min) |
| Refresh token | Configurable vía env (default: 10 / 60 min) |
| `POST /api/payment/create-preference` | 10 / 5 min |
| `GET /api/payment/status` | 30 / 1 min |
| `POST /api/payment/refund/:id` | 10 / 1 min |
| `POST /api/coupon/validate` | 20 / 1 min |

### Middleware pipeline (orden CRÍTICO)
1. `express.json()` / `express.urlencoded()`
2. `requestId`
3. `metrics`
4. `helmet` (CSP restrictivo)
5. `CORS` (whitelist exacto)
6. `globalRateLimiter`
7. `morgan`
8. Rutas `/api/*`

### Validación de webhooks MP
- Firma HMAC-SHA256 verificada.
- Anti-replay: timestamp del header no puede diferir > 5 min.
- Rechaza con 503 si `MP_WEBHOOK_SECRET` no está configurado.

---

## 8. Problemas Conocidos y Deuda Técnica

### Arquitectura
- **Sin sistema de colas/jobs**: Emails y webhooks se procesan sincrónicamente. Bajo carga alta, esto bloquea requests. **Recomendación**: Introducir BullMQ con Redis para desacoplar.
- **Emails síncronos en `inviteGuests`**: 50 emails x timeout de SMTP = potencial bloqueo de minutos.
- **SSE (`streamCreatorStats`)**: Polling a DB cada 30s por conexión. En múltiples réplicas (Render), el límite de 3 conexiones por usuario es por proceso, no global.

### Base de Datos
- **`TicketType.soldCount` denormalizado**: Sin triggers de DB para recalcular. Si hay race conditions o bugs, el stock se desfasa. Las queries ya usan `pessimistic_write`, pero un recálculo periódico o trigger sería ideal.
- **Falta tabla `TicketScanLog`**: Solo se guarda el último escaneo (`usedAt`, `scannedById`). Historial completo de validaciones no existe.
- **Falta historial de precios en `TicketType`**: Si un organizer cambia el precio, se pierde el histórico.
- **`synchronize: true` en desarrollo**: Riesgo de pérdida de datos por renombrado de columnas. Usar migraciones siempre.

### Frontend
- **Checkout sin confirmación previa**: Redirige directamente a MP sin pantalla de confirmación final.
- **Ticket card fijo 300px**: En móviles muy pequeños puede generar scroll horizontal.
- **`ticket.service.ts` duplica `payment.service.ts`**: Ambos llaman `/api/payment/create-preference`.
- **Sin retry automático** en requests HTTP.

### Pagos
- **Ventana temporal para reembolsos**: `refund.service.ts` busca tickets a cancelar por `createdAt ± 5 min` del `PaymentLog`. No hay FK directa `Ticket.paymentLogId` (se agregó en el fix, pero el código de refund aún usa la ventana temporal). **Migrar el refund a usar `paymentLogId` cuando se implemente en el código**.

---

## 9. Checklist para Futuros Agentes

Antes de tocar código, verificá:

- [ ] ¿Entendés qué flujo afecta tu cambio? (login, compra, webhook, QR, stats, etc.)
- [ ] ¿Leíste este `PROJECT_SKILL.md` completo?
- [ ] ¿Revisaste `AGENTS.md` en la raíz para convenciones de build?

Al modificar entidades:
- [ ] ¿Usaste `timestamptz` para todas las columnas de fecha/hora?
- [ ] ¿Agregaste `@DeleteDateColumn` si la entidad debería soportar soft delete?
- [ ] ¿Agregaste índices para las queries más frecuentes?
- [ ] ¿Escribiste una migración de TypeORM si cambiaste el schema en producción?

Al modificar pagos/webhooks:
- [ ] ¿El webhook responde 200 SIEMPRE?
- [ ] ¿La lógica es idempotente (verificar `PaymentLog` por `mpPaymentId`)?
- [ ] ¿No hay polling infinito dentro del webhook?

Al modificar auth:
- [ ] ¿Filtraste por `active: true`?
- [ ] ¿Consideraste revocar refresh tokens si desactivás un usuario?
- [ ] ¿No exponés `error.message` del ORM/DB al cliente?

Al modificar controllers:
- [ ] ¿Usaste `logger.error()` en lugar de `console.error()`?
- [ ] ¿Agregaste rate limiting a rutas sensibles nuevas?

---

## 10. Changelog de la Auditoría (fix/auditoria-eventlife)

Esta sección documenta los cambios aplicados durante la sesión de auditoría y hardening.

### Backend
- **Stats**: Todas las queries de estadísticas (`event.controller.ts`, `admin.service.ts`) ahora excluyen tickets con `status = 'CANCELLED'`. Los ingresos y participantes ya no están inflados.
- **Seguridad Auth**: `googleSignin` filtra `active: true`. `deleteUser` revoca todos los refresh tokens del usuario.
- **Information Disclosure**: `signupUser`, `updateUser` y `deleteUser` ya no retornan `error.message` al cliente. Usan mensajes genéricos.
- **Pagos**: `fetchPaymentOnce` ahora loggea errores antes de retornar null. `waitForPaymentApproval` redujo polling de 3 a 1 reintento para no exceder timeout de MP (~5s).
- **Cupones**: Si un cupón expira o se agota entre la creación de la preferencia y la notificación webhook, el pago se procesa **sin descuento** en lugar de fallar (evitando cobro sin tickets).
- **Rate Limiting**: Agregados limitadores a `/payment/status`, `/payment/refund/*`, `/coupon/validate`.
- **simulatePaymentWebhook**: Ahora solo disponible en `development`, no en `staging`.
- **Auth Cache**: `checkAuthToken` implementa cache en memoria de 5s para reducir SELECT a DB.
- **Logs**: Todos los `console.error`/`console.log` de controllers reemplazados por `logger.error`/`logger.info`.

### Base de Datos
- **`PaymentLog`**: Agregado `@DeleteDateColumn` para soft delete en entidades financieras.
- **`Ticket`**: Agregada columna `paymentLogId` (FK a `PaymentLog`, nullable) y relación `ManyToOne`.
- **`User`**: Agregada restricción `UNIQUE` en `mpUserId`.
- **`Event`**: Agregado índice `idx_event_title` para búsquedas por título.

### Frontend
- **Logout Race Condition**: `error.interceptor.ts` usa flag `isNavigatingToLogin` para evitar múltiples navegaciones simultáneas ante requests 401 paralelas.
- **localStorage**: `success.component.ts` limpia `lastPurchase` de `localStorage` al confirmar la compra.
- **404**: Creado componente `NotFoundComponent` y la ruta catch-all (`**`) ahora lo renderiza en lugar de redirigir silenciosamente al home.

---

*Documento generado para agentes de IA. Para información de build y deploy, consultar `AGENTS.md` y `README.md`.*
