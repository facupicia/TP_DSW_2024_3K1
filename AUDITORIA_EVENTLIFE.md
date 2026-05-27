# AUDITORÍA EVENTLIFE - REPORTE FINAL

> Fecha: 2026-05-26
> Arquitecto: Senior Software Architect (Auditoría Full-Stack)
> Proyecto: EventLife - Node.js/Express + Angular 17 + PostgreSQL/TypeORM

---

## 1. Problemas Críticos 🔴

### Backend

#### 1.1 `refund.service.ts` — Orden de reembolso inverte garantía de consistencia
- **Archivo:** `Backend/src/payment/refund.service.ts`, línea 179, función `processRefund`
- **Descripción:** El comentario explícito dice *"Call MercadoPago refund API FIRST, before touching DB"*. Si MP devuelve éxito pero la transacción local falla (network, deadlock, error de conexión), el dinero fue devuelto pero los tickets siguen activos y el stock no se restauró. Esto contradice la documentación de hardening (`AGENTS.md`) que afirma que el orden fue invertido para garantizar consistencia local primero.
- **Impacto:** Un comprador recibe el reembolso y conserva entradas válidas (asistencia gratuita).
- **Recomendación:** Invertir el orden. Ejecutar la transacción DB primero (marcar `PaymentLog` como `REFUNDED`, cancelar tickets, restaurar stock con `GREATEST`), hacer `commit`, y **después** llamar a la API de MercadoPago. Si MP falla tras el commit, loguear la inconsistencia para reconciliación manual.

#### 1.2 `generateToken.ts` — Bypass de validación `issuer`/`audience` en JWT
- **Archivo:** `Backend/src/common/services/generateToken.ts`, líneas 15-25, función `verifyToken`
- **Descripción:** Si la verificación inicial falla por `issuer` o `audience` incorrectos, el código hace un **fallback** que re-verifica el token **sin** esas validaciones (`jwt.verify(token, env.SECRET_KEY, { algorithms: ['HS256'] })`). Esto anula la protección de contexto (ambiente/audience) y permite que tokens sin `iss`/`aud`, o tokens emitidos para otros ambientes (staging), sean aceptados en producción.
- **Impacto:** Un atacante con un token válido de staging o un token legacy pre-hardening puede usarlo en producción con plenos privilegios.
- **Recomendación:** Eliminar el fallback legacy. Todos los tokens deben fallar si no tienen `iss: 'eventlife-api'` y `aud` coincidente. Si se requiere compatibilidad temporal, implementar un endpoint explícito de intercambio de token.

### Frontend

#### 1.3 `event-stats.component.ts` — Memory leak infinito por acumulación de `interval`
- **Archivo:** `Frontend/src/app/pages/event-stats/event-stats.component.ts`, líneas 149-158, función `ngOnInit`
- **Descripción:** Dentro de `this.authService.ensureCurrentUser().subscribe()`, se crea un `interval(15000).subscribe()` cada vez que el observable de usuario emite. Como `ensureCurrentUser()` es un `BehaviorSubject` que puede emitir múltiples veces, se acumulan timers infinitos que nunca se limpian. El `refresh$` tampoco evita duplicados porque se sobrescribe sin `unsubscribe()` previo.
- **Impacto:** Degradación progresiva de performance del navegador; potencial crash en sesiones largas.
- **Recomendación:** Mover `this.authService.ensureCurrentUser()` a una asignación con `.pipe(take(1))`, o usar `exhaustMap`. Guardar la suscripción del interval en una variable y hacer `unsubscribe()` antes de crear una nueva.

#### 1.4 `creator-stats.component.ts` — XSS en exportación PDF
- **Archivo:** `Frontend/src/app/pages/creator-stats/creator-stats.component.ts`, líneas 343-406, función `exportPdf`
- **Descripción:** Abre una ventana en blanco e inyecta HTML directamente con `printWindow.document.write(...)` usando datos dinámicos del backend (`reportData.period`, métricas, títulos de eventos) sin sanitización ni escape. Si el backend devuelve HTML/JS malicioso en títulos de eventos, se ejecuta en el contexto de la nueva ventana.
- **Impacto:** Ejecución de scripts arbitrarios en el navegador del organizador.
- **Recomendación:** Reemplazar `document.write` por generación de Blob con una librería de PDF (jspdf, html2pdf) o, si se mantiene el HTML, escapar **TODAS** las interpolaciones con una función de escape HTML antes de inyectar.

### Base de Datos & Sinergia

#### 1.5 `category.controller.ts` — Soft delete declarado pero nunca ejecutado
- **Archivo:** `Backend/src/category/category.controller.ts`, línea 55, función `deleteCategory`
- **Descripción:** `Category` tiene `@DeleteDateColumn` configurado en la entidad, pero el controller invoca `category.remove()`, que ejecuta un `DELETE` físico en PostgreSQL. La columna `deletedAt` nunca se popula.
- **Impacto:** Pérdida de datos sin recuperación; inconsistencia entre el modelo declarativo y el comportamiento real.
- **Recomendación:** Reemplazar `category.remove()` por `category.softRemove()` o eliminar `@DeleteDateColumn` si la intención es hard delete real.

