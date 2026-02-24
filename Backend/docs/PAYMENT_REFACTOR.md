# Payment & Subscription Refactor

Documentación de las mejoras realizadas en los módulos de pagos y suscripciones.

## 📋 Resumen de Cambios

### Seguridad Mejorada

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Tokens MP en DB** | Texto plano | Encriptados con AES-256-GCM |
| **State OAuth** | Base64 simple | Firmado HMAC-SHA256 con timestamp |
| **Webhooks** | Sin validación | Validación de IP + firma |
| **Variables env** | Sin validación | Validación obligatoria al inicio |
| **Rate limiting** | Global únicamente | + Rate limit específico para webhooks |

### Arquitectura Mejorada

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Lógica de negocio** | En controllers | Servicios especializados |
| **Funciones** | Muy largas (~240 líneas) | Pequeñas y enfocadas |
| **Manejo de errores** | Inconsistente | Centralizado con logger |
| **Transacciones** | En controller | En service core |
| **Tipos** | Muchos `any` | Interfaces definidas |

## 🔐 Nuevas Variables de Entorno

```bash
# Obligatoria - Encriptación de tokens MP
ENCRYPTION_KEY=your-64-character-hex-encryption-key

# Recomendada - Verificación de webhooks
MP_WEBHOOK_SECRET=your-webhook-secret-from-mp-dashboard

# Opcional - Token separado para suscripciones
MP_ACCESS_TOKEN_SUSCRIPCION=...
```

## 📁 Estructura de Archivos

```
Backend/src/
├── payment/
│   ├── mp.config.ts              # Configuración centralizada de MP
│   ├── mp-webhook.middleware.ts  # Validación de webhooks
│   ├── payment.core.ts           # Lógica central de pagos
│   ├── preference.service.ts     # Creación de preferencias
│   ├── payment.controller.ts     # Controller refactorizado
│   ├── mp-oauth.controller.ts    # OAuth con encriptación
│   └── payment.routes.ts         # Rutas con middlewares
│
├── subscription/
│   ├── subscription.core.ts      # Lógica central de suscripciones
│   ├── subscription.controller.ts # Controller refactorizado
│   └── subscription.routes.ts    # Rutas con middlewares
│
└── common/services/
    └── encryption.ts             # Servicio de encriptación AES-256-GCM
```

## 🔒 Seguridad Implementada

### 1. Encriptación de Tokens

Los tokens de MercadoPago (`mpAccessToken`, `mpRefreshToken`) ahora se almacenan encriptados:

```typescript
// Guardar
const encrypted = encryptToString(accessToken);
await userRepo.update(userId, { mpAccessToken: encrypted });

// Leer
const decrypted = decryptFromString(user.mpAccessToken);
```

**Algoritmo:** AES-256-GCM con auth tag para integridad.

### 2. Validación de Webhooks

```typescript
// Middleware en rutas
router.post(
    "/webhook",
    validateMPWebhookIP,           // Solo IPs de MP
    validateMPWebhookSignature,    // Verificar firma
    paymentWebhook
);
```

**IPs permitidas:**
- 18.229.206.29
- 18.231.79.223
- 35.167.59.33
- 50.16.248.122
- 52.11.176.35
- 52.67.2.252
- 52.67.44.67

**Rate limit:** 30 requests/minuto por IP.

### 3. State OAuth Firmado

```typescript
// Generar
const state = generateOAuthState(userId);
// Contiene: { userId, ts } + firma HMAC

// Verificar
const data = verifyOAuthState(state);
// Rechaza si: firma inválida, expiró (>15min), o fue alterado
```

### 4. Validación de Montos

```typescript
// Verifica que el monto pagado coincida con lo esperado
const expectedTotal = ticketType.price * quantity;
const paidAmount = payment.transaction_amount;

if (Math.abs(paidAmount - expectedTotal) > tolerance) {
    logger.error('PAYMENT_AMOUNT_MISMATCH', { expected, paid });
}
```

## ⚙️ Servicios Core

### Payment Core (`payment.core.ts`)

Responsabilidades:
- Obtener datos de pagos de MP
- Extraer información de external_reference
- Validar y actualizar stock
- Crear tickets y logs
- Garantizar idempotencia

### Preference Service (`preference.service.ts`)

