# Modelo de Ganancias EventLife

## Resumen Ejecutivo

EventLife opera con un **modelo de cargo de servicio** transparente donde:
- **El organizador recibe exactamente el precio que publica**
- **El asistente paga un cargo de servicio adicional (10%)**
- **La plataforma se financia de ese cargo de servicio**

---

## 💰 Flujo de Dinero

### Ejemplo Práctico: Evento con Entrada de $1,000

```
PRECIO PUBLICADO POR EL ORGANIZADOR
└── $1,000.00 (esto es lo que el organizador quiere recibir)

PAGO DEL ASISTENTE
└── $1,000.00 (precio entrada)
    + $100.00  (cargo de servicio 10%)
    ─────────────────────────────────
    = $1,100.00 (total pagado por el asistente)

DISTRIBUCIÓN
├── Al organizador: $1,000.00 (100% del precio publicado)
└── A EventLife:    $100.00  - comisiones MP
    
    Comisión MP (~2.6% de $1,100): $28.60
    ─────────────────────────────────────
    Ganancia neta EventLife:       $71.40
```

---

## 📊 Tablas de Ganancias por Volumen

### Escenario 1: Evento Pequeño (100 entradas a $1,000)

| Concepto | Monto |
|----------|-------|
| Precio por entrada | $1,000 |
| Entradas vendidas | 100 |
| **Ingreso total asistentes** | **$110,000** |
| Cargo de servicio (10%) | $10,000 |
| Comisión MP (~2.6%) | $2,860 |
| **🎉 Ganancia del organizador** | **$100,000** |
| **💼 Ganancia neta EventLife** | **$7,140** |

### Escenario 2: Evento Mediano (500 entradas a $2,000)

| Concepto | Monto |
|----------|-------|
| Precio por entrada | $2,000 |
| Entradas vendidas | 500 |
| **Ingreso total asistentes** | **$1,100,000** |
| Cargo de servicio (10%) | $100,000 |
| Comisión MP (~2.6%) | $28,600 |
| **🎉 Ganancia del organizador** | **$1,000,000** |
| **💼 Ganancia neta EventLife** | **$71,400** |

### Escenario 3: Evento Grande (2,000 entradas a $3,000)

| Concepto | Monto |
|----------|-------|
| Precio por entrada | $3,000 |
| Entradas vendidas | 2,000 |
| **Ingreso total asistentes** | **$6,600,000** |
| Cargo de servicio (10%) | $600,000 |
| Comisión MP (~2.6%) | $171,600 |
| **🎉 Ganancia del organizador** | **$6,000,000** |
| **💼 Ganancia neta EventLife** | **$428,400** |

---

## 📈 Proyección Mensual de EventLife

### Escenario Conservador (10 eventos/mes)

| Tipo de Evento | Cantidad | Entradas/Prom | Precio Prom | Ganancia EventLife |
|----------------|----------|---------------|-------------|-------------------|
| Pequeños | 5 | 100 | $1,000 | $35,700 |
| Medianos | 4 | 500 | $2,000 | $285,600 |
| Grandes | 1 | 2,000 | $3,000 | $428,400 |
| **TOTAL MENSUAL** | | | | **$749,700** |
| **TOTAL ANUAL** | | | | **$8,996,400** |

### Escenario Optimista (25 eventos/mes)

| Tipo de Evento | Cantidad | Entradas/Prom | Precio Prom | Ganancia EventLife |
|----------------|----------|---------------|-------------|-------------------|
| Pequeños | 15 | 150 | $1,200 | $160,650 |
| Medianos | 8 | 800 | $2,500 | $571,200 |
| Grandes | 2 | 3,000 | $4,000 | $1,285,200 |
| **TOTAL MENSUAL** | | | | **$2,017,050** |
| **TOTAL ANUAL** | | | | **$24,204,600** |

---

## 🆚 Comparativa con Competidores

### World Pass (Competidor Principal)

