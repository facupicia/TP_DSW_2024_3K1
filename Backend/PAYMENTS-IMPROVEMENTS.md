# 🔧 Mejoras Recomendadas - Sistema de Pagos

## 📊 Estado Actual

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Webhooks | 🟢 | Funcionando, validaciones OK |
| OAuth MP | 🟢 | Flujo completo implementado |
| Suscripciones | 🟢 | 2 planes activos |
| Seguridad | 🟡 | Buena, pero hay gaps |
| Idempotencia | 🟡 | Parcialmente implementada |
| Monitoreo | 🔴 | Falta alerting |

---

## 🚨 Issues Encontrados (Críticos)

### 1. Rate Limiting No Funciona en Webhooks
**Problema**: Los tests enviaron 35 requests y ninguno fue bloqueado.

**Riesgo**: Podría recibir DDoS o spam de webhooks.

**Solución**:
```typescript
// En mp-webhook.middleware.ts
// Aumentar strictness o revisar por qué no está bloqueando
const RATE_LIMIT_MAX = 10; // Reducir de 30 a 10
```

### 2. Webhook con SQL Injection Intent Retorna 403
**Problema**: El webhook con `id: "'; DROP TABLE"` retornó 403 en lugar de 200.

**Riesgo**: MP podría reintentar el webhook si no retorna 200.

**Solución**:
```typescript
// En payment.controller.ts
// Siempre retornar 200, incluso con errores de validación
res.status(200).json({ received: true, processed: false });
```

### 3. Falta Validación de Timestamp en Webhooks
**Problema**: Webhooks con timestamps futuros o muy viejos se aceptan.

**Riesgo**: Replay attacks.

**Solución**:
```typescript
// Validar timestamp (ejemplo)
const MAX_AGE = 5 * 60 * 1000; // 5 minutos
if (Math.abs(Date.now() - webhookTimestamp) > MAX_AGE) {
  logger.warn('Webhook timestamp inválido');
  // Aún así retornar 200 para no reintentar
}
```

---

## ⚠️ Mejoras Importantes (No críticas)

### 4. Idempotencia de Pagos
**Estado actual**: Los webhooks duplicados retornan 200, pero no se verifica si ya se procesaron.

**Mejora**: Agregar tabla de `webhook_processed`:
```typescript
// Verificar si ya procesamos este paymentId
const alreadyProcessed = await PaymentLog.findOne({
  where: { mpPaymentId: paymentId, status: 'completed' }
});

if (alreadyProcessed) {
  logger.info('Payment already processed, skipping');
  return res.status(200).json({ idempotent: true });
}
```

### 5. Manejo de Reembolsos
**Falta**: No hay endpoint para reembolsar pagos.

**Necesario**:
```typescript
// Nuevo endpoint
POST /api/payment/refund/:paymentId
```

### 6. Logs de Webhooks
**Problema**: No hay trazabilidad de webhooks recibidos.

**Mejora**: Crear tabla `webhook_logs`:
```sql
CREATE TABLE webhook_logs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50), -- 'payment' | 'subscription'
  action VARCHAR(100),
  payload JSONB,
  ip_address VARCHAR(45),
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 7. Alertas de Fallos
**Falta**: No hay notificación si un webhook falla procesando.

**Solución**: Integrar con email/Slack:
```typescript
if (processWebhookError) {
  await sendAlert({
    to: 'admin@eventlife.com',
    subject: 'Webhook de pago falló',
    body: `PaymentId: ${paymentId}, Error: ${error}`
  });
}
```

---

## 📈 Mejoras de Performance

### 8. Procesamiento Asíncrono de Webhooks
**Problema**: Los webhooks se procesan sincrónicamente.

**Mejora**: Usar cola (Redis/Bull):
```typescript
// En lugar de procesar inmediatamente
await paymentQueue.add('process-webhook', { paymentId });
res.status(200).json({ queued: true });
```

### 9. Cache de Preferencias
**Problema**: Cada request crea nueva preferencia en MP.

**Mejora**: Cachear por 5 minutos:
```typescript
const cacheKey = `preference:${userId}:${ticketTypeId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

---

## 🔒 Mejoras de Seguridad

### 10. Validación de IPs más estricta
**Problema**: En sandbox se permiten todas las IPs.

**Mejora**: Requerir validación en producción:
```typescript
if (process.env.NODE_ENV === 'production' && !isValidIP) {
  return res.status(403).json({ error: 'Invalid IP' });
}
```

### 11. Firma de Webhooks más robusta
**Problema**: La validación de firma no siempre funciona.

**Mejora**: Implementar correctamente:
```typescript
// Usar el body raw para validar
const signature = req.headers['x-signature'];
const expected = crypto
  .createHmac('sha256', secret)
  .update(req.rawBody)
  .digest('hex');