Responsabilidades:
- Validar elegibilidad de compra
- Calcular comisiones del marketplace
- Construir payload de preferencia
- Crear preferencia en MP

### Subscription Core (`subscription.core.ts`)

Responsabilidades:
- Crear checkouts de suscripción
- Procesar webhooks de suscripción
- Calcular fechas de período
- Gestionar estados de suscripción

## 🔄 Flujo de Pago (Refactorizado)

```
1. Frontend → POST /api/payment/create-preference
   └─→ PreferenceService.validatePurchaseEligibility()
   └─→ PreferenceService.createMercadoPagoPreference()
   └─→ Retorna init_point

2. Usuario → Paga en MercadoPago

3. MP → POST /api/payment/webhook
   └─→ validateMPWebhookIP()
   └─→ validateMPWebhookSignature()
   └─→ PaymentController.paymentWebhook()
   └─→ PaymentCore.waitForPaymentApproval()
   └─→ PaymentCore.processApprovedPayment()
       └─→ Extraer info del pago
       └─→ Validar stock
       └─→ Actualizar stock atómicamente
       └─→ Crear tickets
       └─→ Guardar log de pago
       └─→ Enviar email (async)
```

## 🧪 Testing

Para probar los cambios:

```bash
# 1. Generar ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Agregar al .env
ENCRYPTION_KEY=...

# 3. Iniciar servidor
npm run dev

# 4. Verificar que no hay errores de configuración
# Debería ver: "MP Config validated successfully"
```

## ⚠️ Migración de Datos Existentes

Los tokens existentes en texto plano seguirán funcionando (el sistema intenta desencriptar y si falla, usa el valor original). Para migrar:

```typescript
// Script de migración (ejecutar una vez)
const users = await userRepo.find({ where: { mpAccessToken: Not(IsNull()) } });

for (const user of users) {
    if (user.mpAccessToken && !user.mpAccessToken.startsWith('{')) {
        // Token en texto plano, encriptar
        const encrypted = encryptToString(user.mpAccessToken);
        await userRepo.update(user.id, { mpAccessToken: encrypted });
    }
}
```

## 📊 Logs y Monitoreo

Todos los eventos importantes ahora tienen logging estructurado:

```json
{"level":"info","msg":"PAYMENT_PROCESSED_SUCCESS","time":"2024-...","paymentId":"123","logId":456,"ticketsCreated":2}
{"level":"warn","msg":"PAYMENT_AMOUNT_MISMATCH","time":"2024-...","paymentId":"123","expected":1000,"paid":950}
{"level":"error","msg":"MP_WEBHOOK_INVALID_SIGNATURE","time":"2024-...","ip":"192.168.1.1"}
```

## 🔧 Configuración de MercadoPago

### Configurar Webhook en Dashboard de MP

1. Ir a: https://www.mercadopago.com.ar/developers/panel/app
2. Seleccionar tu aplicación
3. Webhooks → Agregar webhook
4. URL: `https://backend-eventlife.onrender.com/api/payment/webhook`
5. Eventos: `payment`, `preapproval`
6. Secret (opcional pero recomendado): Generar y guardar en `MP_WEBHOOK_SECRET`

### Configurar OAuth App

1. Ir a: https://www.mercadopago.com.ar/developers/panel/app
2. Credenciales → OAuth 2.0
3. Redirect URI: `https://backend-eventlife.onrender.com/api/payment/mp/callback`
4. Copiar Client ID y Client Secret a las variables de entorno

## 🚀 Deployment Checklist

- [ ] Generar `ENCRYPTION_KEY` de 64 caracteres hex
- [ ] Configurar `MP_WEBHOOK_SECRET` en MP y en env
- [ ] Verificar `MP_CLIENT_ID` y `MP_CLIENT_SECRET`
- [ ] Configurar URLs de webhooks en dashboard de MP
- [ ] Probar flujo de OAuth en desarrollo
- [ ] Probar webhook de pagos con ngrok
- [ ] Probar webhook de suscripciones
- [ ] Verificar que los emails se envían
- [ ] Monitorear logs en Render

## 📞 Soporte

Si encuentras problemas:

1. Verificar logs con `LOG_LEVEL=debug`
2. Confirmar que todas las variables de entorno están configuradas
3. Verificar que las IPs de MP no están bloqueadas por firewall
4. Confirmar que el webhook secret coincide entre MP y el backend
