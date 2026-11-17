# Correcciones verificadas — 17 de noviembre de 2026

Revisión local de seguridad, errores y consumo de recursos. Se conservaron los cambios que ya existían en el checkout. No se modificaron dependencias, esquemas ni servicios externos.

## Comportamientos corregidos

| Caso | Corrección | Evidencia |
|---|---|---|
| Reclamo de cuenta con un token de recuperación de contraseña | El consumo exige `purpose: 'claim'`; no consume tokens de reset. | Regresión con token de reset para una cuenta guest. |
| Validación de enlaces anteriores a un cambio de credenciales | La consulta de validez compara `credentialsVersion` con la del usuario, igual que el consumo. | Rechazo de enlace anterior; un enlace vigente sigue siendo utilizable una única vez. |
| Cookie refresh con percent-encoding inválido o un valor excesivo | Se rechaza sin lanzar `URIError` ni acceder a la base; logout sigue limpiando la cookie. | Cookies truncadas, vacías y mayores de 512 caracteres. |
| Email de invitación con varias entradas | `In(ticketIds)` genera el filtro de TypeORM correcto. Se retiraron repositorios e imports sin uso. | SQL generado por TypeORM ejecutado en PGlite: incluye las dos entradas solicitadas y excluye una tercera. |
| Error al guardar un reintento de outbox mientras otros trabajos siguen activos | El lote espera todos sus handlers antes de terminar y propaga el error de persistencia. El timer no libera prematuramente su control de concurrencia. | Un handler bloqueado y otro con fallo de persistencia; el lote permanece activo hasta liberar al primero. |
| Contexto circular y nombres alternativos de claves sensibles en logs | El recorrido detecta referencias circulares y normaliza mayúsculas y separadores de claves antes de ocultarlas. Conserva fechas, filtrado por nivel y datos originales. | Contexto circular, arrays, claves como `ACCESSTOKEN`, `api_key` y `current_password`, y control de no mutación. |

## Pruebas y verificación

Las garantías se derivaron de la revisión del código, sin un plan externo.

- RED: `node --test tests/hardening.test.cjs`, desde `Backend`, ejecutó seis reproducciones y las seis fallaron por los errores descritos. La invitación produjo `22P02: invalid input syntax for type integer: "1,2"`; el logger produjo `Maximum call stack size exceeded`.
- GREEN: se corrigieron los cinco módulos de producción y las seis reproducciones pasaron. Se agregaron dos controles de comportamiento válido: consumo único de claim y contexto ordinario del logger.
- Suite completa: `npm test`, desde `Backend`: **33/33 aprobadas**, sin omisiones. Incluye las 25 regresiones anteriores y ocho casos nuevos en `Backend/tests/hardening.test.cjs`.
- Compilación: `npm run build`, desde `Backend`: **aprobada**.
- Revisión de whitespace: `git diff --check`: **aprobada**.
- Revisión de seguridad de los cambios: filtros ORM, validación antes del acceso a datos, conservación de revocación de sesiones, deduplicación y leases revisados. No se alteraron firmas de webhook ni el flujo de devolución.

El helper de pruebas permite sustituir el módulo TypeORM cuando un caso necesita sus operadores reales, manteniendo los dobles existentes como valor predeterminado.

## Alcance y límites

No hay script de lint ni medición de cobertura TypeScript configurada para este runner basado en transpilar módulos dentro de una VM; no se afirma un porcentaje de cobertura. Los proveedores externos se simulan. No se ejecutaron pruebas contra la base configurada, cobros, envíos reales, frontend ni despliegue: esta tanda modifica exclusivamente backend y pruebas aisladas.

La aceptación en hosting no se evaluó. Los cambios quedan locales, sin commits de checkpoint para no mezclar la amplia tanda de cambios preexistentes del checkout. Las reproducciones RED y su posterior resultado GREEN quedan preservados en este documento y en las pruebas.
