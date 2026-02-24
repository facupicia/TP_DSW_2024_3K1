# Configuración Rápida para Testing en Sandbox

## Paso 1: Variables de Entorno

Crear archivo `Backend/.env`:

```bash
# ==========================================
# BÁSICO
# ==========================================
NODE_ENV=development
PORT=3000
CLIENT_URL=http://localhost:4200

# ==========================================
# DATABASE
# ==========================================
DATABASE_URL=postgresql://user:pass@localhost:5432/eventlife

# ==========================================
# SECURITY
# ==========================================
SECRET_KEY=dev-secret-key-min-32-chars-long
ENCRYPTION_KEY=1111111111111111111111111111111111111111111111111111111111111111

# ==========================================
# MERCADOPAGO - SANDBOX MODE
# ==========================================

# Tokens de TEST (obtenidos de https://www.mercadopago.com.ar/developers/panel/app)
MP_ACCESS_TOKEN=TEST-xxxxxxxxxxxxxxxx
MP_ACCESS_TOKEN_SUSCRIPCION=TEST-yyyyyyyyyyyyyyyy

# Credenciales OAuth (de la misma app de MP)
MP_CLIENT_ID=xxxxxxxxxxxxxxxx
MP_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Webhooks (dejar vacío en sandbox - se ignorarán)
MP_WEBHOOK_SECRET=
MP_SUBSCRIPTION_WEBHOOK_SECRET=

# URL de notificaciones (usar ngrok en desarrollo)
MP_NOTIFICATION_URL=https://TU-NGROK.ngrok.io/api/payment/webhook
MP_SUBSCRIPTION_BACK_URL=https://TU-NGROK.ngrok.io

# ==========================================
# EMAIL (opcional en dev)
# ==========================================
MAIL_HOST=smtp.brevo.com
MAIL_PORT=587
MAIL_USER=xxx
MAIL_PASSWORD=xxx
```

## Paso 2: ngrok (para webhooks)

```bash
# Instalar
npm install -g ngrok

# Iniciar
ngrok http 3000

# Copiar URL HTTPS, ejemplo: https://abc123.ngrok.io
```

## Paso 3: Configurar Webhooks en MP

Ir a https://www.mercadopago.com.ar/developers/panel/app

**Webhook de Pagos:**
- URL: `https://abc123.ngrok.io/api/payment/webhook`
- Dejar "Secret" vacío

**Webhook de Suscripciones:**
- URL: `https://abc123.ngrok.io/api/subscription/webhook`
- Dejar "Secret" vacío

## Paso 4: Iniciar Servidor

```bash
cd Backend
npm run dev
```

Deberías ver:
```
✓ MercadoPago configurado
  Modo: SANDBOX 🧪
  Token: TEST-1234...
  Webhooks: Sin secret (sandbox)
✓ Base de datos conectada
✓ Servidor iniciado en puerto 3000

🧪 MODO SANDBOX ACTIVO
   - IPs de webhook no validadas
   - Firmas de webhook opcionales
   - URLs de sandbox habilitadas
```

## Paso 5: Probar Flujo

### 1. Crear Usuario
```bash
POST http://localhost:3000/api/user/register
{
    "email": "test@example.com",
    "password": "123456",
    "firstname": "Test",
    "lastname": "User",
    "birth": "1990-01-01"
}
```

### 2. Login
```bash
POST http://localhost:3000/api/user/login
{
    "email": "test@example.com",
    "password": "123456"
}
# Guardar el token JWT
```

### 3. Conectar MP (Organizador)
```bash
# Obtener URL de OAuth
GET http://localhost:3000/api/payment/mp/connect
Authorization: Bearer <token>

# Abrir URL en navegador y autorizar
# Redirige a frontend con ?mp_connected=true
```

### 4. Crear Evento
```bash
POST http://localhost:3000/api/event
Authorization: Bearer <token>
{
    "title": "Evento Test",
    "date": "2025-12-31",
    "time": "20:00",
    "direccion": "Calle 123",
    "categoryId": 1
}
```

### 5. Crear Tipo de Ticket
```bash
POST http://localhost:3000/api/ticketType
Authorization: Bearer <token>
{
    "name": "Entrada General",
    "price": 1000,
    "capacity": 100,
    "eventId": 1
}
```

### 6. Comprar Ticket (Comprador)
```bash
POST http://localhost:3000/api/payment/create-preference
Authorization: Bearer <token-del-comprador>
{
    "ticketTypeId": 1,
    "ticketQuantity": 2
}

# Response:
{
    "id": "123456789",
    "init_point": "https://sandbox.mercadopago.com/...",
    "marketplace": true
}
```

### 7. Pagar en Sandbox
1. Abrir `init_point` en navegador
2. Usar tarjeta de prueba:
   - **Número:** 4509 9535 6623 3704
   - **CVV:** 123
   - **Exp:** 12/25
   - **Nombre:** APRO (para aprobar)
3. Completar pago

### 8. Verificar Webhook
Revisar logs del servidor:
```
{"msg":"MP_WEBHOOK_RECEIVED","type":"payment"}
{"msg":"PAYMENT_PROCESSED_SUCCESS","ticketsCreated":2}
```

### 9. Verificar Tickets
```bash
GET http://localhost:3000/api/ticket
Authorization: Bearer <token-del-comprador>
```

## Comandos Útiles

### Simular Webhook (sin hacer pago)
```bash
curl -X POST http://localhost:3000/api/payment/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","data":{"id":"1234567890"}}'
```

### Ver Estado de MP
```bash
GET http://localhost:3000/api/payment/mp/status
Authorization: Bearer <token>
```

### Ver Suscripción
```bash
GET http://localhost:3000/api/subscription/my-subscription
Authorization: Bearer <token>
```

## Solución de Problemas

### "No autorizado"
- Verificar que el JWT no esté expirado
- Header: `Authorization: Bearer <token>`

### "Organizer MP not linked"
- El organizador debe conectar su cuenta de MP primero
- Ir a Perfil → Conectar MercadoPago

### No llegan webhooks
1. ¿Está corriendo ngrok?
2. ¿La URL en MP Dashboard es correcta?
3. ¿Los logs muestran "MP_WEBHOOK_RECEIVED"?

### "Database connection error"
- Verificar que PostgreSQL esté corriendo
- Verificar credenciales en DATABASE_URL

## Cambiar a Producción

Cuando todo funcione:

```bash
# 1. Cambiar tokens
MP_ACCESS_TOKEN=APP_USR-...
MP_ACCESS_TOKEN_SUSCRIPCION=APP_USR-...

# 2. Configurar secrets
MP_WEBHOOK_SECRET=tu-secret
MP_SUBSCRIPTION_WEBHOOK_SECRET=tu-secret

# 3. Actualizar URLs
MP_NOTIFICATION_URL=https://backend-eventlife.onrender.com/api/payment/webhook
MP_SUBSCRIPTION_BACK_URL=https://backend-eventlife.onrender.com

# 4. Configurar webhooks en MP con URLs de producción
```