```

### 12. Sanitización de Inputs
**Problema**: El `external_reference` se parsea sin validación.

**Mejora**:
```typescript
const parts = externalRef.split('|');
if (parts.length !== 4) {
  throw new Error('Invalid external_reference format');
}
const [userId, ticketTypeId, qty, organizerId] = parts;
if (isNaN(parseInt(userId))) {
  throw new Error('Invalid userId in reference');
}
```

---

## 🧪 Tests Recomendados (Faltantes)

### 13. Test de Reembolso
```typescript
test('debería reembolsar un pago exitoso', async () => {
  const response = await request.post('/api/payment/refund/123');
  expect(response.status()).toBe(200);
  expect(await getPaymentStatus(123)).toBe('refunded');
});
```

### 14. Test de Concurrencia
```typescript
test('no debe crear tickets duplicados en concurrencia', async () => {
  // Enviar 10 webhooks simultáneos
  const promises = Array(10).fill().map(() => sendWebhook(samePaymentId));
  await Promise.all(promises);
  
  // Verificar que solo se creó 1 ticket
  expect(await countTickets(paymentId)).toBe(1);
});
```

### 15. Test de Recuperación
```typescript
test('debe reintentar webhook fallido', async () => {
  // Simular fallo de DB
  jest.spyOn(db, 'save').mockRejectedValueOnce(new Error('DB down'));
  
  // El webhook debe ser reencolado para retry
  const response = await sendWebhook();
  expect(response.status()).toBe(200); // Acknowledge
  expect(queue.retryCount).toBeGreaterThan(0);
});
```

---

## 📋 Checklist de Producción

### Antes de lanzar:

- [ ] Configurar `MP_ACCESS_TOKEN` de producción
- [ ] Configurar `MP_CLIENT_ID` y `MP_CLIENT_SECRET`
- [ ] Configurar `MP_WEBHOOK_SECRET`
- [ ] Configurar URLs de webhook en dashboard de MP
- [ ] Probar flujo completo de pago end-to-end
- [ ] Probar reembolso (si está implementado)
- [ ] Configurar monitoreo (Sentry/DataDog)
- [ ] Configurar alertas de email para fallos
- [ ] Hacer backup de base de datos
- [ ] Documentar procedimiento de rollback

### Configuración de Webhooks en MP:
```
URL: https://backend-eventlife.onrender.com/api/payment/webhook
Events: 
  - payment.created
  - payment.updated
  - merchant_order.created

URL: https://backend-eventlife.onrender.com/api/subscription/webhook
Events:
  - subscription.authorized_payment
  - subscription.preapproval
```

---

## 🎯 Prioridades

### 🔴 Crítico (Hacer antes del lanzamiento):
1. Arreglar rate limiting en webhooks
2. Asegurar que todos los webhooks retornen 200
3. Validación de timestamps

### 🟡 Importante (Hacer en la primera semana):
4. Idempotencia de pagos
5. Logs de webhooks
6. Alertas de fallos

### 🟢 Mejoras (Hacer en el primer mes):
7. Procesamiento asíncrono
8. Cache de preferencias
9. Tests de concurrencia

---

## 📞 Contactos y Escalación

| Problema | Quién | Cómo |
|----------|-------|------|
| Webhook no llega | MP Support | https://www.mercadopago.com/developers |
| Pago no procesa | Dev Team | Slack #payments-issues |
| Error 500 en pago | On-call Dev | PagerDuty |
| Disputa/Reclamo | Customer Support | support@eventlife.com |

---

**Documento creado**: Tests de casos edge ejecutados
**Tests pasados**: 26/28 (92.8%)
**Estado general**: 🟢 **LISTO CON MEJORAS SUGERIDAS**
