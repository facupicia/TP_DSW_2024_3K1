# Cambios en Frontend para el Refactor del Backend

## Resumen

El backend fue refactorizado con mejoras de seguridad y arquitectura. Estos son los cambios mínimos necesarios en el frontend para mantener la compatibilidad.

## Cambios Realizados

### 1. Payment Service (`services/payment.service.ts`)

```typescript
// Agregado campo opcional 'marketplace' a la interfaz
export interface PreferenceResponse {
    id: string;
    init_point: string;
    marketplace?: boolean;  // NUEVO: Indica si se usó modo marketplace
}
```

**Impacto:** Ninguno, es opcional. Sirve para debugging.

---

### 2. Ticket Service (`services/ticket.service.ts`)

```typescript
// Agregado campo opcional 'success' a la respuesta
getLastPurchase(): Observable<{ 
    tickets: Ticket[]; 
    status: string;
    success?: boolean;  // NUEVO
}> 
```

**Impacto:** Ninguno, es opcional. El backend ahora retorna `success: true` en respuestas exitosas.

---

### 3. Checkout Success Component (`pages/checkout/success.component.ts`)

**Cambios:**
1. Agregado `HttpClient` como dependencia inyectada
2. Mejorado el método `startPolling()` para usar HttpClient en lugar de fetch
3. Mejor manejo de errores en el polling
4. Agregada verificación de estado de pago por `external_reference`

**Antes:**
```typescript
fetch(`${environment.apiUrl}/payment/status?external_reference=${extRef}`)
    .then(r => r.json())
    .then(state => { ... })
```

**Después:**
```typescript
this.http.get<{ success: boolean; status: string }>(
    `${environment.apiUrl}/payment/status?external_reference=${extRef}`
).subscribe({
    next: (state) => { ... },
    error: () => { /* ignorar errores */ }
});
```

---

## Nuevos Endpoints del Backend

### GET /api/payment/status

Verifica el estado de un pago por `external_reference`.

**Request:**
```
GET /api/payment/status?external_reference=123|456|2|789
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "status": "approved",  // approved | failure | processing | pending
    "paymentLogId": 123,
    "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Estados posibles:**
- `approved` - Pago completado y tickets creados
- `failure` - Pago rechazado o fallido
- `processing` - Pago en proceso
- `pending` - Aún no se recibió webhook

---

## Códigos de Error Nuevos

El backend ahora retorna códigos de error específicos:

| Código | Descripción | Acción del Frontend |
|--------|-------------|---------------------|
| `ORGANIZER_MP_NOT_LINKED` | El organizador no tiene MP conectado | Mostrar mensaje al usuario |
| `NO_STOCK` | No hay stock disponible | Mostrar error y redirigir |
| `EVENT_STARTED` | El evento ya comenzó | Mostrar error |
| `AGE_RESTRICTED` | El usuario no cumple la edad mínima | Mostrar error |
| `INVALID_QUANTITY` | Cantidad inválida | Validar formulario |

---

## Flujo de Pago Actualizado

```
1. Usuario selecciona tickets → Checkout
   ↓
2. Frontend llama POST /api/payment/create-preference
   ↓
3. Backend retorna { id, init_point, marketplace }
   ↓
4. Frontend redirige a init_point (MercadoPago)
   ↓
5. Usuario paga en MP
   ↓
6. MP redirige a /checkout/success
   ↓
7. Frontend hace polling:
   - GET /api/payment/status (nuevo endpoint)
   - GET /api/ticket/last-purchase
   ↓
8. Cuando status === 'approved', mostrar tickets
```

---

## Testing

### En Sandbox

```bash
# Usar token de TEST
MP_ACCESS_TOKEN=TEST-...

# El backend automáticamente:
# - Permite IPs de cualquier origen
# - No requiere webhook secrets
# - Usa URLs de sandbox.mercadopago.com
```

### En Producción

```bash
# Usar token de producción
MP_ACCESS_TOKEN=APP_USR-...

# El backend:
# - Valida IPs de MP
# - Requiere webhook secrets
# - Usa URLs de www.mercadopago.com
```

---

## Notas Importantes

1. **No se requieren cambios mayores** en el frontend. El refactor es compatible hacia atrás.

2. **El polling en success.component.ts** ahora es más robusto y maneja mejor los errores.

3. **Los códigos de error nuevos** permiten dar mensajes más específicos al usuario.

4. **El campo `marketplace`** en la respuesta de create-preference sirve para debugging.

5. **El endpoint `/api/payment/status`** es nuevo y opcional, mejora la UX al verificar estado del pago.

---

## Verificación Post-Deploy

Después de deployar el backend, verificar:

- [ ] Crear preferencia de pago funciona
- [ ] El init_point redirige correctamente a MP
- [ ] Después de pagar, el polling funciona
- [ ] Los tickets aparecen en success
- [ ] Los emails se envían
- [ ] Los códigos de error se muestran correctamente