#### 1.6 `event.entity.ts` / `product.entity.ts` — `CASCADE` peligroso borra datos de negocio
- **Archivo:** `Backend/src/event/event.entity.ts`, línea 80 (`onDelete: 'CASCADE'` en relación a `User`)
- **Archivo:** `Backend/src/product/product.entity.ts`, línea 50 (similar)
- **Descripción:** Si un organizador elimina su cuenta, `onDelete: 'CASCADE'` borra físicamente todos sus eventos y productos de catálogo, afectando compradores, tickets vendidos y referencias históricas.
- **Impacto:** Pérdida irreversible de datos transaccionales y contenido generado por usuarios.
- **Recomendación:** Cambiar a `onDelete: 'SET NULL'` en ambas relaciones, o implementar borrado lógico en cascada controlado vía servicio (no a nivel de FK automático).

#### 1.7 `user_subscription.entity.ts` — `CASCADE` elimina historial financiero
- **Archivo:** `Backend/src/subscription/user_subscription.entity.ts`, línea 33
- **Descripción:** Borrar un usuario (`onDelete: 'CASCADE'`) elimina su `UserSubscription`. En un sistema con pagos y comisiones, esto destruye el historial de facturación, fechas de renovación y límites aplicados.
- **Impacto:** Imposibilidad de auditar pagos pasados o resolver disputas.
- **Recomendación:** Cambiar a `onDelete: 'RESTRICT'` para impedir borrado de usuarios con suscripciones activas/pasadas.

#### 1.8 `event.entity.ts` — Tabla usa palabra reservada de PostgreSQL
- **Archivo:** `Backend/src/event/event.entity.ts`, línea 22
- **Descripción:** `@Entity("event")` define una tabla llamada exactamente `event`, que es palabra reservada en PostgreSQL. Aunque TypeORM escapa los identificadores, queries raw o herramientas de admin pueden fallar silenciosamente o requerir comillas constantes.
- **Impacto:** Errores difíciles de debuguear en queries manuales, backups o análisis con `psql`.
- **Recomendación:** Renombrar la tabla a `events` mediante migración TypeORM.

#### 1.9 `ticket.ts` (frontend) — Interfaz completamente desfasada respecto al backend
- **Archivo:** `Frontend/src/app/interfaces/ticket.ts`
- **Descripción:** La interfaz `Ticket` solo declara `{ quantity: number }`, pero el backend devuelve objetos con `id`, `codigo_unico`, `qrCode`, `event`, `ticketTypeName`, `status`, `purchasePrice`, `usedAt`, etc. El servicio `TicketService.getTicketsByUser()` tipa la respuesta como `Observable<Ticket[]>`, generando un tipo seguro **falso** que oculta la estructura real y permite acceder en el frontend a propiedades no declaradas sin control de TypeScript.
- **Impacto:** Errores de runtime por acceso a propiedades inexistentes o mal tipadas; imposibilidad de refactors seguros.
- **Recomendación:** Crear una interfaz `UserTicket` en `Frontend/src/app/interfaces/ticket.ts` que refleje exactamente los campos devueltos por `ticket.service.ts` del backend (incluyendo `event` anidado y `ticketTypeName`).

#### 1.10 `payment.service.ts` — Contrato obsoleto contra endpoint real
- **Archivo:** `Frontend/src/app/services/payment.service.ts`, función `createPreference`
- **Descripción:** La firma del método acepta un único `ticketTypeId` y `ticketQuantity` como parámetros individuales, pero el endpoint `/api/payment/create-preference` del backend espera un body con `items: Array<{ ticketTypeId, quantity }>` (carrito multi-item) y `extraItems`. Si un componente invoca este servicio, el backend recibe un body incompatible.
- **Impacto:** Error 400 en el checkout o uso forzado de `any`/`@ts-ignore` para bypassar el tipado.
- **Recomendación:** Actualizar la firma para recibir `items` y `extraItems`, alineándola con el body que envía `TicketService.comprarTicket`.

#### 1.11 `category.service.ts` — Envía `string` crudo en lugar de objeto JSON
- **Archivo:** `Frontend/src/app/services/category.service.ts`, línea 18, función `cargarCategoria`
- **Descripción:** El método recibe `objeto: string` y lo envía vía POST en el body crudo. El backend `createCategory` espera `{ name: string }` validado por Zod (`schema.category.ts`). Esta llamada fallará siempre con error de validación o de parsing.
- **Impacto:** Feature de creación de categorías rota en producción.
- **Recomendación:** Cambiar la firma a `objeto: { name: string }` y enviar el objeto directamente en el body.

---

## 2. Problemas Importantes 🟡

### Backend

#### 2.1 Fuga de información en errores 500 de controladores
- **Archivos:**
  - `Backend/src/ticket/ticket.controller.ts` líneas 17-23 (`handleHttpError`)
  - `Backend/src/event/event.controller.ts` líneas 19-25 (`handleServiceError`)
  - `Backend/src/user/user.controller.ts` líneas 9-40 (`handleServiceError`)
- **Descripción:** Los manejadores de errores a nivel controlador capturan excepciones no esperadas y devuelven `error?.message` directamente en el JSON de respuesta HTTP 500, **bypassando** el `errorHandler.ts` global que redacta mensajes en producción. Esto expone detalles internos (mensajes de TypeORM, estructura de DB, nombres de columnas) al cliente.
- **Recomendación:** Para status >= 500, devolver siempre `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` y loguear el error real con `logger.error`. Nunca incluir `error.message` ni `error.stack` en la respuesta HTTP.

