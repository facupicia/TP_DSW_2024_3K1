# EventLife: puntos débiles y prioridades

Fecha: 17 de noviembre de 2026. Revisión del checkout, autenticación, colas, configuración, CI, documentación y evidencia de la publicación del mismo día. No se modificó código ni infraestructura durante esta revisión.

Actualización posterior: el hallazgo de email motivó una corrección separada, publicada como `018edfe`. Gmail SMTP autenticó y aceptó el correo de prueba con PDF; ver [evidencia de publicación](deploy-mail-2026-11-17.md). Los hallazgos de abajo conservan el estado observado durante la auditoría original.

## Diagnóstico

La aplicación está publicada y tiene una base técnica considerable: transacciones de compra, reservas persistentes, webhooks firmados, procesamiento durable, revocación de sesiones y controles de permisos. La preparación operativa todavía no alcanza para abrir ventas reales sin acompañamiento. La entrega de email está bloqueada y el circuito comercial completo aún no fue aceptado de extremo a extremo.

Los resultados de producto son hipótesis: el repositorio y los datos ficticios no permiten medir demanda, retención ni rentabilidad. Las observaciones de infraestructura se apoyan en la inspección realizada durante el despliegue; esta revisión no volvió a conectarse por SSH ni cambió servicios externos.

## Hallazgos confirmados

### 1. Entrega de emails bloqueada y estado de proveedor engañoso — prioridad inmediata

En la publicación, Brevo respondió 401 con las credenciales existentes. Los emails pendientes reintentan, pero persistir el trabajo no garantiza entregar la entrada. Además, `verifyMailer()` solo evalúa la presencia de `BREVO_API_KEY` y puede declarar el mailer disponible con una clave inválida.

Evidencia: `Backend/src/common/services/mailer.ts:17`, `docs/deploy-2026-11-17.md`, sección Integraciones pendientes.

Acción: habilitar credenciales válidas, comprobar una entrega a un buzón controlado y verificar la recuperación de los pendientes. Diferenciar estado configurado, autenticado y entrega observada; no hacer depender el health público de una llamada externa en cada request.

### 2. Pagos de prueba en un entorno llamado producción — bloqueo para ventas reales

MercadoPago aceptó el token, pero identificó la cuenta de plataforma como `test_user`, mientras `MP_MODE=production`. El sitio conserva un aviso explícito de demo. No se verificaron cobros, devoluciones reales, OAuth de organizadores ni suscripciones. Esto describe un despliegue público demostrativo, no una aceptación comercial completa.

Acción: separar explícitamente demo, pruebas y operación real. En un entorno de pruebas validar pago aprobado/rechazado/pendiente, notificaciones duplicadas y tardías, entrega de entradas, lectura QR y devolución. Definir una aceptación controlada antes de habilitar ventas reales.

### 3. El checkout promete una reserva antes de crearla — bug de experiencia

La plantilla muestra «Tus entradas están reservadas». `ngOnInit()` inicia un contador local de diez minutos. La reserva durable aparece recién al crear la preferencia de pago en el backend. El reloj no representa el vencimiento del servidor y se reinicia al recargar.

Evidencia: `Frontend/src/app/pages/checkout/checkout.component.html:21`, `checkout.component.ts:89`, `checkout.component.ts:237`, `Backend/src/payment/preference.service.ts:898`.

Consecuencia: alguien puede completar el formulario creyendo tener stock asegurado y perderlo antes de pagar. El backend sigue validando stock; el fallo confirmado es la promesa y sincronización de la interfaz.

Acción: mostrar reserva y cuenta regresiva únicamente tras confirmar una reserva del servidor, usando su fecha de vencimiento. Si no se reserva al ingresar, describir con precisión cuándo se comprueba disponibilidad.

### 4. Publicación manual y fuentes de configuración separadas — prioridad alta

GitHub Actions compila y prueba, pero no publica ni aplica migraciones ni ejecuta aceptación posterior. La última publicación usó una imagen y Compose de release separados del checkout administrado originalmente por Portainer; Netlify se publicó por CLI. Hay más de un lugar desde el que se puede cambiar producción.

Evidencia: `.github/workflows/ci.yml`, `Backend/docker-compose.portainer.yml`, `docs/deploy-2026-11-17.md`.

Acción: establecer una única ruta de publicación por commit, imágenes identificables, migración explícita antes de arrancar y smoke posterior. Alinear el stack de Portainer con esa ruta. Conservar el rollback existente y documentar qué versión está ejecutándose en cada componente.

### 5. Un único servidor concentra API, base de datos y túnel — riesgo de disponibilidad

