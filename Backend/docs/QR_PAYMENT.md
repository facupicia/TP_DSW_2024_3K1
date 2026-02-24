# Pago por QR (Checkout Pro)

## Descripción

Nuevo método de pago que permite a los usuarios pagar escaneando un código QR con la app de MercadoPago.

## Ventajas

| Aspecto | Pago Tradicional (Marketplace) | Pago QR (Checkout Pro) |
|---------|-------------------------------|------------------------|
| Comisión MP | 8% o más | **2.59%** |
| Velocidad | Estándar | **Instantáneo** |
| Experiencia | Redirect a MP | **QR escaneable** |
| Integración | Compleja (OAuth) | **Simple** |

## Flujo de Pago

```
1. Usuario selecciona "Pagar con QR"
   ↓
2. Backend crea preferencia Checkout Pro
   ↓
3. Frontend muestra botón "Pagar con MercadoPago"
   ↓
4. Usuario hace click (PC) o escanea QR (Mobile)
   ↓
5. Pago en app de MP
   ↓
6. MP envía webhook
   ↓
7. Backend crea tickets
   ↓
8. Usuario recibe tickets por email
```

## API Endpoints

### Crear Preferencia QR

```http
POST /api/payment/create-qr-preference
Authorization: Bearer <token>
Content-Type: application/json

{
    "ticketTypeId": 1,
    "ticketQuantity": 2
}
```

**Response:**
```json
{
    "success": true,
    "id": "123456789",
    "init_point": "https://www.mercadopago.com/...",
    "qr_code_url": "https://www.mercadopago.com/...",
    "payment_type": "qr",
    "commission_info": {
        "mp_commission_percent": 2.59,
        "mp_commission_amount": 25.90,
        "platform_net_amount": 974.10
    }
}
```

## Diferencias Clave

### Marketplace vs QR

| Característica | Marketplace | QR |
|----------------|-------------|-----|
| `external_reference` | `userId|ticketTypeId|qty|organizerId` | `QR|userId|ticketTypeId|qty` |
| Destino del pago | Cuenta del organizador | Cuenta de la plataforma |
| Requiere OAuth | Sí | No |
| Comisión | Variable (plan del org) | Fija 2.59% |

## Frontend

### Componente QR Payment

```typescript
// Uso del componente
<app-qr-payment
    [ticketTypeId]="1"
    [quantity]="2"
    [unitPrice]="500"
    (close)="cerrarModal()">
</app-qr-payment>
```

### Selector de Método de Pago

El checkout ahora incluye un selector que permite al usuario elegir:
- **Pago Tradicional**: Redirect a MP (marketplace)
- **Pago con QR**: Botón/QR para pagar desde la app

## Webhook

El webhook procesa ambos tipos de pago automáticamente:

```typescript
// Detección automática por external_reference
if (parts[0] === 'QR') {
    // Procesar pago QR
} else {
    // Procesar pago marketplace
}
```

## Configuración

No requiere configuración adicional. Usa las mismas credenciales de MP:

```bash
MP_ACCESS_TOKEN=TEST-...
# o
MP_ACCESS_TOKEN=APP_USR-...
```

## Testing

1. Seleccionar "Pagar con QR" en el checkout
2. Click en "Pagar con MercadoPago"
3. En desarrollo, usar tarjetas de prueba de MP
4. Verificar que los tickets se crean correctamente

## Consideraciones

### Para el Organizador
- Los pagos QR van a la cuenta de la **plataforma**
- El organizador debe retirar los fondos o recibir transferencia periódica
- Se recomienda usar QR para ventas de bajo/medio monto

### Para el Comprador
- Más rápido y simple
- Menor comisión = mejor precio
- Requiere app de MercadoPago instalada

## Futuras Mejoras

- [ ] Generar imagen QR real para mostrar
- [ ] Permitir pago con código de barras
- [ ] Integrar con otros wallets (Modo, Ualá)
- [ ] Sistema de retiro para organizadores