#### 2.2 `payment.routes.ts` — Endpoint de estado de pago sin autenticación
- **Archivo:** `Backend/src/payment/payment.routes.ts`, línea 73
- **Descripción:** `GET /api/payment/status` es público (sin `checkAuthToken`). Cualquiera que conozca o adivine un `external_reference` puede consultar si un pago fue aprobado, falló o está pendiente.
- **Recomendación:** Agregar `checkAuthToken` y verificar que el `userId` codificado dentro del `external_reference` coincida con `req.user.id`.

#### 2.3 `user.routes.ts` — Logout sin autenticación (CSRF de sesión)
- **Archivo:** `Backend/src/user/user.routes.ts`, línea 27
- **Descripción:** `POST /api/user/logout` no requiere `checkAuthToken`. Un atacante puede forzar el cierre de sesión de una víctima mediante CSRF desde un origen permitido, borrando la cookie httpOnly de refresh token.
- **Recomendación:** Agregar `checkAuthToken` a la ruta `/logout` para que solo usuarios autenticados puedan revocar su propia cookie.

#### 2.4 `app.ts` — Helmet CSP debilitado con `unsafe-inline` / `unsafe-eval`
- **Archivo:** `Backend/src/app.ts`, líneas 53-63
- **Descripción:** La política CSP permite `'unsafe-inline'` y `'unsafe-eval'` en `scriptSrc`. Aunque es una API JSON, si algún endpoint sirve HTML (Swagger en dev) o si existe alguna inyección, esta configuración facilita la ejecución de scripts.
- **Recomendación:** Dado que el backend es API pura, eliminar la configuración personalizada de `contentSecurityPolicy` dejando el default de Helmet (`defaultSrc: 'none'`) o quitar `unsafe-inline`/`unsafe-eval`.

#### 2.5 `checkRole.ts` — Roles "stale" del JWT sin refresco de DB
- **Archivo:** `Backend/src/common/middleware/checkRole.ts`, líneas 30-62 (`checkRoleAuth`)
- **Descripción:** Los middlewares de rol usan `req.user.roles` incrustados en el JWT sin revalidar contra la base de datos. Si se revocan roles (ej: un admin es degradado a organizer), el token vigente (15 min de expiry) sigue otorgando los permisos antiguos.
- **Recomendación:** Para operaciones de alto impacto (admin, reembolsos, eliminación de eventos), refrescar roles desde la DB. Alternativamente, reducir el `JWT_ACCESS_EXPIRES_IN` a 5 minutos y forzar refresh frecuente.

#### 2.6 `event.service.ts` — Cálculo incorrecto de fechas en estadísticas
- **Archivo:** `Backend/src/event/event.service.ts`, líneas 470-498, función `periodToDates`
- **Descripción:** Usa `new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())`. Para fechas como 31 de marzo, esto genera 3 de marzo en lugar de 28 de febrero, corrompiendo los períodos de estadísticas.
- **Recomendación:** Reutilizar la función `safeAddMonths` ya implementada en `subscription.service.ts` o usar `date-fns/subMonths`.

#### 2.7 `preference.service.ts` — N+1 queries con bloqueo pesimista
- **Archivo:** `Backend/src/payment/preference.service.ts`, líneas 741-754 y 775-788 (`preparePreference`)
- **Descripción:** Dentro de una transacción con `pessimistic_write`, los `ticketType` y `eventProduct` se consultan uno por uno en un loop (`for...of` con `findOne` / `findOneBy`). Esto aumenta la latencia y el tiempo de retención de locks, reduciendo throughput y aumentando riesgo de deadlocks.
- **Recomendación:** Cargar todos los registros necesarios en una sola query con `In(...)` antes del loop, o usar `Promise.all` con cuidado dentro de la transacción.

### Frontend

#### 2.8 Múltiples memory leaks por suscripciones sin cleanup
- **Archivos afectados:**
  - `pages/perfil/perfil.component.ts` (líneas 54, 83, 97, 107, 218: múltiples `.subscribe()` sin `takeUntilDestroyed` ni `unsubscribe`)
  - `pages/event-config/event-config.component.ts` (líneas 82, 100, 127, 142, 157, 201, 224, 232, 271, 284, 295)
  - `pages/registrar-evento/registrar-evento.component.ts` (líneas 84, 90, 102, 115, 170, 233, 274, 286, 388, 410)
  - `pages/checkout/checkout.component.ts` (línea 376: `ticketService.comprarTicket(...).subscribe()` sin cleanup)
  - `pages/register/register.component.ts` (línea 61: `registrarse().subscribe()` sin cleanup)
  - `pages/login/login.component.ts` (líneas 269, 295: subscribe de login sin cleanup)
  - `pages/prefil-edit/prefil-edit.component.ts` (línea 54: `ensureCurrentUser().subscribe()`)
  - `pages/settings/settings.component.ts` (múltiples subscribe)
- **Descripción:** En Angular, las suscripciones a Observables calientes (HTTP, eventos, intervals) que no se limpian causan memory leaks. Solo unos pocos componentes usan `takeUntilDestroyed` correctamente.
- **Recomendación:** Inyectar `DestroyRef` y aplicar `.pipe(takeUntilDestroyed(this.destroyRef))` a todas las suscripciones en componentes standalone, o usar el patrón `private subscriptions = new Subscription()` con `add()` y `unsubscribe()` en `ngOnDestroy`.

