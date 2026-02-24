# Fix para Suscripciones - Planes no aparecen

## Problema
El backend retorna los planes correctamente pero no se muestran en el frontend.

## Causas encontradas

1. **Caché del servicio**: El servicio tenía caché de planes vacío
2. **Tipos de datos**: Los precios vienen como `string` del backend, no como `number`
3. **Extracción de datos**: La respuesta del backend tiene estructura `{ success: true, plans: [...] }`

## Cambios realizados

### 1. Subscription Service (`subscription.service.ts`)

```typescript
// Agregado parámetro forceRefresh
getPlans(forceRefresh = false): Observable<SubscriptionPlan[]>

// Agregado método para limpiar caché
clearPlansCache(): void

// Conversión de tipos string -> number
monthlyPrice: Number(plan.monthlyPrice) || 0
yearlyPrice: plan.yearlyPrice ? Number(plan.yearlyPrice) : null
commissionPercent: Number(plan.commissionPercent) || 0
```

### 2. Subscription Landing Component (`subscription-landing.component.ts`)

```typescript
// Limpiar caché antes de cargar
this.subscriptionService.clearPlansCache();

// Forzar recarga
this.subscriptionService.getPlans(true)
```

## Verificar que funciona

1. Abrir la consola del navegador (F12)
2. Ir a la landing page
3. Verificar que aparezcan los logs:
   ```
   Respuesta de planes: {success: true, plans: Array(2)}
   Planes recibidos: [{...}, {...}]
   Planes ordenados: [{...}, {...}]
   ```

## Test manual del backend

```bash
curl http://localhost:3000/api/subscription/plans
```

Debe retornar:
```json
{
  "success": true,
  "plans": [
    {
      "id": 1,
      "name": "FREE",
      "monthlyPrice": "0.00",
      ...
    },
    {
      "id": 2,
      "name": "PRO",
      "monthlyPrice": "15.00",
      ...
    }
  ]
}
```

## Si sigue sin funcionar

1. Limpiar caché del navegador (localStorage, sessionStorage)
2. Recargar la página con Ctrl+F5
3. Verificar en Network que la petición a `/api/subscription/plans` retorna 200
