# EventLife: revisión del negocio del backend, 17/11/2026

Alcance: backend, seguridad y operación. Frontend sin cambios. Trabajo iniciado a las 16:01 ART, con ciclos de reproducción RED, corrección GREEN y revisión de las invariantes relacionadas. Los commits de pruebas conservan los casos que fallaban antes de corregir el código.

## Resultado de la revisión

| Área | Correcciones y garantías verificadas |
|---|---|
| Escáner | UUID obligatorio y acotado; URLs QR con query/fragment; rechazo antes de consultar la DB para entradas malformadas; aislamiento por organizador; ventana temporal; eventos y vouchers inactivos; canje único concurrente de entradas y extras; baja del scanner con efecto inmediato. |
| Compatibilidad del escáner | El validador histórico podía consumir un extra y responder 500. Ahora devuelve su resultado correcto. Extras inactivos responden 409 con un código estable. Asignar como scanner a otro organizador agrega el rol necesario. |
| Catálogo y extras | Validación estricta de cantidades, booleanos, precios y URLs; propiedad del producto y evento; límites del plan bajo bloqueo; stock vendido y reservado protegido; contador de ventas también para stock ilimitado; límites del plan al reactivar extras y comprar después de un downgrade. |
| Compras mixtas | Se corrigió la liberación prematura del QueryRunner durante una devolución compensatoria; stock atómico; precios congelados; descuento repartido en centavos sin diferencias con el total; rechazo explícito de metadata demasiado grande; carrito acotado y sin IDs duplicados. |
| Pagos repetidos | Un segundo pago aprobado no entrega otra compra. Tiene su propia compensación. El estado público sigue al pago que efectivamente entregó los vouchers, no al último intento. Una devolución compensatoria no marca como reembolsada la compra original. |
| Actualizaciones del proveedor | La deduplicación ya no descarta para siempre las notificaciones posteriores de un mismo pago. Devoluciones y contracargos externos cancelan vouchers no utilizados, restauran inventario una sola vez y reconcilian el checkout. Una reversión anterior a la entrega impide emitir vouchers. |
| Suscripciones | Cobro anual con frecuencia de doce meses; rechazo de anualidad inexistente; titular y plan vinculados al ID externo; activación repetida sin reiniciar el período; cancelación solicitada por el usuario solo tras confirmar el proveedor y conservación del período pagado; notificaciones persistidas en outbox con reintentos. Reemplazar una suscripción paga deja una intención durable de cancelar la renovación anterior; una notificación antigua no puede reactivar la suscripción reemplazada. |
| Unicidad de suscripciones | Bloqueo por titular y restricciones de base para una suscripción activa por usuario y un único vínculo por suscripción externa. La migración se detiene ante duplicados y exige revisión, sin elegir ni borrar registros automáticamente. |
| Eventos e invitaciones | Bloqueos SQL válidos con relaciones opcionales; reservas consideradas al invitar y reducir capacidad; cancelación consistente de extras gratuitos; pago tardío de un evento borrado deriva a compensación; cancelación de checkouts pendientes al eliminar el evento. |
| RRPP y cupones | Propiedad verificada al asignar y quitar RRPP; reactivación de asignaciones; rechazo de promotores inactivos; comisión numérica estricta; códigos sin separadores ambiguos; fechas de cupones según el instante canónico del evento. |
| Cuentas | Recuperación durable, enlace de un solo uso incluso con concurrencia, invalidación del enlace anterior, cambio de contraseña con revocación de sesiones y contraseña actual obligatoria. |
| Recursos y límites | Se eliminó una adquisición doble de conexiones en la elegibilidad del checkout: PostgreSQL real reproducía agotamiento del pool con veinte solicitudes concurrentes. Límites productivos de login/refresh: 30/60; limitadores de pagos usan la fábrica compartida de Redis. |

Reglas comerciales preservadas o explicitadas:

- Un voucher de extra canjea toda su cantidad comprada. No se introdujo canje parcial.
- Las devoluciones iniciadas en la app siguen siendo totales, con intención durable y clave de idempotencia. Un voucher ya utilizado impide esa devolución automática.
- No se puede eliminar un evento con compras pagadas activas: debe pasar primero por el flujo de devolución (`PAID_EVENT_REFUND_REQUIRED`, HTTP 409).
- Un contracargo del proveedor invalida vouchers no utilizados; los ya utilizados conservan su historial y requieren revisión comercial.
- No se ejecutaron cobros, devoluciones ni envíos de correo reales durante esta revisión.

## Evidencia de pruebas