#### 2.9 `success.component.ts` — Polling sin cancelación de requests anteriores
- **Archivo:** `Frontend/src/app/pages/checkout/success.component.ts`, líneas 90-116, función `pollOnce`
- **Descripción:** En cada iteración del polling llama a `this.tickets.getLastPurchase().subscribe()`. Si la respuesta tarda más de 2 segundos (el delay del poll), se acumulan requests HTTP simultáneos porque no cancela la suscripción anterior.
- **Recomendación:** Guardar la suscripción del polling en una propiedad y hacer `.unsubscribe()` antes de iniciar el siguiente poll, o usar `switchMap` con un `timer` controlado.

#### 2.10 `checkout.component.ts` — Cálculo de montos de pago en frontend (vulnerable a manipulación)
- **Archivo:** `Frontend/src/app/pages/checkout/checkout.component.ts`, líneas 265-288, función `calculateTotal`
- **Descripción:** El componente calcula descuentos, service fees y totales finales en el cliente (`discountAmount`, `serviceFeeAmount`, `totalToPay`). Aunque MercadoPago luego valida, esto permite que un usuario modifique el precio final mostrado y potencialmente envíe datos inconsistentes al backend.
- **Recomendación:** El backend debe ser la única fuente de verdad para el monto final. Enviar solo `ticketTypeId` y `quantity` al crear la preferencia, y mostrar al usuario los montos devueltos por el backend en la respuesta de `create-preference`.

#### 2.11 `checkout.component.ts` — Timer sin protección contra múltiples inicios
- **Archivo:** `Frontend/src/app/pages/checkout/checkout.component.ts`, líneas 237-249, función `startTimer`
- **Descripción:** `startTimer()` crea un `interval(1000)` sin verificar si ya existe uno activo. Si `ngOnInit` se ejecuta múltiples veces (reactivación de ruta), se acumulan timers.
- **Recomendación:** Agregar una guarda `if (this.timerSubscription) return;` o `this.timerSubscription?.unsubscribe()` antes de crear el interval.

#### 2.12 `checkout.component.ts` — Guarda de datos de compra en `localStorage`
- **Archivo:** `Frontend/src/app/pages/checkout/checkout.component.ts`, líneas 393-407
- **Descripción:** Se persiste `lastPurchase` en `localStorage` con datos como `deliveryEmail`, `guestCheckout`, `eventId`, `external_reference`. Estos datos permanecen incluso después de cerrar sesión, exponiendo información de compras en un storage compartido.
- **Recomendación:** Usar `sessionStorage` (se borra al cerrar pestaña) en lugar de `localStorage`, y limpiar inmediatamente después de leerlo en `success.component.ts`.

#### 2.13 `error.interceptor.ts` — Variable global mutable compartida
- **Archivo:** `Frontend/src/app/interceptors/error.interceptor.ts`, línea 10 (`let isNavigatingToLogin = false`)
- **Descripción:** La variable está declarada fuera de la función del interceptor, compartida entre todas las instancias/requests. En navegadores modernos esto es un singleton de módulo, pero puede causar race conditions si dos requests 401 ocurren simultáneamente.
- **Recomendación:** Mover la lógica de deduplicación de navegación a un servicio con estado reactivo (`BehaviorSubject`) o usar `window.location.assign` con un timestamp único.

#### 2.14 `auth.service.ts` — Side-effect en constructor al importar
- **Archivo:** `Frontend/src/app/services/auth.service.ts`, líneas 55-59
- **Descripción:** El constructor llama `this.ensureCurrentUser().subscribe({ error: () => {} })` sin posibilidad de cancelación. Esto causa efectos secundarios incluso cuando el servicio se instancia en tests unitarios o durante SSR.
- **Recomendación:** Eliminar el side-effect del constructor. Mover la restauración de sesión a un `APP_INITIALIZER` o a un guarda de ruta.

#### 2.15 `detalle-evento.component.ts` — Validación de edad mínima insuficiente
- **Archivo:** `Frontend/src/app/pages/detalle-evento/detalle-evento.component.ts`, líneas 304-313 (`calculateAge`) y 342-348 (`reservarEntrada`)
- **Descripción:** El cálculo de edad se hace en frontend con `new Date(profile.birth)`. Un usuario puede modificar su fecha de nacimiento en su perfil o interceptar la request. Además, `profile.birth` puede ser string con formato ambiguo.
- **Recomendación:** La validación de edad mínima debe ser exclusiva del backend al momento de crear la preferencia de pago. En frontend, mostrar un aviso pero no bloquear basándose solo en datos client-side.

#### 2.16 `organizer.guard.ts` — Lógica de autorización duplicada y manipulable
- **Archivo:** `Frontend/src/app/guards/organizer.guard.ts`, líneas 21-33
- **Descripción:** El guard mezcla lógica de `roles` (array) y `rol` (legacy string) en el cliente. Esta lógica debería ser responsabilidad exclusiva del backend. Si un usuario manipula su JWT local para agregar `"admin"` al array `roles`, el guard lo acepta (aunque el backend lo rechazaría).
- **Recomendación:** Simplificar los guards para que lean directamente `user.rol` o `user.roles` sin lógica de merge, confiando en que el backend siempre devuelve los roles correctos y actualizados.

#### 2.17 `login.component.ts` — Google OAuth sin validación de state/nonce
- **Archivo:** `Frontend/src/app/pages/login/login.component.ts`, líneas 72-109 (`handleGoogleRedirectCallback`)
- **Descripción:** El callback de redirect lee `credential` del hash/query de la URL y lo consume directamente sin validar que el `state` coincida con el enviado. Esto abre la puerta a CSRF en el flujo de redirect, aunque el impacto está mitigado por la naturaleza del JWT de Google.
- **Recomendación:** Implementar `state` en `sessionStorage` antes del redirect y validarlo estrictamente al regresar, descartando cualquier credential cuyo `state` no coincida.

