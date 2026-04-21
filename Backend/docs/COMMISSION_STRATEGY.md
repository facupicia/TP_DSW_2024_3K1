# Estrategia de Comisiones de EventLife

## Análisis del Competidor (World Pass)

### Su modelo:
1. **Cargo de servicio al asistente**: 15% sobre el precio del ticket
2. **Comisión MP**: 2.99% sobre el total (incluyendo cargo de servicio)
3. **Comisión World Pass**: 5%

### Ejemplo práctico (del competidor):
| Concepto | Monto |
|----------|-------|
| Precio del ticket | $1,000 |
| Cargo de servicio (15%) | $150 |
| **Total cobrado al asistente** | **$1,150** |
| Comisión World Pass 5% | $50 |
| Comisión MP 2.99% | $30 |
| Total comisiones | $80 |
| **Ingreso del organizador** | **$1,070** |

**Resultado**: El organizador gana $70 EXTRA (7% más) porque el asistente pagó el cargo de servicio.

---

## Propuesta EventLife

### Opción 1: Modelo "Cargo de Servicio" (Recomendado para competir)

**Estructura:**
```
Precio ticket: $1,000
Cargo de servicio EventLife: 10% = $100
Total cobrado al asistente: $1,100

Comisión MP (2.59% de $1,100): $28.49
Neto para EventLife: $100 - $28.49 = $71.51
Ingreso organizador: $1,000 (recibe exacto)
```

**Ventajas:**
- El organizador recibe exacto lo que quiere
- El asistente paga un poco más pero sabe por qué
- EventLife se financia del cargo de servicio
- Comisión transparente

### Opción 2: Modelo Híbrido (Recomendado para organizadores premium)

**Para organizadores con plan FREE:**
```
Precio ticket: $1,000
Cargo de servicio: 12%
Total cobrado: $1,120

Comisión MP: $29.01
Comisión EventLife: $10
Neto organizador: $1,000 (recibe exacto)
```

**Para organizadores con plan PRO (suscripción):**
```
Precio ticket: $1,000
Cargo de servicio: 5%
Total cobrado: $1,050

Comisión MP: $13.10
Comisión EventLife: $5
Neto organizador: $1,000 (recibe exacto)
```


## Implementación Técnica

### Configuración de Variables de Entorno

```env
# Comisión base de la plataforma (sobre el precio del ticket)
PLATFORM_SERVICE_FEE_PERCENT=10

# Comisión MP para Marketplace (variable por método de pago)
MP_MARKETPLACE_COMMISSION_PERCENT=2.99
```

### Cambios en el Código

#### 1. Modificar `preference.service.ts` (Marketplace):
```typescript
// En lugar de marketplace_fee, usar cargo de servicio
const serviceFeePercent = Number(process.env.PLATFORM_SERVICE_FEE_PERCENT || 8);
const serviceFeeAmount = (totalAmount * serviceFeePercent) / 100;

// marketplace_fee = 0 (el organizador recibe todo)
// El cargo de servicio se muestra al asistente
```

#### 3. Actualizar frontend (checkout):
```typescript
// Mostrar desglose:
// - Precio ticket: $1,000
// - Cargo de servicio (10%): $100
// - Total a pagar: $1,100
```

---

## Comparativa Visual

| Concepto | World Pass | EventLife Propuesta |
|----------|-----------|---------------------|
| Precio ticket | $1,000 | $1,000 |
| Cargo de servicio | 15% ($150) | 10% ($100) |
| Total asistente | $1,150 | $1,100 |
| Comisión MP | $30 | $28.49 |
| Comisión plataforma | $50 | $71.51 |
| Ingreso organizador | $1,070 | $1,000 |

**Ventaja competitiva**: EventLife es más barato para el asistente ($1,100 vs $1,150) y el organizador recibe exacto lo que quiere.

---

## Plan de Migración

### Fase 1: Implementar en Marketplace
1. Modificar `preference.service.ts`
2. Actualizar webhook para manejar nuevo flujo
3. Testing

### Fase 3: Comunicación
1. Actualizar T&C
2. Notificar organizadores
3. Actualizar landing page

---

## Consideraciones Legales

- El cargo de servicio debe ser **transparente** y mostrarse claramente
- Debe indicarse que es un cargo de la plataforma, no del organizador
- Cumplir con normativa de defensa al consumidor
