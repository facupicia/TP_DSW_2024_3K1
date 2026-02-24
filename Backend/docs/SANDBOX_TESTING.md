# Guía de Testing en Modo Sandbox

## ¿Qué es el modo sandbox?

El modo sandbox te permite probar **toda la integración** con MercadoPago sin usar dinero real ni afectar datos de producción.

## Activar Modo Sandbox

### Opción 1: Token de TEST (Recomendado)

```bash
# Usar credenciales de sandbox de tu cuenta de MP
MP_ACCESS_TOKEN=TEST-123456789...
MP_ACCESS_TOKEN_SUSCRIPCION=TEST-987654321...
```

### Opción 2: Forzar sandbox con token de producción

Si querés probar con la misma app de producción pero en modo sandbox:

```bash
# Forzar modo sandbox (útil para testing con APP_USR tokens)
MP_FORCE_SANDBOX_MODE=true

# Ahora podés usar tokens de producción pero con comportamiento de sandbox
MP_ACCESS_TOKEN=APP_USR-...
```

## ¿Qué cambia en modo sandbox?

| Funcionalidad | Producción | Sandbox |
|--------------|------------|---------|
| **URLs de pago** | www.mercadopago.com | sandbox.mercadopago.com |
| **Validación de IP** | Solo IPs de MP | Cualquier IP |
| **Validación de firma** | Requiere secret | Opcional |
| **Rate limiting** | 30 req/min | Más relajado |
| **Pagos** | Dinero real | Dinero ficticio |
| **Webhooks** | Desde IPs de MP | Desde cualquier IP (ngrok) |

## Testing con ngrok

### 1. Instalar ngrok
```bash
npm install -g ngrok
# o
download from https://ngrok.com/download
```

### 2. Iniciar ngrok
```bash
ngrok http 3000
```

### 3. Copiar la URL HTTPS
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

### 4. Configurar webhooks en MP Dashboard

**Para pagos:**
- URL: `https://abc123.ngrok.io/api/payment/webhook`
- Dejar "Secret" vacío (sandbox lo ignora)

**Para suscripciones:**
- URL: `https://abc123.ngrok.io/api/subscription/webhook`
- Dejar "Secret" vacío

### 5. Actualizar .env
```bash
MP_NOTIFICATION_URL=https://abc123.ngrok.io/api/payment/webhook
MP_SUBSCRIPTION_BACK_URL=https://abc123.ngrok.io
```

## Flujo de Testing Completo

### 1. Pago de Tickets (Marketplace)

```bash
# 1. Crear preferencia
POST http://localhost:3000/api/payment/create-preference
Authorization: Bearer <tu-jwt>
Body: {
    "ticketTypeId": 1,
    "ticketQuantity": 2
}

# Response:
{
    "id": "123456789-abcdef",
    "init_point": "https://sandbox.mercadopago.com/...",
    "marketplace": true
}
```

```bash
# 2. Abrir init_point en navegador
# 3. Completar pago con tarjetas de prueba:
#    Visa: 4509 9535 6623 3704
#    CVV: 123
#    Exp: 12/25
#    Nombre: APRO (para aprobar) OTHE (para rechazar)
```

```bash
# 4. Verificar webhook recibido
# En logs deberías ver:
{"level":"info","msg":"MP_WEBHOOK_RECEIVED","type":"payment",...}
{"level":"info","msg":"PAYMENT_PROCESSED_SUCCESS","ticketsCreated":2,...}
```

### 2. Suscripción a Plan

```bash
# 1. Crear checkout de suscripción
POST http://localhost:3000/api/subscription/checkout/2
Authorization: Bearer <tu-jwt>
Body: {
    "billingType": "monthly"
}

# Response:
{
    "checkoutUrl": "https://sandbox.mercadopago.com/...",
    "preapprovalId": "2c938084...",
    "message": "Redirige al usuario a checkoutUrl"
}
```

```bash
# 2. Usuario paga en checkout URL
# 3. MP envía webhook (automático en sandbox)
```

```bash
# 4. Verificar webhook recibido
{"level":"info","msg":"SUBSCRIPTION_WEBHOOK_RECEIVED",...}
{"level":"info","msg":"SUBSCRIPTION_ACTIVATED",...}
```

### 3. OAuth de Organizador

```bash
# 1. Iniciar OAuth
GET http://localhost:3000/api/payment/mp/connect
Authorization: Bearer <tu-jwt>

# Response:
{
    "authUrl": "https://auth.mercadopago.com/authorization?..."
}
```

```bash
# 2. Abrir authUrl en navegador
# 3. Autorizar con cuenta de sandbox de MP
# 4. Redirige a: http://localhost:4200/perfil?mp_connected=true
```

## Tarjetas de Prueba

| Marca | Número | CVV | Expiración | Resultado |
|-------|--------|-----|------------|-----------|
| Visa | 4509 9535 6623 3704 | 123 | 12/25 | APRO (aprobado) |
| Visa | 4509 9535 6623 3704 | 123 | 12/25 | OTHE (rechazado) |
| Mastercard | 5031 7557 3453 0604 | 123 | 12/25 | APRO |
| Amex | 3711 8030 3257 522 | 1234 | 12/25 | APRO |