#### 2.18 `scanner.component.ts` — Cooldown timer no limpiado en destrucción
- **Archivo:** `Frontend/src/app/pages/scanner/scanner.component.ts`, línea 121 (`setTimeout`)
- **Descripción:** El timer de cooldown persiste si el usuario sale del componente antes de que terminen los 3 segundos.
- **Recomendación:** Implementar `ngOnDestroy` y hacer `clearTimeout(this.cooldownTimer)`.

#### 2.19 `event-config.component.ts` — Escape de datos insuficiente en emails de invitación
- **Archivo:** `Frontend/src/app/pages/event-config/event-config.component.ts`, líneas 188-191 (`sendInvitations`)
- **Descripción:** Parsea emails con `split(/[,;\n]+/)` pero no valida formato de email antes de enviar al backend. No hay límite de cantidad de emails, permitiendo DoS accidental.
- **Recomendación:** Agregar validación de formato de email con expresión regular y limitar la cantidad de emails a un máximo razonable (ej: 50).

### Base de Datos & Sinergia

#### 2.20 Migraciones con valores hardcodeados y sin backup
- **Archivos:**
  - `Backend/src/database/migrations/20260521150000-fix-pro-plan-extras.ts`
  - `Backend/src/database/migrations/20260508193000-add-buyer-service-fee-pricing.ts`
- **Descripción:** Ambas migraciones ejecutan `UPDATE` basado en hardcoded `name = 'FREE'` y `name = 'PRO'`. Si se renombra un plan o se agrega uno intermedio, la migración afectará datos incorrectos. No crean tablas de backup previas.
- **Recomendación:** Para migraciones de datos, usar IDs numéricos o crear tablas de backup temporales (`subscription_plan_backup_20260521`) dentro del mismo script antes de modificar.

#### 2.21 Migración `add-payment-log-items` pierde datos irreversiblemente en el `down`
- **Archivo:** `Backend/src/database/migrations/20260521120000-add-payment-log-items.ts`
- **Descripción:** El `up` migra datos legacy de `unitPrice + quantity` a JSONB. El `down` elimina la columna `items` y restaura `ticketTypeId`, pero no puede reconstruir los datos originales de vuelta desde el array JSONB.
- **Recomendación:** En el `up`, guardar una copia de la tabla completa (`CREATE TABLE payment_log_backup_20260521 AS SELECT * FROM payment_log`) antes de mutar columnas.

#### 2.22 Inconsistencia masiva de naming entre `snake_case` y `camelCase`
- **Archivos:** Múltiples entidades (`event.entity.ts`, `ticket.entity.ts`, `extraItem.entity.ts`, etc.)
- **Descripción:** `Event.user_id` (snake_case) convive con `Event.categoryId` (camelCase). `Ticket.codigo_unico` y `ExtraItem.codigo_unico` usan snake_case mientras que `qrCode` usa camelCase. Esto genera fricción en queries raw, migraciones y mapeos entre capas.
- **Recomendación:** Estandarizar todas las columnas a camelCase. Para columnas legacy ya en producción, crear una migración de renombre progresiva o al menos documentar el mapa de nombres.

#### 2.23 Duplicación de lógica de jerarquía de roles en frontend y backend
- **Archivo:** `Frontend/src/app/interfaces/Usuario.ts` vs `Backend/src/schemas/schema.user.ts`
- **Descripción:** Ambos archivos definen idénticamente `ROLE_HIERARCHY`, `getHighestRole` y `hasRoleLevel`. Cualquier cambio en la jerarquía (ej. agregar "moderator") exige modificar dos archivos, con alto riesgo de desfase.
- **Recomendación:** Eliminar la lógica del frontend y que el backend exponga un endpoint `/config/roles` o que la respuesta de login incluya `highestRole` y `permissions` ya calculados.

#### 2.24 `UsuarioEdit.ts` no permite actualizar email aunque el backend sí lo acepta
- **Archivo:** `Frontend/src/app/interfaces/UsuarioEdit.ts` vs `Backend/src/schemas/schema.user.ts` (`updateUserSchema`)
- **Descripción:** `UsuarioEdit` carece del campo `email`, pero `updateUserSchema` permite `email: z.string().email().optional()`. Esto significa que un formulario de edición de perfil tipado con `UsuarioEdit` nunca podría enviar un cambio de email, aunque la API lo soporta.
- **Recomendación:** Agregar `email?: string` a `UsuarioEdit` si se desea exponer la funcionalidad, o remover `email` del `updateUserSchema` si no es editable desde el frontend.

#### 2.25 `ScannerService.validateTicket` sin tipado de respuesta
- **Archivo:** `Frontend/src/app/services/scanner.service.ts`
- **Descripción:** El método devuelve `Observable<any>`, pero el backend responde con una estructura definida (`{ valid: boolean; ticket?: {...}; message?; usedAt? }`). La falta de interfaz expone el frontend a errores de acceso en los componentes.
- **Recomendación:** Crear `TicketValidationResult` con los campos exactos que devuelve `ticket.controller.ts` (`validateTicket`) y tipar el observable.

#### 2.26 `EventService` muta objetos recibidos del backend
- **Archivo:** `Frontend/src/app/services/event.service.ts` (métodos `obtenerEventosUsuario` y `searchEventsByName`)
- **Descripción:** Al recibir eventos, el servicio muta directamente cada objeto para derivar `categoria_name` desde `category.name`. Esto es un side-effect en datos que deberían ser inmutables.
- **Recomendación:** Usar `map()` para crear nuevos objetos en lugar de mutar los recibidos, o centralizar esta normalización en un pipe/mapper dedicado.

