## Objetivo
- Corregir deficiencias detectadas en seguridad, concurrencia, arquitectura, rendimiento, observabilidad, configuración y datos.
- Entregar un backend robusto, escalable y mantenible con errores y logs estandarizados, transacciones seguras y pruebas.

## Principios
- Seguridad primero, luego consistencia transaccional, después observabilidad y rendimiento.
- Cambios incrementales con pruebas y validaciones por etapa.
- Estándares claros: repositorios + servicios, errores centralizados, logging estructurado, configuración tipada.

## Mejoras Críticas de Seguridad
- Validar firma del webhook de MercadoPago (HMAC sobre cuerpo crudo) y rechazar solicitudes no válidas.
- Proteger `GET/DELETE /api/user/:id` con `checkAuthToken` y `checkRoleAuth`.
- Unificar CORS usando `isOriginAllowed(origin)` alimentado por `CLIENT_URLS`.
- Importar `reflect-metadata` al inicio del proceso.
- Configurar `ssl.rejectUnauthorized: true` en producción con CA.
- Sanitizar logs de pagos: no imprimir tokens ni `init_point` completo, usar IDs y estados.

## Consistencia y Concurrencia
- Compra/cancelación con transacciones y bloqueo pesimista de `Event` (fila) antes de decrementar `capacity`.
- Definir semántica de `capacity`: máximo vs restante; si restante, asegurar decrementos atómicos bajo lock.
- Validación de ticket atómica: `UPDATE ... WHERE status='VALID'` y comprobar `affected`.
- Idempotencia de pagos: mantener `PaymentLog` único (por `mpPaymentId`) y retornar `already_processed`.

## Arquitectura y Refactor
- Extraer `TicketService` y `PaymentService`:
  - `checkStock`, `decrementCapacity`, `createTickets`, `sendTicketsEmail`, `recordPayment`.
- Adoptar repositorios TypeORM (`getRepository`) como estándar; `QueryRunner` solo en operaciones críticas.
- Estandarizar manejo de errores:
  - Utilidad `httpError(status, code, message)`.
  - Propagar con `next(err)` y formatear en el `errorHandler`.

## Rendimiento y Caché
- Introducir Redis para cachés (`events:all`, métricas por usuario/evento); TTL razonable e invalidaciones por eventos de dominio.
- Reducir costo de SSE: aumentar intervalo, precomputar agregados o migrar a endpoint pull con filtros.
- Añadir índices:
  - `Ticket(eventId)`, `Ticket(userId)`, `Ticket(codigo_unico)`.
  - `Event(user_id)`.
  - Verificar `PaymentLog(mpPaymentId)` único.

## Observabilidad
- Logger estructurado (pino/winston) con `request-id`, niveles y sanitización.
- Métricas Prometheus:
  - Latencias por endpoint (`histogram`), errores (`counter`), colas (`gauge`).
- Dashboard Grafana para API y dependencias externas (MP, SMTP, DB).

## Configuración
- Módulo `config` con validación Zod de `.env`.
- Centralizar `CLIENT_URLS`, tokens de MP, secreto de webhook, parámetros de CORS, opciones de DB.

## Datos y Migraciones
- Renombrar columnas `updateAd` → `updatedAt` en `User` y `Event`.
- Desactivar `synchronize` en producción y usar migraciones versionadas.

## Dependencias
- Remover paquetes no usados (`@nestjs/typeorm`, `nanoid` si no se usa en código).
- Auditoría de vulnerabilidades y actualización de librerías críticas.

## Pruebas
- Pruebas de integración con `supertest`:
  - Rutas protegidas (usuarios), creación de preferencias y webhook con firma válida/ inválida.
- Pruebas de concurrencia:
  - Compra concurrente simulada y validación de tickets atómica.
- Pruebas unitarias de servicios (`TicketService`, `PaymentService`) y utilidades (`httpError`, `config`).

## Documentación
- Ampliar Swagger: usuarios, eventos, tickets, pagos, errores comunes y códigos.
- README de despliegue con entorno, migraciones, caché y métricas.

## Entregables y Criterios de Aceptación
- Seguridad: webhook con firma y rutas protegidas verificadas por tests.
- Concurrencia: no-oversell garantizado bajo alta carga; validación de ticket idempotente.
- Arquitectura: servicios y repos implementados; controladores delgados.
- Observabilidad: logs con `request-id`, métricas expuestas; dashboard básico.
- Rendimiento: caché activo, SSE optimizado; índices aplicados.
- Configuración: módulo validado; sin hardcodes.
- Datos: migraciones ejecutadas y `updatedAt` correcto.

## Riesgos y Mitigación
- Cambios en semántica de `capacity`: comunicar y ajustar UI/servicios.
- Integración de Redis: fallback a caché en memoria en dev.
- Firma de webhook: coordinar secreto con MP; logs temporales para diagnóstico.

## Orden de Implementación
1. Seguridad: firma webhook, rutas protegidas, CORS, `reflect-metadata`, SSL.
2. Concurrencia: transacciones y validación atómica; idempotencia pagos.
3. Arquitectura: extracción de servicios/repos; errores centralizados.
4. Rendimiento: Redis y índices; optimización de SSE.
5. Observabilidad: logger y métricas; dashboards.
6. Configuración y Datos: módulo config y migraciones.
7. Dependencias, Pruebas y Documentación: limpieza, cobertura y Swagger.

¿Confirmas este plan para proceder con la implementación por fases y entregar parches y pruebas en cada etapa?