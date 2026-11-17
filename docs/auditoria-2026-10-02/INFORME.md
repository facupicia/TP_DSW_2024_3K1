# Auditoría de EventLife — 2 de octubre de 2026

> Informe histórico del estado previo a las correcciones. Ver [remediación y pruebas vigentes](REMediacion.md). Las reproducciones de esta carpeta no deben utilizarse como la suite actual.

## Dictamen

El proyecto compila y tiene una base funcional bien dividida por dominios. El principal problema es la consistencia de los flujos de dinero, stock y sesiones frente a errores y concurrencia. Actualizar versiones por sí solo no resuelve estos defectos.

Se registran **24 hallazgos: 14 P1 y 10 P2**. P1 significa corregir antes de confiar nuevos flujos de venta a producción; P2 significa corregir en la siguiente etapa. No se atribuye una vulnerabilidad explotable a cada alerta de npm ni se confirma un incidente en producción.

## Alcance y evidencia

- Revisión de código de autenticación, usuarios, reclamo de cuentas, pagos, preferencias, reembolsos, stock, QR, colas, configuración, migraciones, rutas y componentes representativos del frontend.
- Rama `main`, incluyendo el estado local actual. Ya existían modificaciones en `AGENTS.md`, `Backend/src/config/env.ts` y `Backend/src/seed-volume.ts`; no se cambiaron.
- `Backend`: `npx tsc --noEmit` **pasó**.
- `Frontend`: `npm run build` **pasó**. Bundle inicial: 614,58 kB sin comprimir y 154,21 kB de transferencia estimada; gráficos y scanner se cargan de manera diferida. Se prerenderizaron tres rutas.
- Karma ejecutó los cuatro tests existentes: **4 fallidos, 0 exitosos**, por `NG0201: No provider found for InjectionToken ToastConfig`. La sesión de pruebas se detuvo después del resultado. El comando npm solicitado con flags terminó lanzando Chrome normal y dejando watch activo; no se presenta como una validación headless exitosa.
- Se ejecutaron `npm audit --json` y `npm audit --omit=dev --json` en ambos proyectos. Los resultados completos están adjuntos en esta carpeta.
- `node docs/auditoria-2026-10-02/reproducciones.cjs` confirmó seis defectos mediante funciones reales transpileadas en aislamiento, con DB, Redis y API externas simuladas. No son pruebas de integración contra PostgreSQL ni MercadoPago.
- El detector frontend de Impeccable se ejecutó sobre login, checkout, header y estilos. Operó en modo degradado por falta de parsers; no evaluó contraste computado. Su alerta de imagen sin `src` en el header es un falso positivo: Angular utiliza `[src]`. Los bordes de toasts no se consideran bugs por una preferencia estética del detector.
- No se arrancó el backend contra la DB configurada, ni se ejecutaron seeds, migraciones o pagos. No se auditó el entorno desplegado, la configuración de las cuentas externas ni el historial completo de secretos. La UI se revisó en código, sin validación visual ni auditoría WCAG completa.

## Hallazgos prioritarios

### 01 — P1 — Una compra fallida confirma descuentos parciales de stock

**Ubicación:** `Backend/src/payment/payment.core.ts:841–867`.

El procesamiento incrementa `soldCount` de cada ítem secuencialmente. Si un ítem posterior no tiene stock, marca el pago FAILED y ejecuta `commitTransaction()`. Quedan confirmados los incrementos anteriores sin generar entradas. También ocurre cuando fallan los extras después de actualizar entradas.

**Evidencia:** la reproducción con dos tipos de entrada devuelve error y conserva `soldCount +1` del primero, con un commit y cero tickets.

**Corrección:** revertir todas las modificaciones de inventario; registrar el fallo en otra transacción o usar un savepoint. Agregar integración con PostgreSQL para un carrito parcialmente agotado. El comprador ya pagó: el fallo necesita una devolución o conciliación persistente.

### 02 — P1 — Fallos transitorios de pagos se confirman como recibidos

**Ubicación:** `Backend/src/payment/payment.core.ts:139–196,1063` y `Backend/src/payment/payment.controller.ts:365–415`.

