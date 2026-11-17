# Backend: revisión de negocio y seguridad

Inicio: 17/11/2026, 16:01 ART. Alcance pedido: backend; frontend queda para otra sesión.

## Ciclo de trabajo

Revisar invariantes → reproducir en prueba aislada → guardar RED → corregir → verificar GREEN → revisar seguridad y diff. No ejecutar cobros ni devoluciones reales. No usar la base productiva para pruebas destructivas. Preservar outbox transaccional, firmas de webhook, reservas y migraciones explícitas.

## Matriz de revisión

| Flujo | Garantías a revisar | Estado |
|---|---|---|
| Escáner de entradas y extras | permisos por organizador, estados, ventana temporal, código inválido, un solo canje concurrente | En revisión |
| Equipo de escáneres | asignación, baja, reactivación, aislamiento entre organizadores | Pendiente |
| Catálogo y extras por evento | propiedad, plan, validación, stock, baja y modificaciones | En revisión |
| Checkout mixto | cantidades, precios congelados, descuento, reserva, evento único y stock concurrente | Pendiente |
| Confirmación de pago | autenticidad, importe, idempotencia, tickets/extras, entrega durable | Pendiente |
| Devolución | cancelación única, stock por cantidad, canje previo, reintento del proveedor | Pendiente |
| Suscripciones | límites de plan, estados del proveedor, autorización y duplicados | Pendiente |
| Usuarios y sesiones | roles, cambio de credenciales, recuperación, propiedad y CSRF | Pendiente |
| Eventos, entradas, cupones y RRPP | permisos, fechas, límites y consistencia comercial | Pendiente |
| Operación | límites, configuración, worker, migraciones, build y release | Pendiente |

## Línea base

`npm test` en Backend: 45/45 aprobadas, sin servicios externos. Rama de trabajo: `codex/backend-business-hardening-20261117`. ECC no aparece en el inventario del CLI; se usan las guías locales disponibles de continuous-agent-loop, tdd-workflow, security-review y verification-loop.

Los resultados y las brechas se registrarán en un informe de evidencia al cerrar la revisión. Una prueba con proveedores simulados no acredita una compra real ni la entrega del webhook desde MercadoPago.