#### 2.27 Discrepancia de `required`/`optional` entre schema Zod e interfaces frontend (Registro)
- **Archivo:** `Backend/src/schemas/schema.user.ts` (`signupUserSchema`) vs `Frontend/src/app/interfaces/Usuario.ts`
- **Descripción:** El schema requiere `address`, `pais`, `provincia`, `ciudad` y `birth`. La interfaz `Usuario` tiene `location?: string` (legacy), `pais?: string`, `provincia?: string`, `ciudad?: string`, `address?: string`. Si el formulario de registro usa `Usuario` como tipo, TypeScript no forzará que `pais` y `address` estén presentes, aunque Zod sí lo exija.
- **Recomendación:** Alinear la interfaz `Usuario` para registro con el schema: campos requeridos deben ser obligatorios en la interfaz, o el schema debe aceptar opcionalidad si el negocio lo permite.

---

## 3. Mejoras Sugeridas 🟢

### Backend

#### 3.1 Faltan índices para búsquedas frecuentes de escáner
- **Archivo:** `Backend/src/ticket/ticket.entity.ts`, `Backend/src/extra/extraItem.entity.ts`
- **Descripción:** Aunque `codigo_unico` es `unique` (índice implícito), no hay índice compuesto que cubra la búsqueda típica del escáner: filtrar por `codigo_unico + status + deletedAt IS NULL`. Actualmente la validación de ticket busca solo por `codigo_unico` y luego aplica lógica en memoria.
- **Recomendación:** Agregar `@Index('idx_ticket_code_status', ['codigo_unico', 'status'])` en `Ticket` y similar en `ExtraItem`.

#### 3.2 `Event.description` limitado a `varchar(500)`
- **Archivo:** `Backend/src/event/event.entity.ts`, línea 64
- **Descripción:** Para descripciones largas de eventos, `varchar(500)` puede ser insuficiente sin truncado controlado.
- **Recomendación:** Cambiar a `@Column({ type: 'text', nullable: true })`.

#### 3.3 Falta de `@DeleteDateColumn` en `EventProduct`
- **Archivo:** `Backend/src/extra/eventProduct.entity.ts`
- **Descripción:** No existe soft delete para extras asignados a eventos. Solo se desactivan con `isActive = false`. Si se requiere auditoría de eliminación, no hay registro.
- **Recomendación:** Evaluar si agregar `@DeleteDateColumn` es necesario para el dominio.

#### 3.4 `BillingCycle` inline sin enum TypeScript
- **Archivo:** `Backend/src/subscription/user_subscription.entity.ts`, líneas 68-73
- **Descripción:** El campo `billingCycle` usa `enum: ['monthly', 'yearly']` inline en el decorador, sin un enum TypeScript exportado como `SubscriptionStatus`. Esto dificulta el tipado en servicios y controllers.
- **Recomendación:** Crear `export enum BillingCycle { MONTHLY = 'monthly', YEARLY = 'yearly' }` y referenciarlo en el decorador y en el tipo de la propiedad.

#### 3.5 Uso de `any` en respuestas de controllers
- **Archivos:** `Backend/src/event/event.controller.ts` (`response: any`), `Backend/src/ticket/ticket.controller.ts` (`result: any` en mapeos)
- **Descripción:** El backend usa `any` extensivamente para construir respuestas JSON, perdiendo type safety y facilitando errores de campo (typos en nombres de propiedades).
- **Recomendación:** Crear interfaces/DTOs de respuesta (ej. `EventResponse`, `TicketListResponse`) y usarlas en lugar de `any`.

### Frontend

#### 3.6 Ausencia de `ChangeDetectionStrategy.OnPush` en la mayoría de componentes
- **Archivos afectados:** Casi todos excepto `admin-panel.component.ts` y `creator-stats.component.ts`
- **Descripción:** Solo 2 componentes usan `OnPush`. El resto (checkout, tickets, detalle-evento, login, perfil, etc.) usan detección default, causando renders innecesarios en cada evento de aplicación.
- **Recomendación:** Migrar progresivamente a `OnPush`, empezando por los componentes de lista más pesados (`explorador-eventos`, `mis-eventos`, `tickets`).

#### 3.7 Countdown con `interval(1000)` sin `OnPush`
- **Archivo:** `Frontend/src/app/pages/detalle-evento/detalle-evento.component.ts`, líneas 94-110
- **Descripción:** El interval de countdown dispara change detection cada segundo en todo el componente y sus hijos.
- **Recomendación:** Convertir a un `Observable` expuesto en el template con `| async` o usar un pipe puro, combinado con `OnPush`.

#### 3.8 Imágenes sin lazy loading
- **Archivos afectados:** `explorador-eventos.component.html`, `mis-eventos.component.html`, `detalle-evento.component.html`, `checkout.component.html`, `perfil.component.html`, `landing.component.html`
- **Descripción:** Solo 3 imágenes en todo el proyecto usan `loading="lazy"`. Las listas de eventos cargan todas las imágenes en el momento del render inicial.
- **Recomendación:** Agregar `loading="lazy"` a todas las imágenes de listas y grids. Para imágenes críticas (hero, checkout), usar `priority` o `loading="eager"`.