Las consultas a MP convierten errores en `null`, y el core convierte errores de procesamiento en `{success:false,error:message}`. El controller responde 200 a esos resultados. Su clasificación transitoria en el catch no recibe muchos de esos errores ni sus códigos. Un timeout de DB dentro de la transacción o una caída de MP puede impedir la emisión y suprimir el reintento de ese webhook.

**Evidencia:** ECONNRESET dentro del core se transforma en resultado fallido sin código transitorio. La respuesta 200 se verifica por lectura del controller.

**Corrección:** resultados tipados de negocio versus infraestructura; propagar códigos y devolver 5xx para errores reintentables, o confirmar solamente tras persistir un trabajo de procesamiento. Incluir una reconciliación periódica de pagos aprobados sin entradas.

### 03 — P1 — Reembolsos pueden cancelar compras ajenas al pago

**Ubicación:** `Backend/src/payment/refund.service.ts:135–175`.

Cuando no encuentra entradas o extras ACTIVE vinculados a `paymentLogId`, busca por usuario y ventana de cinco minutos sin restringir evento o ítems. Si tampoco encuentra, toma los últimos tickets del usuario y **todos sus extras activos**, sin ventana. Puede cancelar productos de otro pago y otro organizador. El fallback puede activarse incluso en un pago moderno cuyas entradas ya fueron utilizadas, porque las búsquedas iniciales filtran ACTIVE.

**Corrección:** exigir vínculo exacto al pago; migrar los registros legacy con correspondencia verificable. Si no existe evidencia suficiente, detener el reembolso automático y derivar a conciliación. Nunca adivinar qué entradas pertenecen a una operación financiera.

### 04 — P1 — Se informa reembolso exitoso aunque MP lo rechace

**Ubicación:** `Backend/src/payment/refund.service.ts:194–335`.

La DB se confirma como REFUNDED antes de llamar a MP. Si falla la red o MP rechaza, se devuelve `success:true` con warning y el estado local continúa definitivo. Un nuevo intento se bloquea por “already refunded”, sin mecanismo persistente de recuperación. Las entradas quedan canceladas aunque el cliente conserve el cargo.

**Corrección:** preservar el orden local primero establecido en AGENTS.md, agregando una intención durable y estados pendientes/confirmados/fallidos de devolución, con reintentos y conciliación. Persistir la clave de idempotencia; separar cancelación de entradas de confirmación monetaria. Cuando se proporciona `amount`, revisar además la diferencia entre `totalAmount` y `buyerTotalAmount`: la validación local usa el importe base y puede tratar como total una devolución que excluye el cargo de servicio.

### 05 — P1 — Reembolsos concurrentes restauran stock dos veces

**Ubicación:** `Backend/src/payment/refund.service.ts:63–86,194–258`.

La lectura de estado y entradas ocurre fuera de la transacción; la actualización del pago no exige que siga COMPLETED. Dos solicitudes pueden validar el mismo estado, cancelar las mismas entradas y decrementar `soldCount` dos veces. Cada una genera una clave MP distinta.

**Evidencia:** dos invocaciones concurrentes del servicio con repositorios simulados devuelven éxito, restauran el mismo stock dos veces y hacen dos llamadas MP.

**Corrección:** bloquear el pago dentro de la transacción, realizar transición condicional y cancelar solamente filas que realmente cambien de ACTIVE a CANCELLED; restaurar stock según esas filas. Utilizar una intención de reembolso única por pago.

### 06 — P1 — Se pierde la atribución a promotores

**Ubicación:** `Backend/src/payment/preference.service.ts:694` y `Backend/src/payment/payment.core.ts:353–414`.

La preferencia escribe `metadata.promoter_code`; `extractPaymentInfo()` nunca lo lee. Solo asigna `promoterCode` en el fallback legacy, que no se ejecuta cuando metadata.items está presente. Las compras actuales dejan sin atribución y comisión a RRPP aunque hayan usado su enlace.

**Evidencia:** una metadata de compra válida con `promoter_code: RRPP-DEMO` devuelve `promoterCode: undefined`.

**Corrección:** leer y normalizar el campo del formato actual; comprobar además asignación al evento al calcular comisiones, y agregar una prueba de compra por enlace RRPP.

