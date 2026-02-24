# Guía de Webhook Secrets

## ¿Por qué secrets separados?

Si tenés **integraciones separadas** en MercadoPago (una para marketplace/pagos y otra para suscripciones), cada una tiene su propio **Webhook Secret** para verificar la autenticidad de las notificaciones.

## Configuración

### Opción 1: Misma App de MP (Simple)

Usás una sola aplicación de MercadoPago para todo:

```env
# Backend/.env
MP_ACCESS_TOKEN=APP_USR-xxx
MP_CLIENT_ID=xxx
MP_CLIENT_SECRET=xxx
MP_WEBHOOK_SECRET=secret-unico
```

**Webhooks configurados en MP Dashboard:**
- `POST https://tusitio.com/api/payment/webhook`
- `POST https://tusitio.com/api/subscription/webhook`

**Ambos usan el mismo secret.**

---

### Opción 2: Apps Separadas (Recomendado)

Tenés dos aplicaciones distintas en MP:

#### App 1: Marketplace (Pagos de Tickets)
```env
# Backend/.env
MP_ACCESS_TOKEN=APP_USR-xxx-marketplace
MP_CLIENT_ID=xxx-marketplace
MP_CLIENT_SECRET=xxx-marketplace
MP_WEBHOOK_SECRET=secret-marketplace
```

**Webhook:**
- URL: `https://tusitio.com/api/payment/webhook`
- Secret: `secret-marketplace`

#### App 2: Suscripciones (Pagos Recurrentes)
```env
# Backend/.env
MP_ACCESS_TOKEN_SUSCRIPCION=APP_USR-xxx-suscripciones
MP_SUBSCRIPTION_WEBHOOK_SECRET=secret-suscripciones
```

**Webhook:**
- URL: `https://tusitio.com/api/subscription/webhook`
- Secret: `secret-suscripciones`

---

## Cómo funciona el código

```typescript
// Backend/src/payment/mp.config.ts
export interface MPConfig {
    webhookSecret?: string;              // Usado para /api/payment/webhook
    subscriptionWebhookSecret?: string;  // Usado para /api/subscription/webhook
}

// En la validación:
const webhookSecret = type === 'subscription' 
    ? config.subscriptionWebhookSecret  // Intenta usar el de suscripciones
    : config.webhookSecret;             // Usa el de pagos

// Si subscriptionWebhookSecret no está definido, 
// usa webhookSecret como fallback
```

---

## Flujo de validación

```
[MP] → POST /api/payment/webhook
            ↓
    ┌─────────────────────┐
    │ validateMPWebhookIP │  ← Verifica IP de MP
    └─────────────────────┘
            ↓
    ┌─────────────────────────────┐
    │ createValidateMPWebhookSignature('payment') │
    │                             │
    │  1. Lee MP_WEBHOOK_SECRET   │
    │  2. Valida X-Signature      │
    │  3. Rechaza si inválida     │
    └─────────────────────────────┘
            ↓
    [Procesa el pago]

[MP] → POST /api/subscription/webhook
            ↓
    ┌─────────────────────┐
    │ validateMPWebhookIP │  ← Verifica IP de MP
    └─────────────────────┘
            ↓
    ┌─────────────────────────────┐
    │ createValidateMPWebhookSignature('subscription') │
    │                             │
    │  1. Lee MP_SUBSCRIPTION_WEBHOOK_SECRET │
    │     (o MP_WEBHOOK_SECRET si no existe) │
    │  2. Valida X-Signature      │
    │  3. Rechaza si inválida     │
    └─────────────────────────────┘
            ↓
    [Procesa la suscripción]
```

---

## Ejemplos de Logs

### Validación exitosa:
```json
{"level":"info","msg":"MP_WEBHOOK_RECEIVED","type":"payment","hasSignature":true,"hasSecret":true}
{"level":"info","msg":"MP_WEBHOOK_SIGNATURE_VALID","type":"payment"}
```

### Validación fallida (firma incorrecta):
```json
{"level":"error","msg":"MP_WEBHOOK_INVALID_SIGNATURE","type":"payment","received":"abc123","expected":"xyz789"}
```

### Sin secret configurado:
```json
{"level":"info","msg":"MP_WEBHOOK_RECEIVED","type":"subscription","hasSignature":true,"hasSecret":false}
```
> En este caso, la validación de firma se omite y se procesa igual (menos seguro).

---

## Troubleshooting

### Error: "Invalid signature" en suscripciones pero pagos funcionan

**Causa:** Tenés apps separadas pero solo configuraste `MP_WEBHOOK_SECRET`.

**Solución:**
```env
# Agregar el secret de suscripciones
MP_SUBSCRIPTION_WEBHOOK_SECRET=tu-secret-de-suscripciones
```

### Error: "Invalid signature" en ambos

**Causa:** El secret configurado no coincide con el de MP Dashboard.

**Solución:**
1. Ir a Dashboard de MP → Tu aplicación → Webhooks
2. Verificar el "Secret" configurado
3. Copiar exactamente el mismo valor al .env
4. Reiniciar el servidor

### No tengo configurado el secret en MP

**Opción A:** Configurarlo (recomendado)
1. Dashboard de MP → Webhooks → Editar
2. Generar/escribir un secret
3. Guardar

**Opción B:** Funcionar sin secret (menos seguro)
- No configurar `MP_WEBHOOK_SECRET` en el .env
- El sistema procesará webhooks sin validar firma
- **Solo recomendado en desarrollo**

---

## Seguridad

| Nivel | Configuración | Seguridad |
|-------|--------------|-----------|
| 🔴 Baja | Sin secrets | Solo validación de IP |
| 🟡 Media | Un secret para todo | Validación de firma básica |
| 🟢 Alta | Secrets separados | Validación de firma por integración |

**Recomendación:** Usar secrets separados en producción si tenés apps distintas en MP.