El incidente de SSH y Cloudflare se recuperó tras reiniciar el servidor. API y PostgreSQL comparten esa máquina. El respaldo de la publicación está en el mismo servidor: sirve para ciertos errores de release, pero no cubre la pérdida de ese host/disco. No se acreditó un respaldo periódico externo ni una restauración ensayada.

Acción: automatizar backups fuera del host y ensayar una restauración aislada. Agregar comprobación externa de disponibilidad y definir cuánto tiempo y cuántos datos se acepta perder. Priorizar esto antes de replicar servicios.

### 6. Los límites de seguridad cambian según cómo se despliegue — prioridad alta

El esquema de entorno define por defecto 30 intentos de autenticación en producción, pero el Compose de Portainer establece 1000; refresh también queda en 1000 frente al valor base de 60. Los límites específicos de preferencias, consulta y devoluciones usan almacenamiento en memoria, aunque el limitador general sí contempla Redis. Con réplicas esos límites particulares serían por proceso.

Durante el despliegue se observaron puertos de PostgreSQL, API y Portainer publicados en todas las interfaces del host. Eso no prueba exposición a Internet: faltan verificar firewall y router. Sí amplía el acceso potencial desde redes que alcancen esa máquina.

Evidencia: `Backend/docker-compose.portainer.yml:51`, `Backend/src/config/env.ts:101`, `Backend/src/payment/payment.routes.ts:16`, `Backend/src/common/middleware/rateLimit.ts:73`.

Acción: unificar valores seguros de producción, distinguir límites por IP y cuenta cuando corresponda, y revisar qué puertos requieren acceso al host. Verificar alcance real antes de cerrar enlaces usados por otros servicios.

### 7. Recuperar sesiones depende de cookies entre sitios — riesgo de compatibilidad

Frontend en `event-life.netlify.app` y API en `api.vidaeventofiesta.site` pertenecen a sitios diferentes. Refresh usa cookies HttpOnly/Secure/SameSite=None. El smoke HTTPS verificó atributos y rotación, pero no demuestra que todos los navegadores permitan conservar la sesión en ese contexto.

Evidencia: `Frontend/src/environments/environment.ts:3`, `Backend/src/common/services/sessionTokens.ts:28`, `Frontend/src/app/services/auth.service.ts:190`. [MDN documenta las restricciones de cookies de terceros](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies).

Acción: servir frontend y API bajo el mismo dominio registrable y probar login, recarga y refresh en navegadores con restricciones de privacidad. Es un riesgo arquitectónico identificado, no un fallo observado en todos ellos.

### 8. Colas durables, pero capacidad y tratamiento de fallos poco diferenciados — prioridad media

Emails, pagos y devoluciones comparten un lote máximo de tres trabajos concurrentes en el proceso HTTP. Un trabajo lento ocupa un cupo también necesario para otros tipos. Los errores reintentan indefinidamente con espera máxima de una hora, sin cuarentena explícita para errores permanentes. Esto no demuestra saturación actual, pero limita aislamiento y diagnóstico.

Hay un endpoint administrativo de operaciones y logs. No se verificó alertado automático por antigüedad de trabajos pendientes o devoluciones fallidas. Las métricas HTTP actuales mantienen conteos y sumas de duración por proceso, sin percentiles ni persistencia propia.

Evidencia: `Backend/src/queue/outbox.service.ts:20`, `:43`, `:57`; `Backend/src/index.ts:59`; `Backend/src/admin/admin.controller.ts:13`; `Backend/src/common/services/metrics.ts:3`.

Acción: alertar por edad del trabajo más viejo, separar errores transitorios de permanentes y medir tiempos por tipo. Separar concurrencia de pagos/devoluciones y emails cuando las mediciones lo justifiquen. No reemplazar la persistencia transaccional actual por fire-and-forget.

### 9. Pruebas útiles, aceptación incompleta para el alcance — prioridad alta

La publicación pasó 37 pruebas de backend, 13 de frontend y CI. Parte importante de las pruebas de backend transpila módulos y simula dependencias; algunas regresiones ejecutan SQL real con PGlite. Hay un smoke de autenticación contra producción, pero no una aceptación automatizada completa de compra → proveedor → webhook → entrada → QR → devolución.

Tampoco hay un baseline de carga que permita afirmar qué pico de ventas o validaciones soporta el servidor. Un catálogo funcionando no acredita el comportamiento de una apertura de ventas o una puerta con múltiples escáneres.

Evidencia: `Backend/tests/helpers.cjs:8`, `Backend/tests/production-smoke.cjs`, `.github/workflows/ci.yml`, evidencia de publicación.

