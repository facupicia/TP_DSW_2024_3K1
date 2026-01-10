# Refactorización V2 - Lógica de Tickets y Pagos

## 1. Cambios en Entidades

### Event
- Se han eliminado los campos `price`, `stock`, `capacity`, `soldCount` directos.
- Ahora la gestión de capacidad y precios se delega en `TicketType`.

### TicketType (Nueva/Actualizada)
- **Campos**:
  - `price`: Precio unitario.
  - `capacity`: Capacidad total para este tipo de entrada.
  - `soldCount`: Cantidad de entradas vendidas.
  - `eventId`: Relación con el evento.
  - `active`: Si está disponible para la venta.

### Ticket
- **Campos**:
  - `ticketTypeId`: Relación con el tipo de entrada.
  - `status`: `ACTIVE`, `USED`, `CANCELLED`.
  - `qrCode`: URL del código QR.
  - `purchasePrice`: Precio al momento de la compra (histórico).
  - `usedAt`: Fecha de uso.
  - `scannedById`: Usuario que escaneó el ticket.

### PaymentLog
- Se añadió `ticketTypeId` para trazabilidad exacta de qué se compró.

## 2. Nueva Lógica de Negocio (Flujo de Compra)

1. **Selección**: El usuario selecciona un `TicketType` en el frontend.
2. **Preferencia (Backend)**: 
   - Endpoint: `POST /api/payment/create-preference`
   - Body: `{ ticketTypeId: number, ticketQuantity: number }`
   - El backend valida el stock (`capacity - soldCount`) del `TicketType`.
   - Genera la preferencia en Mercado Pago con el precio del `TicketType`.
   - `external_reference` format: `USER_ID|TICKET_TYPE_ID|QUANTITY`.
3. **Pago**: El usuario paga en Mercado Pago.
4. **Confirmación (Webhook)**:
   - Endpoint: `POST /api/payment/webhook`
   - Recibe notificación de pago aprobado.
   - Extrae `ticketTypeId` y `quantity`.
   - **Transacción Atómica**:
     - Verifica stock nuevamente (con bloqueo o update atómico).
     - Incrementa `TicketType.soldCount`.
     - Crea los registros `Ticket` con estado `ACTIVE`.
     - Genera QRs y envía correo.

## 3. Endpoints Actualizados

### POST `/api/payment/create-preference`
- **Antes**: Recibía `eventId`.
- **Ahora**: Requiere `ticketTypeId`.
- **Respuesta**: `{ id: string, init_point: string }`.

### POST `/api/tickets/buy/:id`
- **Cambio**: Restringido solo a administradores (`admin`).
- **Motivo**: Prohibir creación de tickets sin flujo de pago confirmado para usuarios finales.

## 4. Guía de Migración

### Base de Datos
Ejecutar el script SQL ubicado en `Backend/sql/migration_v2.sql` para aplicar los cambios estructurales.

```sql
-- Ejemplo parcial
CREATE TABLE "ticket_type" (...);
ALTER TABLE "ticket" ADD COLUMN "ticketTypeId" INTEGER;
-- ...
```

### Frontend
1. Actualizar las llamadas a `create-preference` para enviar `ticketTypeId` en lugar de `eventId`.
2. Mostrar precios y stock basados en la lista de `ticketTypes` del evento, no en el evento mismo.

## 5. Auditoría y Logs
- Cada pago genera un `PaymentLog` con el estado (`PROCESSING`, `COMPLETED`, `FAILED`).
- Si falla por stock en el webhook, queda registrado como `FAILED` y se loguea `WEBHOOK_NO_STOCK_ATOMIC`.