### 07 — P1 — Rotación de refresh tokens sin exclusión mutua

**Ubicación:** `Backend/src/common/services/sessionTokens.ts:107–157`.

El token se lee antes de comenzar la transacción y se guarda sin lock ni actualización condicional. Dos requests pueden consumir el mismo token y emitir dos sucesores. La detección posterior de reutilización puede además revocar sesiones legítimas por carreras entre pestañas. El interceptor comparte solicitudes solo dentro de su propio contexto de ejecución.

**Evidencia:** dos rotaciones simultáneas con una cookie emiten dos resultados válidos.

**Corrección:** consumir el token atómicamente dentro de la transacción; definir familias de tokens y la política para concurrencia legítima. Validar la carrera con PostgreSQL y dos pestañas.

### 08 — P1 — Tokens de reclamo anteriores permiten cambiar otra vez la contraseña

**Ubicación:** `Backend/src/user/accountClaim.service.ts:49–76` y `Backend/src/user/user.service.ts:318–341`.

Se pueden generar varios tokens; al consumir uno no se invalidan los otros. `findValidAccountClaimToken()` no verifica `isGuestAccount`. Un enlace anterior no usado y todavía vigente continúa válido después de reclamar la cuenta o convertirla mediante Google. `completeAccountClaim()` permite utilizarlo para sobrescribir la contraseña. La lectura y consumo tampoco son atómicos.

**Evidencia:** la función real acepta un token no usado cuyo usuario tiene `isGuestAccount:false`. El cambio de contraseña se verifica leyendo el servicio que consume ese resultado. No se realizó un ataque a una cuenta real.

**Corrección:** reclamar en una transacción con consumo condicional, exigir estado guest, invalidar todos los tokens del usuario al reclamar o convertir mediante Google y revocar sesiones anteriores cuando corresponda.

### 09 — P1 — La confirmación de invitados usa un endpoint privado

**Ubicación:** `Backend/src/payment/payment.routes.ts:74` y `Frontend/src/app/pages/checkout/success.component.ts:116–153`.

El checkout permite compradores anónimos, pero su polling consulta `/payment/status`, protegido por `checkAuthToken`. Para un invitado sin sesión devuelve 401; el frontend continúa hasta agotar intentos y muestra procesamiento aunque el pago esté aprobado.

**Corrección:** entregar una credencial opaca y limitada a la orden para consultar estado sin revelar datos personales, o establecer una sesión guest restringida. No quitar simplemente la autenticación: conservar el aislamiento entre compradores.

### 10 — P2 — Una compra anterior puede confirmar la compra actual

**Ubicación:** `Frontend/src/app/pages/checkout/success.component.ts:90` y `Backend/src/ticket/ticket.service.ts:284–355`.

El usuario autenticado consulta “última compra” en vez del `external_reference` de su checkout. El nuevo PaymentLog se crea cuando llega el webhook. Antes de que llegue, una compra anterior COMPLETED puede producir “pago confirmado” y mostrar entradas antiguas.

**Corrección:** correlacionar todo el polling con una orden persistida al crear la preferencia, incluyendo callbacks y cambios de dispositivo. Mantener el identificador de compra actual separado del historial.

### 11 — P1 — Dependencias con avisos de seguridad pendientes

| Proyecto | Todas: baja / moderada / alta / crítica | Total | Sin dev: baja / moderada / alta / crítica | Total |
|---|---|---:|---|---:|
| Backend | 1 / 9 / 6 / 1 | 17 | 1 / 9 / 6 / 1 | 17 |
| Frontend | 4 / 16 / 27 / 4 | 51 | 1 / 5 / 5 / 0 | 11 |

Estos son paquetes afectados según npm; un mismo advisory puede propagarse a varios paquetes. La categoría de instalación “prod” tampoco prueba que la ruta vulnerable se ejecute al atender requests.

Versiones instaladas relevantes: Express 4.22.1, Multer 2.1.1, BullMQ 4.18.3, TypeORM 0.3.28, Angular core 21.2.11 y CLI 21.2.9.