| Verificación | Resultado |
|---|---|
| Línea base previa | 45 pruebas aprobadas. |
| Suite completa `npm test` | 142 casos: 141 aprobados, 0 fallos, 1 omitido por requerir PostgreSQL nativo. |
| `npm run test:business:postgres` en Docker Node 22 y PostgreSQL 15 aislado | 93 aprobados, 0 fallos, 0 omitidos. Incluye concurrencia real y el caso de agotamiento del pool. |
| Compilación TypeScript e imagen de producción | Correctas. Imagen ejecutada con Node v22.23.5 y usuario sin privilegios. |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas en dependencias de producción en esta ejecución. |
| Migraciones en copia restaurada | Las dos migraciones nuevas se aplicaron correctamente antes de aplicarlas a producción. |
| API pública HTTPS | 15 comprobaciones aprobadas: salud, catálogos, autenticación obligatoria, CORS, rechazo de webhooks sin firma y aceptación de tema ignorado correctamente firmado. |
| Autenticación publicada | Registro, login, cookies seguras, perfil, RBAC, refresh, revocación al cambiar contraseña y logout aprobados. El usuario sintético y sus sesiones fueron eliminados. |
| Respaldo PostgreSQL | Dump custom privado, listado comprobado con `pg_restore --list` y restauración completa en base aislada con `--exit-on-error`. |
| Cifrado de respaldos | Script AES-256-GCM con clave envuelta mediante Windows CurrentUser DPAPI; ida y vuelta y hash probados con datos sintéticos. |
| CI del código final | [Run 44167935109](https://github.com/facupicia/TP_DSW_2024_3K1/actions/runs/44167935109): aprobado en backend, PostgreSQL 16 y frontend. Commit de aplicación `1fbd1f4`. |

Las pruebas usan servicios reales y consultas TypeORM contra PostgreSQL/PGlite, con MercadoPago y correo simulados. La base nativa se habilita solo mediante `EVENTLIFE_TEST_POSTGRES_URL`, exige un nombre `eventlife_business_test_*` y cada fixture crea y elimina únicamente su propio esquema. No carga automáticamente el `.env` productivo. El CI agrega un PostgreSQL 16 aislado para repetir estos casos en cada push/PR.

No se midió un porcentaje global de cobertura ni se afirma que esta revisión demuestre ausencia de bugs. Quedan fuera las cámaras, la interfaz del comprador y la entrega de notificaciones desde una transacción real de MercadoPago.

## Release y operación

API: https://api.vidaeventofiesta.site. Frontend: https://event-life.netlify.app. El backend ya no se aloja en Render: corre en Docker en el servidor, publicado mediante Cloudflare Tunnel.

- Imagen final: `eventlife-backend:business-20261117-1720`; imagen anterior del mismo ciclo: `eventlife-backend:business-20261117-1700`.
- Código de aplicación: commit `1fbd1f4`; los commits posteriores agregan documentación.
- Release privado en el servidor: `/home/facu/eventlife-releases/20261117-1630-business`.
- `compose.release.json` publica únicamente el backend; `compose.rollback.json` conserva la imagen y configuración previas. No usar `--remove-orphans`: Redis pertenece al entorno existente. Antes de volver a una versión que no reconoce los nuevos tipos de outbox, drenar sus tareas o mantener un worker compatible; no borrar intenciones pendientes.
- Configuración existente preservada, incluidos correo, cifrado, base, Redis y MercadoPago; se ajustaron los límites de autenticación. No se agregaron secretos a Git.
- Se verificó `DB_SYNC=false`, 14 migraciones aplicadas, ninguna pendiente y cero trabajos outbox pendientes tras la publicación. El contenedor reportó `healthy`, sin reinicios.
- Migraciones nuevas: `SubscriptionInvariants1794943380000` y `PaymentChargebackStatus1794945300000`. La segunda agrega un valor al enum y no admite borrarlo automáticamente en un downgrade. El rollback de la aplicación puede conservarlo.
- Respaldo previo: `/home/facu/eventlife-backups/eventlife_db-20261117T200801Z-81092.dump`, permisos privados y archivo de hash. No restaurar encima de producción sin un procedimiento de recuperación explícito.
- Herramienta de respaldo: `Backend/scripts/backup-postgres.sh`. Exige nombre de base explícito, usa bloqueo para evitar solapamientos y no elimina respaldos automáticamente. Instalada de forma privada en `/home/facu/eventlife-ops/backup-postgres.sh`; cron diario a las 05:20 UTC (02:20 ART), conservando los trabajos existentes. También se ejecutó un respaldo después de las migraciones.
- Herramienta de cifrado local: `Backend/scripts/protect-backup.ps1`, PowerShell 7 en Windows. La recuperación de la clave depende del perfil DPAPI del usuario; no reemplaza un destino externo de respaldo con recuperación independiente.

## Límites y pendientes operativos

1. Rotar coordinadamente las credenciales compartidas en el chat, especialmente MercadoPago, correo, Redis y acceso al servidor. No se cambiaron credenciales de cuentas externas ni SSH mientras el titular estaba ausente, para evitar pérdida de acceso o interrupción de integraciones.
2. Verificar firewall/router y limitar exposición de PostgreSQL y Portainer. Docker publica esos puertos en el host; eso no demuestra exposición pública. El túnel de la API usa una red diferente, por lo que quitar el puerto de la API sin verificar su ruta puede cortar producción.
3. Completar un pago y una suscripción reales supervisados desde la interfaz, incluyendo notificación originada en MercadoPago. Los webhooks firmados de tema ignorado prueban firma y conectividad, no ese recorrido financiero completo.
4. Definir retención y un destino externo automatizado para respaldos. La copia sin cifrar al equipo local fue rechazada por la revisión automática de permisos; no se transfirió el dump. El respaldo y la prueba de restauración del servidor sí se completaron.
5. Revisar frontend en la próxima sesión, como pidió el usuario. La respuesta comercial de eliminación de evento y los códigos estables del scanner pueden requerir mensajes específicos en esa interfaz.