#### 3.9 Uso excesivo de tipo `any`
- **Archivos afectados:** ~123 matches en todo el proyecto
- **Descripción:** `any` anula el sistema de tipos de TypeScript. Especialmente crítico en: `ticket.service.ts` (línea 30 `const body: any`), `event-stats.component.ts` (todas las opciones de chart), `tickets.component.ts` (`tickets: any[]`, `extras: any[]`), `auth.service.ts` (`currentUserValue: any`), `detalle-evento.component.ts` (`evento: any`, `user: any`).
- **Recomendación:** Crear interfaces específicas para `Ticket`, `ExtraItem`, `TicketDisplayData`, `ScanResult`, etc. Eliminar `any` de las propiedades públicas de componentes.

#### 3.10 Caché de eventos sin invalidación por tiempo
- **Archivo:** `Frontend/src/app/services/event.service.ts`, líneas 80-98
- **Descripción:** `eventsCache` es un `Map<string, Observable<Evento[]>>` que nunca expira. Si el usuario deja la app abierta horas, verá datos obsoletos.
- **Recomendación:** Agregar TTL (time-to-live) al caché, o usar `shareReplay({ refCount: true, windowTime: 60000 })` para que el observable subyacente se complete tras inactividad.

#### 3.11 Carga de eventos sin paginación real en explorador
- **Archivo:** `Frontend/src/app/pages/explorador-eventos/explorador-eventos.component.ts`, línea 51 (`obtenerEventos(200)`)
- **Descripción:** Solicita hasta 200 eventos de una sola vez al backend y pagina en memoria. Esto no escala.
- **Recomendación:** Implementar paginación real con `limit`/`offset` o cursor-based en el backend, y usar infinite scroll o paginación clásica con requests parciales.

#### 3.12 Lógica de MercadoPago duplicada en 4 componentes
- **Archivos:** `perfil.component.ts`, `settings.component.ts`, `registrar-evento.component.ts`, `subscription-landing.component.ts`
- **Descripción:** Los métodos `connectMercadoPago()`, `disconnectMercadoPago()`, `checkMpStatus()` y sus estados (`mpLoading`, `mpStatus`) están copiados casi idénticamente en 4 componentes.
- **Recomendación:** Extraer a un `MpConnectionStore` (signal store) o a un servicio reactivo compartido que centralice el estado de conexión.

#### 3.13 Interface `Usuario` expone `password`
- **Archivo:** `Frontend/src/app/interfaces/Usuario.ts`, línea 6
- **Descripción:** La interface usada en frontend incluye `password: string`, aunque el backend nunca debería devolverla.
- **Recomendación:** Dividir en `Usuario` (sin password) y `UsuarioRegistro` (con password opcional).

#### 3.14 Inconsistencia en property binding de estilos
- **Archivo:** `Frontend/src/app/pages/checkout/checkout.component.html`, líneas 230-238
- **Descripción:** Los montos se interpolan directamente (`${{ totalToPay }}`) sin pipe de moneda, perdiendo formato consistente.
- **Recomendación:** Usar el `CurrencyFormatterPipe` existente (`| currency`) en todos los montos del checkout.

#### 3.15 Accesibilidad: inputs sin `autocomplete`
- **Archivos:** `login.component.html`, `register.component.html`, `checkout.component.html`
- **Descripción:** Los formularios de login/register/checkout no especifican atributos `autocomplete` (ej: `email`, `current-password`, `new-password`, `tel`).
- **Recomendación:** Agregar `autocomplete` en todos los inputs para mejorar UX y accesibilidad.

#### 3.16 Accesibilidad: botones icono sin `aria-label`
- **Archivos:** `explorador-eventos.component.html`, `mis-eventos.component.html`, `detalle-evento.component.html`
- **Descripción:** Varios botones que contienen solo SVGs carecen de `aria-label`.
- **Recomendación:** Agregar `aria-label` descriptivo a todos los botones icono.

#### 3.17 Botón "¿Olvidaste tu contraseña?" sin funcionalidad
- **Archivo:** `Frontend/src/app/pages/login/login.component.html`, línea 42 (`<a href="#">`)
- **Descripción:** Es un enlace a `#` que no hace nada, generando confusión de UX.
- **Recomendación:** Eliminar el enlace o implementar el flujo de recuperación de contraseña.

#### 3.18 `ngOnInit` en `tickets.component` accede a `window` sin plataforma
- **Archivo:** `Frontend/src/app/pages/tickets/tickets.component.ts`, líneas 66-84
- **Descripción:** El `if (typeof window !== 'undefined')` está bien, pero el `else` deja `loading = true` para siempre en SSR.
- **Recomendación:** Usar `isPlatformBrowser(this.platformId)` inyectado desde `@angular/core`, y setear `loading = false` en SSR.

### Sinergia

#### 3.19 Código duplicado/muerto en `PaymentService`
- **Archivo:** `Frontend/src/app/services/payment.service.ts`
- **Descripción:** `createPreference` está desactualizado y no es usado por el flujo actual de compra (que usa `TicketService.comprarTicket`). Mantenerlo genera confusión y riesgo de uso accidental.
- **Recomendación:** Eliminar `createPreference` de `PaymentService` y que `TicketService` sea el único punto de entrada para preferencias, o refactorizar `TicketService` para delegar en `PaymentService` con la firma correcta.