- **Multer:** prioridad por la ruta de upload autenticada accesible a usuarios regulares. El límite de archivos no elimina los riesgos de campos multipart malformados. [Aviso del mantenedor](https://github.com/expressjs/multer/security/advisories/GHSA-72gw-mp4g-v24j).
- **Angular:** el reporte incluye avisos de sanitización/XSS y otros riesgos. Requieren actualización coordinada; no se demostró explotación sobre las plantillas de EventLife.
- **tar/backend:** alerta crítica transitiva por la cadena de instalación de bcrypt; no se identificó un endpoint que extraiga archivos tar. Priorizar la cadena de build sin describirlo como ejecución remota confirmada en la API.
- **Frontend críticas:** piscina, shell-quote, tar y websocket-driver aparecen en herramientas de desarrollo; no sobreviven como críticas al excluir dev. Evitar publicar el servidor de desarrollo.
- **TypeORM:** el aviso de SQL injection en orderBy especifica MySQL/MariaDB; esta aplicación usa PostgreSQL. No se reporta como SQL injection confirmada de EventLife. Existe además un aviso de generación de migraciones.

**Corrección:** revisar los JSON, actualizar por grupos compatibles y verificar lockfiles, builds y flujos. No ejecutar `npm audit fix --force` sin revisar los cambios mayores sugeridos.

### 12 — P1 — CI y despliegue mantienen Node incompatible y tests sin cobertura

**Ubicación:** `.github/workflows/ci.yml`, `render.yaml`, `Backend/render.yaml`, `Backend/package.json`, `.node-version` y el spec del admin.

Ambos jobs de CI usan Node 18, aunque el frontend utiliza Angular 21 y requiere una versión compatible más reciente. Render fija 18/18.18.0; el backend exige `<19` en engines, pero `.node-version` y la ejecución local usan 22.12.0. Node 18 está EOL según la [tabla oficial de Node.js](https://nodejs.org/en/about/previous-releases). La compatibilidad de Angular debe alinearse con su [tabla oficial](https://angular.dev/reference/versions).

El backend no tiene script `test`: `npm run test --if-present` pasa sin probar nada. No existe la carpeta Backend/tests descrita por AGENTS.md. El frontend tiene un único spec con cuatro pruebas, todas fallidas por falta de ToastConfig en TestBed.

**Corrección:** elegir una LTS soportada y compatible para CI, Render, Netlify, engines y desarrollo; reparar la configuración de pruebas y hacer obligatorio un script de test real. Agregar integración para inventario, idempotencia, permisos y sesiones. Los builds locales exitosos se realizaron con Node 22.12.0, no validan Node 18.

### 13 — P1 — Cola durable, pero con una ventana de pérdida de emails

**Ubicación:** `Backend/src/payment/payment.core.ts:963,1011–1049` y `Backend/src/ticket/ticket.service.ts:220–235`.

Se confirma la DB antes de encolar. Un reinicio entre commit y add, o un fallo de Redis que se captura y solo se registra, deja entradas emitidas sin trabajo durable de correo. El camino de pago duplicado devuelve entradas existentes sin recuperar ese enqueue. El email de reclamo todavía crea el token y encola mediante una cadena no esperada por el flujo principal.

**Corrección:** outbox en la misma transacción de compra y worker que la publica/procesa con idempotencia. Registrar entrega y permitir reenvío. BullMQ protege jobs que ya llegaron a Redis; no protege este intervalo previo.

### 14 — P2 — La deduplicación de reclamos usa solamente el email

**Ubicación:** `Backend/src/queue/email.queue.ts:89–94`.

`addSendAccountClaimJob` identifica el job por `userEmail`, aunque se genere una nueva claimUrl. Mientras exista el job anterior retenido, BullMQ puede omitir el nuevo enlace; el anterior puede estar vencido. Por otra parte, la retención de solo cien jobs completados limita temporalmente la deduplicación de toda la cola.

**Corrección:** conservar jobId, vinculándolo a la identidad del token u operación. Mantener la idempotencia persistente de pagos separada de la retención de jobs.

### 15 — P2 — Redis se describe opcional, pero el arranque lo exige

**Ubicación:** `Backend/src/index.ts:54` y `Backend/src/queue/queue.config.ts:10–13`.

El esquema de env permite desarrollo sin REDIS_URL, pero `startEmailWorker()` se ejecuta siempre y el getter lanza error sin esa variable. El servidor inicia y luego entra en shutdown. Además, el productor comparte una conexión con `maxRetriesPerRequest:null`, por lo que una caída de Redis puede prolongar indefinidamente un enqueue esperado dentro de un request.

**Corrección:** documentar Redis obligatorio o definir un modo de desarrollo explícito. Separar conexiones/políticas de retry de productor y worker; utilizar timeouts y outbox para el productor.

### 16 — P1 — Las fechas dependen del huso horario del proceso

**Ubicación:** `Backend/src/event/event.service.ts:130,176,267–276`, `Backend/src/payment/preference.service.ts:272,892`, `Backend/src/common/utils/ticket.ts:15–18` y migración de startDateTime.

Se construyen fechas con `new Date(date + 'T' + time)` sin offset. La interpretación depende del TZ del host; un servidor en UTC y un desarrollador en Buenos Aires producen instantes distintos para el mismo evento. La migración combina date/time y castea a timestamptz según la zona de la sesión PostgreSQL. Pasar columnas a timestamptz no corrige la interpretación del origen.

**Corrección:** definir la zona del evento y convertir explícitamente a un instante UTC. Comprar, listar y validar QR deben usar el mismo `startDateTime`; backfill con una zona explícita. Probar eventos cerca de medianoche en UTC y America/Argentina/Buenos_Aires. Revisar también que el helper tolere un Date real, porque String(Date) no es una fecha ISO.

### 17 — P2 — Controladores exponen mensajes internos en producción

**Ubicación:** `Backend/src/ticket/ticket.controller.ts:59,108,131`, `Backend/src/coupon/coupon.controller.ts:74` y varios catch de `subscription.controller.ts`.

Se responde directamente con `error.message` o `error` sin pasar por el errorHandler global. Pueden filtrarse consultas, restricciones o detalles del proveedor según el error. El redactor global no cubre respuestas ya enviadas.

**Corrección:** centralizar traducción y redacción de errores, mantener códigos públicos estables y registrar contexto interno con requestId.

### 18 — P2 — Refresh sin verificación de origen para cookies cross-site

**Ubicación:** `Backend/src/common/services/sessionTokens.ts:23–31`, `Backend/src/user/user.routes.ts:24` y CORS de `Backend/src/app.ts`.

Producción utiliza SameSite=None. `/refresh` modifica una sesión mediante cookie sin validar Origin/CSRF. CORS impide leer respuestas a orígenes no permitidos, pero no necesariamente evita el envío y ejecución de un POST simple. Dependiendo del navegador y su política de cookies de terceros, un sitio externo podría forzar rotaciones o interferir con la sesión. No se confirma extracción del access token.

**Corrección:** validar origen y/o token CSRF en operaciones basadas en cookies; evaluar dominio propio compartido para frontend/API. Validar el escenario en navegadores donde se envíen cookies cross-site.

### 19 — P2 — Cambiar contraseña no invalida las otras sesiones

**Ubicación:** `Backend/src/user/user.service.ts:245–255` y `318–341`.

El cambio de contraseña y el reclamo guardan el nuevo hash sin revocar refresh tokens anteriores. Una sesión previamente obtenida puede seguir renovándose después del cambio. Tampoco se exige contraseña anterior en el cambio de perfil, lo cual requiere una decisión explícita de producto para una operación sensible.

**Corrección:** revocar otras sesiones, renovar la actual y exigir reautenticación para contraseña/email. Definir una versión de credenciales para invalidar access tokens si se necesita efecto inmediato.

### 20 — P2 — Checkout redirige a una ruta inexistente

**Ubicación:** `Frontend/src/app/pages/checkout/checkout.component.ts:110,156` y `Frontend/src/app/app.routes.ts`.

Cuando falta el carrito o no quedan ítems válidos, navega a `/events/:id`. El detalle registrado es `/event/:id`; se termina en el componente 404.

**Corrección:** corregir la navegación y cubrir acceso directo, carrito vencido y borrado de sessionStorage.

### 21 — P1 — Login/checkout/header tienen barreras de accesibilidad

**Ubicación:** `Frontend/src/app/pages/login/login.component.html:24–50`, campos de `checkout.component.html` y `header.component.html:107–150`.

Los labels del login y checkout no tienen asociación for/id y no envuelven sus inputs. El botón de mostrar contraseña carece de nombre accesible. El avatar de escritorio es un div con click sin teclado; imágenes de perfil carecen de alt. Algunos botones eliminan outline sin una alternativa de foco visible. Relacionado con WCAG 1.3.1, 2.1.1 y 4.1.2; no constituye una evaluación de conformidad completa.

**Corrección:** labels asociados, aria-describedby para errores, nombre y estado del botón de contraseña, enlaces/botones semánticos y focus-visible. Para estas correcciones: `$impeccable harden`.

### 22 — P2 — Exportaciones CSV sin protección de fórmulas

**Ubicación:** `Frontend/src/app/pages/creator-stats/creator-stats.component.ts:436–455` y `Backend/src/event/event.controller.ts:435–445`.

El frontend no escapa comillas dentro del título, pudiendo romper filas. Ni frontend ni backend neutralizan texto que empieza con caracteres de fórmula al abrirlo en Excel u otras hojas. El backend sí duplica comillas, pero eso no neutraliza la evaluación de fórmulas. La exposición actual del reporte del propio organizador limita el alcance entre usuarios; el riesgo se amplía al compartir exportaciones.

**Corrección:** unificar la exportación, escapar CSV correctamente y neutralizar fórmulas en columnas de texto, o exportar XLSX con celdas de tipo string.

### 23 — P2 — Documentación que contradice el estado real

**Ubicación:** `README.md` y `AGENTS.md` frente a manifests y código.

La guía describe Angular 17, Node 18, tokens en localStorage, tests y scripts de backend inexistentes, y controladores que ahora delegan en servicios. La implementación usa Angular 21, access token en memoria, refresh cookie y servicios de dominio. Algunos comentarios de rutas también contradicen permisos y comportamiento real.

**Corrección:** actualizar documentación y registrar por separado invariantes vigentes versus historial. Mantener expresamente los invariantes de firma, verificación de usuarios, timestamps e idempotencia.

### 24 — P2 — Preferencias fallidas dejan stock reservado

**Ubicación:** `Backend/src/payment/preference.service.ts:793–849,976–1011`.

`preparePreference()` reserva en Redis y hace commit antes de llamar a `preference.create()`. La compensación del catch interno solo cubre errores durante preparación. Si MP falla después, las reservas permanecen diez minutos aunque no exista un checkout utilizable. Puede bloquear ventas temporalmente. Extras con stock se validan en DB, pero no reciben una reserva comparable; un pago tardío puede encontrar stock agotado, lo que debe terminar en compensación financiera.

**Corrección:** devolver una identidad de reserva y liberar en el catch de creación MP; persistir la orden y su expiración. Diseñar una política común de reserva/confirmación para entradas y extras, y una devolución durable cuando un pago aprobado no pueda cumplirse.

## Frontend: evaluación técnica limitada

**Integridad:** el producto tiene rutas, servicios y pantallas específicas de eventos; no requiere reemplazar su identidad visual. La integridad funcional falla en correlación de compra, polling guest y rutas de recuperación. El detector estético no demuestra problemas de seguridad ni justifica por sí solo un rediseño.

Puntuación orientativa del código de las superficies revisadas, no de toda la aplicación ni de una prueba de navegador:

| Dimensión | Nota / 4 | Evidencia y límites |
|---|---:|---|
| Accesibilidad | 1 | Asociaciones de campos, avatar y botones incompletos; contraste no medido. |
| Performance | 3 | Build exitoso, 154,21 kB inicial estimado y lazy loading de gráficos/scanner. Sin medidas de Core Web Vitals. |
| Responsive | 2 | Breakpoints existentes; toasts globales con min-width 340px y right-6 merecen probarse a 320/360px. No se confirma overflow visual. |
| Theming | 2 | Variables semánticas existentes, muchos colores directos en templates; dark mode no evaluado. |
| Integridad | 2 | Estructura coherente con fallos verificados en flujo de compra. |
| **Total orientativo** | **10/20** | Muestra técnica parcial; no usar como certificación de calidad visual o WCAG. |

El enlace “¿Olvidaste tu contraseña?” del login apunta a `#`; no se identificó un flujo de recuperación para cuentas normales. El mecanismo claim está limitado a invitados. Es una funcionalidad pendiente a decidir y luego implementar, evitando presentar un enlace sin acción.

Orden para la etapa UI: `$impeccable harden` (errores, navegación y accesibilidad), `$impeccable adapt` (verificar pantallas estrechas), `$impeccable optimize` si las mediciones reales justifican cambios, y `$impeccable polish` al cerrar. Estos trabajos pueden abordarse individualmente o juntos; repetir `$impeccable audit` después para comprobar el resultado.

## Puntos fuertes que conviene preservar

1. **Autorización real en backend:** perfiles verifican propiedad; autenticación recupera roles actuales y rechaza usuarios inactivos o eliminados. La caché de cinco segundos es explícita y acotada.
2. **JWT más sólido:** algoritmo HS256 explícito, issuer y audience verificados, duración configurable y access token en memoria; refresh token aleatorio almacenado como hash y cookie HttpOnly.
3. **Webhooks protegidos:** firma HMAC, comparación constante, exigencia de secreto y verificación temporal. El endpoint de simulación está limitado a admin y development. Mantenerlo así.
4. **Inventario con defensas reales:** actualizaciones condicionales, constraints y locks en preferencias. El defecto de commit parcial es reparable sin abandonar este modelo.
5. **QR atómico:** validación compartida entre módulos, permisos por evento/organizador, comprobación de evento/tipo activo y transición ACTIVE→USED condicionada al estado, reduciendo dobles usos concurrentes.
6. **Trazabilidad financiera:** unicidad de mpPaymentId, paymentLogId en tickets/extras, importes y comisiones guardados y restricciones monetarias. Aprovecharlo para eliminar fallbacks heurísticos.
7. **Seguridad básica e infraestructura:** body parsers limitados al inicio, Helmet, CORS explícito, rate limiting, métricas protegidas por defecto, datos sensibles select:false y tokens MP cifrados.
8. **Colas:** reintentos, concurrencia acotada, IDs de deduplicación y separación de tareas de correo. La outbox completa esta arquitectura.
9. **Frontend modular:** standalone, rutas diferidas, interceptores centralizados, builds exitosos y librerías pesadas fuera del bundle inicial.
10. **Consultas más cuidadas:** cargas por lotes, paginación, caches e índices para listados/estadísticas. Medir con EXPLAIN y datos realistas antes de agregar nuevos índices.

## Orden de reparación propuesto

1. **Integridad comercial:** 01–05, 09 y 24. Revertir inventario parcial, conservar errores transitorios, eliminar inferencias de reembolso y agregar intención durable de compensación. Pruebas de integración con PostgreSQL antes de vender nuevamente bajo esos escenarios.
2. **Identidad y acceso:** 07–08, 18–19. Consumo atómico de tokens, invalidación de reclamos/sesiones y protección de operaciones con cookies. Revisar también si el state OAuth MP está vinculado a una sesión iniciadora y es de un solo uso: se observó state firmado con expiración, pero no se confirmó esa vinculación; requiere revisión específica de integración.
3. **Entrega y atribución:** 06, 10, 13–16. Restaurar RRPP, correlacionar compra actual, outbox, política de Redis y zona de eventos.
4. **Mantenimiento:** 11–12 y 17, 20–23. Dependencias, runtime uniforme, CI obligatorio, mensajes públicos, accesibilidad y documentación.

Pruebas mínimas a agregar: carrito con segundo ítem agotado; caída de DB/MP durante webhook; pago aprobado tras expirar reserva; doble reembolso; pago con tickets USED; compras cercanas del mismo usuario; doble refresh; claim por dos enlaces y después de Google; polling guest; atribución RRPP; email después de reinicio; evento en zonas distintas.

No se propone reescribir toda la aplicación. Las prioridades son estados explícitos, atomicidad, correlación de órdenes y recuperación persistente.