| Concepto | World Pass | EventLife |
|----------|-----------|-----------|
| Cargo al asistente | 15% | **10%** |
| Comisión plataforma | 5% | Cargo de servicio (10%) |
| Comisión MP | 2.99% | ~2.6% |
| **Total asistente paga** | $1,150 | **$1,100** |
| **Organizador recibe** | $1,070 | **$1,000** |

**Ventaja EventLife**: $50 más barato para el asistente, organizador recibe exacto.

---

## 🎯 Estrategia de Precios Recomendada

### Opciones de Configuración

```env
# Opción A: Competitiva (8%)
PLATFORM_SERVICE_FEE_PERCENT=8
- Atractivo para organizadores
- Margen más bajo
- Volume necesario para rentabilidad

# Opción B: Balance (10%) - RECOMENDADA
PLATFORM_SERVICE_FEE_PERCENT=10
- Balance entre atractivo y rentabilidad
- Suficiente para cubrir costos y generar ganancia

# Opción C: Premium (12%)
PLATFORM_SERVICE_FEE_PERCENT=12
- Mayor margen
- Riesgo de perder competencia
- Requiere valor agregado claro
```

---

## 💡 Modelo de Negocio Adicional

### Suscripciones para Organizadores (Futuro)

| Plan | Precio/Mes | Características | Ganancia EventLife |
|------|-----------|-----------------|-------------------|
| FREE | $0 | 1 evento/mes, comisión 12% | Solo comisión |
| PRO | $5,000 | 5 eventos/mes, comisión 8% | Suscripción + comisión |
| BUSINESS | $15,000 | Ilimitado, comisión 5% | Suscripción + comisión |

**Proyección adicional con suscripciones:**
- 50 organizadores PRO: $250,000/mes
- 20 organizadores BUSINESS: $300,000/mes
- **Total suscripciones**: $550,000/mes = $6,600,000/año

---

## 📋 Resumen para el Dueño del Servicio

### Ingresos de EventLife

| Fuente | Descripción | Estimado Mensual |
|--------|-------------|------------------|
| Cargo de servicio | 10% sobre ventas | $500,000 - $2,000,000 |
| Comisiones MP | Diferencia (10% - 2.6%) | Mayoría del cargo |
| Suscripciones | Planes PRO/BUSINESS | $200,000 - $500,000 |
| **TOTAL ESTIMADO** | | **$700,000 - $2,500,000** |

### Costos a Considerar

| Concepto | Estimado |
|----------|----------|
| Servidor/Hosting | $50,000/mes |
| Comisiones MP (parte del cargo) | ~2.6% de ventas |
| Marketing/Adquisición | Variable |
| Soporte/Operaciones | $100,000/mes |

### Margen Bruto Estimado

```
Ingresos:     $1,500,000 (promedio)
Costos MP:    $390,000  (2.6% de $15M en ventas)
Otros costos: $150,000
─────────────────────────
GANANCIA NETA: $960,000/mes (~$11.5M/año)
Margen: ~64%
```

---

## 🚀 Estrategia de Crecimiento

### Fase 1: Adquisición (Meses 1-6)
- Cargo de servicio: 8% (competitivo)
- Objetivo: 50 organizadores, 100 eventos
- Ingreso estimado: $300,000/mes

### Fase 2: Monetización (Meses 7-12)
- Cargo de servicio: 10% (balance)
- Lanzar planes PRO
- Objetivo: 150 organizadores, 300 eventos
- Ingreso estimado: $1,200,000/mes

### Fase 3: Escalamiento (Año 2)
- Cargo de servicio: 10%
- Planes PRO/BUSINESS maduros
- Objetivo: 500+ organizadores
- Ingreso estimado: $3,000,000+/mes

---

## 📞 Conclusión

**El modelo de cargo de servicio es:**
- ✅ Transparente para el asistente
- ✅ Justo para el organizador (recibe exacto)
- ✅ Sostenible para la plataforma
- ✅ Competitivo vs alternativas

**Ganancia clave**: Por cada $1,000 que cuesta una entrada, EventLife gana ~$71 (con configuración 10%).

---

*Documento generado para planificación financiera de EventLife*
*Fecha: 2025*