#### 3.20 Lógica de negocio de suscripciones duplicada en frontend
- **Archivo:** `Frontend/src/app/services/subscription.service.ts`
- **Descripción:** Métodos `canCreateEvent`, `canCreateTicketTypes`, `isPro` replican reglas del backend (`subscription.service.ts`). El frontend las usa para mostrar/ocultar botones, pero el backend es la única fuente de verdad.
- **Recomendación:** Que el frontend use exclusivamente los datos de `/subscription/my-limits` para la UI, sin replicar la lógica de cálculo.

#### 3.21 `TicketType` definido inline en `event.ts`
- **Archivo:** `Frontend/src/app/interfaces/event.ts`
- **Descripción:** La interfaz `TicketType` está definida dentro de `event.ts`, violando la convención del proyecto de un archivo por interfaz.
- **Recomendación:** Extraer `TicketType` a `Frontend/src/app/interfaces/ticket-type.ts`.

#### 3.22 Normalización de imagen y título en frontend
- **Archivo:** `Frontend/src/app/services/event.service.ts` (`normalizeEvent`, `normalizeTitle`, `normalizeImageUrl`)
- **Descripción:** El frontend limpia prefijos `[LOAD]` y reemplaza imágenes vacías por un placeholder. Esta lógica de sanitización podría residir en el backend para garantizar consistencia entre cliente web, futura app móvil o API pública.
- **Recomendación:** Mover `normalizeTitle` y `normalizeImageUrl` a un helper del backend que se aplique antes de persistir o al serializar la respuesta.

#### 3.23 Login en dos requests secuenciales innecesarios
- **Archivo:** `Frontend/src/app/services/auth.service.ts`
- **Descripción:** `AuthService.login` dispara `login` + `getProfile` secuenciales para obtener el token y el perfil.
- **Recomendación:** Optimizar si el endpoint de login devolviera directamente el perfil mínimo requerido (`id`, `name`, `email`, `roles`).

---

## 4. Resumen de Sinergia entre Capas

### Contratos API
El backend tiene **schemas Zod sólidos para validación de entrada**, pero **carece de DTOs formales para las respuestas**. Los controllers construyen objetos JSON ad-hoc con `any`, lo cual dificulta que el frontend confíe en tipos estables. El frontend intenta compensar esto con interfaces locales (`Evento`, `Usuario`, `Ticket`), pero hay **desfases graves**:
- `Ticket` del frontend es prácticamente inútil (solo `quantity`), mientras que el backend devuelve estructuras complejas.
- `PaymentService.createPreference` tiene un contrato de firma obsoleto respecto al endpoint real.
- `CategoryService.cargarCategoria` tiene un contrato de tipos roto (envía `string` en vez de objeto).

### Coincidencia de Modelos
Las entidades del backend y las interfaces del frontend coinciden **parcialmente** en `Event` (bien, aunque con mutaciones en el servicio), `Product`, `EventProduct`, `ExtraItem` y `Coupon`. La mayor fricción está en:
- **Usuario/Roles:** El backend maneja `Role[]` (objetos relacionados), pero la API expone `string[]`. El frontend espera `string[]`. Funciona, pero requiere transformación implícita que debe mantenerse sincronizada.
- **Fechas:** El backend usa `Date` (TypeORM) y recibe/envía ISO strings vía JSON. El frontend usa `string` para fechas (`birth`, `createdAt`). Esto es aceptable para HTTP/JSON, pero debería documentarse explícitamente.

### Eficiencia de Consumo de API
El frontend es razonablemente eficiente:
- Usa `shareReplay` y `Map` para cachear listados de eventos.
- `SubscriptionService` cachea planes y suscripción con TTL.
- No se detectan llamadas N+1 explícitas desde el frontend.
Sin embargo, `AuthService.login` dispara dos requests secuenciales (`login` + `getProfile`) para obtener el token y el perfil. Esto es necesario por el diseño actual, pero podría optimizarse si el endpoint de login devolviera directamente el perfil mínimo requerido.

### Ubicación de la Lógica de Negocio
- **Seguridad/Roles:** El backend verifica roles en middleware (`checkRoleAuth`, `checkExactRole`), lo cual es correcto. El frontend duplica la jerarquía de roles (`ROLE_HIERARCHY`) para renderizado condicional de UI. Esto es común pero introduce riesgo de desfase.
- **Límites de Planes:** El backend es la única fuente de verdad (`canCreateEvent`, `canCreateTicketTypes`). El frontend replica estos cálculos para UX (deshabilitar botones). Aunque no es un bypass de seguridad, es deuda técnica.
- **Cálculo de Precios:** El cálculo de comisiones, service fees y totales reside casi enteramente en el backend (`preference.service.ts`, `payment.core.ts`). El frontend solo consume los montos finales. Esto es correcto y seguro.

### Estado General
La arquitectura tiene buena separación de responsabilidades, pero **la capa de tipos/interface es el punto más débil de la sinergia**. El frontend asume estructuras que el backend no garantiza tipísticamente (por el uso de `any` en respuestas), y hay servicios frontend desactualizados (`PaymentService`) o rotos (`CategoryService.cargarCategoria`) que no reflejan el estado actual de la API.

Una inversión en **DTOs de respuesta compartidos** (o al menos interfaces frontend alineadas con los selects del backend) mejoraría drásticamente la robustez del stack.

Además, el hallazgo más grave de sinergia es que el `refund.service.ts` no respeta el orden de operaciones documentado en el hardening (`AGENTS.md`), generando riesgo de inconsistencia entre el estado de MercadoPago y el estado local de la base de datos.

---

*Fin del reporte de auditoría.*