Acción: priorizar pruebas de integración de los límites reales entre componentes y concurrencia de stock/escaneo. Medir errores y latencia de un escenario representativo en un entorno aislado antes de atribuir problemas a consultas específicas.

### 10. Tipado débil y módulos de negocio grandes — coste de mantenimiento

Backend conserva `strict: false`. Pagos concentra cientos de líneas por archivo: el núcleo y las preferencias mezclan varias responsabilidades de compra, stock, descuentos, proveedor y persistencia. Su tamaño no demuestra por sí solo un bug, pero hace costoso cambiar reglas y probar sus combinaciones.

Evidencia: `Backend/tsconfig.json:5`, `Backend/src/payment/payment.core.ts`, `Backend/src/payment/preference.service.ts`.

Acción: extraer progresivamente reglas de precios, reservas y transiciones de pago con contratos tipados. Activar controles estrictos por etapas en los módulos tocados. Mantener el monolito modular; no se encontró evidencia que justifique microservicios.

### 11. Las páginas comerciales se renderizan en cliente — oportunidad de adquisición

El proyecto incluye SSR, pero solo privacy, terms y support se prerenderizan; el resto está en `RenderMode.Client`. Netlify publica archivos estáticos con fallback a `index.csr.html`. Los eventos dependen de JavaScript para cargar su contenido.

Esto puede dificultar descubrimiento e indexación; no se midió posicionamiento ni se probaron previews sociales durante esta revisión. [Angular explica los límites SEO del renderizado en cliente](https://angular.dev/guide/ssr).

Evidencia: `Frontend/src/app/app.routes.server.ts:3`, `Frontend/netlify.toml:1`.

Acción: evaluar SSR o prerender para landing, catálogo y detalle público, con metadatos específicos por evento; mantener las áreas privadas en cliente.

### 12. La documentación describe otra operación — deuda que puede reintroducir fallos

README sigue indicando Render/Neon y PostgreSQL 16. La producción inspeccionada usa Docker/Portainer y PostgreSQL 15. PROJECT_SKILL conserva Node 18, afirma que no hay colas y pide responder siempre 200 al webhook, contradiciendo la implementación durable y las instrucciones de octubre. El deploy actual tiene su propio documento correcto, pero todavía hay instrucciones incompatibles.

Acción: actualizar una guía operativa canónica y marcar como históricos los documentos reemplazados. Mantener inventario de dominios, servicios, migraciones, secretos requeridos y responsables sin incluir valores sensibles.

## Hipótesis de producto y ejecución

1. **Cliente objetivo demasiado amplio.** Descubrimiento para asistentes y gestión para productores son dos propuestas distintas. Marketplace, RRPP, extras y planes multiplican casos antes de tener evidencia de cuál resuelve mejor una necesidad. Próximo paso: elegir un segmento inicial y observar cómo organiza y vende hoy.
2. **La diferenciación necesita una prueba concreta.** «Todo en uno» enumera capacidades, pero no cuantifica mejora. Hipótesis para validar: facilitar venta y acceso a pequeños productores que hoy coordinan por redes y planillas. Medir tiempo hasta publicar el primer evento y completar la primera venta.
3. **El éxito se está midiendo principalmente como código publicado.** No recibí métricas que acrediten organizadores activos, eventos repetidos, conversión del checkout, entregas exitosas o coste de soporte. Eso impide evaluar demanda y sostenibilidad. Próximo paso: instrumentar un embudo mínimo y observar eventos reales de un piloto controlado cuando se habiliten las integraciones.
4. **La confianza del comprador depende de toda la cadena.** Cobrar, entregar y resolver un problema son una sola experiencia para la persona. Próximo paso: definir quién atiende un pago sin entrada, un email incorrecto, un evento cancelado o una validación rechazada y cómo consulta el estado.

No hay evidencia suficiente para afirmar falta de demanda o rentabilidad negativa. Tampoco alcanza la cantidad de funcionalidades para afirmar ajuste al mercado.

## Secuencia recomendada

1. Recuperar email y eliminar estados de integración engañosos.
2. Corregir la reserva anunciada por el checkout y aceptar el circuito de compra completo con proveedores de prueba.
3. Unificar publicación/configuración, respaldar fuera del host y ensayar recuperación.
4. Ajustar límites, verificar puertos y probar sesiones en navegadores restrictivos.
5. Hacer un piloto acotado con métricas de conversión, entrega, escaneo y soporte.
6. Usar esas mediciones para priorizar rendimiento, refactor y funcionalidades.

Recomendación: mantener el sitio como demo/beta mientras se resuelven los bloqueos de entrega y aceptación comercial. Una nueva ronda de funcionalidades tiene menor prioridad que confiabilidad, recuperación y validación con organizadores.