**Nombre del titular:**
- `APRO` → Pago aprobado
- `OTHE` → Rechazado (otros)
- `CONT` → Pago pendiente (contracargo)

## Simular Webhooks Manualmente

Si querés probar el webhook sin hacer un pago real:

```bash
# Simular webhook de pago aprobado
curl -X POST http://localhost:3000/api/payment/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment",
    "data": {
      "id": "1234567890"
    }
  }'

# Simular webhook de suscripción
curl -X POST http://localhost:3000/api/subscription/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "preapproval",
    "data": {
      "id": "2c938084..."
    }
  }'
```

En modo sandbox, estos webhooks se aceptarán sin validar IP ni firma.

## Debug en Sandbox

### Activar logs detallados
```bash
# En .env
DEBUG_MP=true
LOG_LEVEL=debug
```

### Ver tokens encriptados
```bash
# En modo sandbox, podés verificar que la encriptación funciona:
SELECT id, mp_access_token FROM "user" WHERE mp_access_token IS NOT NULL;

# Debería ser: {"encrypted":"...","iv":"...","authTag":"..."}
# NO debería ser: TEST-123...
```

### Verificar estado de MP
```bash
GET http://localhost:3000/api/payment/mp/status
Authorization: Bearer <tu-jwt>

# Response:
{
    "connected": true,
    "mpUserId": "123456789",
    "expiresAt": "2025-08-24T10:30:00.000Z",
    "needsReconnect": false
}
```

## Verificar Suscripción Activa

```bash
GET http://localhost:3000/api/subscription/my-subscription
Authorization: Bearer <tu-jwt>

# Response:
{
    "plan": {
        "name": "PRO",
        "commissionPercent": 3.00
    },
    "status": "active",
    "currentPeriodEnd": "2025-03-24T10:30:00.000Z"
}
```

## Verificar Límites del Plan

```bash
GET http://localhost:3000/api/subscription/my-limits
Authorization: Bearer <tu-jwt>

# Response:
{
    "plan": { "name": "FREE", ... },
    "limits": {
        "maxEventsPerMonth": 3,
        "eventsCreatedThisMonth": 1,
        "eventsRemaining": 2
    }
}
```

## Cambiar a Producción

Cuando todo funcione en sandbox:

```bash
# 1. Desactivar modo sandbox
MP_FORCE_SANDBOX_MODE=false  # o eliminar la línea

# 2. Cambiar a tokens de producción
MP_ACCESS_TOKEN=APP_USR-...
MP_ACCESS_TOKEN_SUSCRIPCION=APP_USR-...

# 3. Configurar webhook secrets
MP_WEBHOOK_SECRET=tu-secret-de-produccion
MP_SUBSCRIPTION_WEBHOOK_SECRET=tu-secret-de-produccion

# 4. Actualizar URLs a producción
MP_NOTIFICATION_URL=https://backend-eventlife.onrender.com/api/payment/webhook
MP_SUBSCRIPTION_BACK_URL=https://backend-eventlife.onrender.com

# 5. Configurar webhooks en dashboard de MP con URLs de producción
```

## Troubleshooting Sandbox

### "Invalid IP" en webhooks

**Problema:** En desarrollo sin ngrok.

**Solución:** Modo sandbox permite cualquier IP automáticamente.

### "Invalid signature" en webhooks

**Problema:** Enviando webhooks de prueba.

**Solución:** En sandbox sin secret configurado, se salteará la validación.

### "Organizer MP not linked"

**Problema:** El organizador no conectó su cuenta de MP.

**Solución:**
1. Organizador va a Perfil → Conectar MercadoPago
2. Completa OAuth con cuenta de sandbox
3. Verificar con GET /api/payment/mp/status

### No llegan los webhooks

**Verificar:**
1. ¿Está corriendo ngrok? `ngrok http 3000`
2. ¿La URL del webhook está bien configurada en MP?
3. ¿Los logs muestran "MP_WEBHOOK_RECEIVED"?
4. ¿El servidor está corriendo? `npm run dev`

### "TEST token not allowed"

**Problema:** Intentando usar token de TEST en producción.

**Solución:** Cambiar a token de producción (APP_USR-...).

---

## Checklist de Testing

Antes de pasar a producción, verificar:

- [ ] Crear preferencia de pago funciona
- [ ] Pago con tarjeta aprobada funciona
- [ ] Pago con tarjeta rechazada maneja error
- [ ] Webhook de pago crea tickets
- [ ] Email con tickets se envía
- [ ] Stock se actualiza correctamente
- [ ] OAuth de organizador funciona
- [ ] Crear checkout de suscripción funciona
- [ ] Webhook de suscripción activa plan
- [ ] Cancelar suscripción funciona
- [ ] Verificar límites de plan funciona
- [ ] Bloqueo por exceso de eventos funciona
- [ ] Comisiones se calculan correctamente
