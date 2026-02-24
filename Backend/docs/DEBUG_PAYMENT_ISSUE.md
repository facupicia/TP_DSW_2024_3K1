# Diagnóstico de Problema: Pagos sin Tickets

## Problema
El dinero se descuenta y llega al comprador, pero los tickets no se registran en el sistema.

## Pasos de Diagnóstico

### 1. Verificar que el webhook llega al backend

Revisa los logs del backend después de hacer un pago. Deberías ver:

```
{"level":"info","msg":"WEBHOOK_RECEIVED","paymentId":"1234567890",...}
```

**Si NO ves este log:**
- El webhook no está configurado correctamente en MercadoPago
- La URL del webhook es incorrecta
- El servidor no está accesible desde internet (usar ngrok en desarrollo)

**Solución:**
1. Verificar en Dashboard de MP que el webhook está configurado:
   - URL: `https://tu-backend.com/api/payment/webhook`
   - Eventos: `payment`
2. Si estás en desarrollo, usar ngrok:
   ```bash
   ngrok http 3000
   # Actualizar la URL del webhook en MP Dashboard con la URL de ngrok
   ```

### 2. Verificar que el webhook se procesa

Si ves `WEBHOOK_RECEIVED` pero no ves `WEBHOOK_PAYMENT_PROCESSED`, el problema está en el procesamiento.

Revisa si hay errores como:
```
{"level":"error","msg":"WEBHOOK_PAYMENT_FAILED",...}
{"level":"error","msg":"PAYMENT_PROCESS_ERROR",...}
```

### 3. Probar el endpoint de simulación

Usa el nuevo endpoint de prueba para verificar que el flujo funciona:

```bash
# En desarrollo/sandbox
POST http://localhost:3000/api/payment/test-webhook
Authorization: Bearer <tu-token>
Content-Type: application/json

{
    "paymentId": "TEST_123",
    "externalReference": "1|1|2|1"
}
```

**Response exitosa:**
```json
{
    "success": true,
    "message": "Pago procesado correctamente (simulación)",
    "ticketsCreated": 2,
    "logId": 123
}
```

**Si esto funciona:** El problema está en que el webhook de MP no llega.

**Si esto falla:** Hay un problema en el código de procesamiento.

### 4. Verificar external_reference

El backend espera el formato: `userId|ticketTypeId|quantity|organizerId`

Revisa en los logs que el external_reference se está enviando correctamente:
```
{"level":"info","msg":"PREFERENCE_CREATED","externalRef":"1|5|2|3"}
```

### 5. Verificar en la base de datos

```sql
-- Ver logs de pago
SELECT * FROM payment_log ORDER BY created_at DESC LIMIT 5;

-- Ver tickets creados recientemente
SELECT * FROM ticket ORDER BY created_at DESC LIMIT 5;

-- Ver tickets de un usuario específico
SELECT * FROM ticket WHERE user_id = 1 ORDER BY created_at DESC;
```

### 6. Logs específicos a buscar

**Éxito:**
```
PREFERENCE_CREATED
WEBHOOK_RECEIVED
PAYMENT_PROCESSED_SUCCESS
TICKETS_CREATED
TICKET_EMAIL_SENT
```

**Error:**
```
WEBHOOK_PAYMENT_FAILED
PAYMENT_PROCESS_ERROR
PAYMENT_EXTRACTION_FAILED
PAYMENT_NO_STOCK
PAYMENT_AMOUNT_MISMATCH
```

## Posibles Causas y Soluciones

### Causa 1: Webhook no llega

**Síntomas:** No hay logs de `WEBHOOK_RECEIVED`

**Solución:**
- Configurar webhook en MP Dashboard
- Usar ngrok en desarrollo
- Verificar que el servidor está accesible

### Causa 2: Webhook llega pero no se procesa

**Síntomas:** Hay `WEBHOOK_RECEIVED` pero no `WEBHOOK_PAYMENT_PROCESSED`

**Solución:**
- Revisar errores en logs
- Verificar que el `paymentId` se extrae correctamente
- El topic/type debe ser 'payment'

### Causa 3: Error en procesamiento

**Síntomas:** Hay `WEBHOOK_PAYMENT_FAILED` o `PAYMENT_PROCESS_ERROR`

**Solución:**
- Revisar el mensaje de error específico
- Verificar que el usuario y ticket type existen
- Verificar que hay stock disponible

### Causa 4: External reference incorrecto

**Síntomas:** `PAYMENT_EXTRACTION_FAILED`

**Solución:**
- Verificar formato: `userId|ticketTypeId|quantity|organizerId`
- Verificar que los IDs existen en la base de datos

## Script de Prueba Rápida

```bash
# 1. Crear preferencia (debe retornar init_point)
curl -X POST http://localhost:3000/api/payment/create-preference \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticketTypeId": 1, "ticketQuantity": 2}'

# 2. Simular webhook (para probar sin pagar)
curl -X POST http://localhost:3000/api/payment/test-webhook \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "TEST_123", "externalReference": "1|1|2|1"}'

# 3. Verificar tickets del usuario
curl http://localhost:3000/api/ticket/1 \
  -H "Authorization: Bearer $TOKEN"
```

## Variables de Entorno Importantes

```bash
# Para ver logs detallados
LOG_LEVEL=debug
DEBUG_MP=true

# Para sandbox
MP_FORCE_SANDBOX_MODE=true
NODE_ENV=development
```

## Contacto

Si después de seguir estos pasos el problema persiste, revisa:
1. Los logs completos del backend
2. La configuración de webhooks en MP Dashboard
3. Que la base de datos esté funcionando correctamente
