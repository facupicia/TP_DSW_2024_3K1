# EventLife - AI Agent Guide

## Project Overview

EventLife es una plataforma Full-Stack integral para la gestión de eventos y venta de entradas. Permite a los usuarios descubrir eventos, adquirir entradas de forma segura con MercadoPago y acceder mediante códigos QR. Los organizadores disponen de un panel de control con estadísticas en tiempo real y gestión de audiencia.

**Repositorio:** https://github.com/cufardixx/TP_DSW_2024_3K1  
**Demo:** https://event-life.netlify.app  
**Autores:** Picia Facundo (48072), Tomas Yasparra (48083)  
**Contexto:** Trabajo Práctico - Desarrollo de Software 2024 - UTN

---

## Technology Stack

### Backend
| Componente | Tecnología | Versión |
|------------|------------|---------|
| Runtime | Node.js | 18.18.0 |
| Framework | Express | 4.19.2 |
| Lenguaje | TypeScript | 5.6.2 |
| ORM | TypeORM | 0.3.20 |
| Base de Datos | PostgreSQL | 16 (NeonDB) |
| Caché | Redis | 4.6.13 |
| Validación | Zod | 3.23.8 |
| Auth | JWT + bcrypt + Google OAuth |
| Pagos | MercadoPago SDK | 2.11.0 |
| Documentación | Swagger UI | 5.0.1 |

### Frontend
| Componente | Tecnología | Versión |
|------------|------------|---------|
| Framework | Angular | 17.3.0 |
| Lenguaje | TypeScript | ~5.4.2 |
| Estilos | Tailwind CSS | 3.4.1 |
| Componentes UI | Angular Material | 17.3.0 |
| Mapas | Leaflet | 1.9.4 |
| Gráficos | ApexCharts + ng-apexcharts | 4.0.0 / 1.13.0 |
| Escáner QR | @zxing/ngx-scanner | 21.0.0 |
| Notificaciones | ngx-toastr | 19.1.0 |
| SSR | Angular SSR | 17.3.0 |

### Infraestructura
- **Backend Hosting:** Render (https://backend-eventlife.onrender.com)
- **Frontend Hosting:** Netlify (https://event-life.netlify.app)
- **Base de Datos:** Neon PostgreSQL
- **Node Version:** 18.18.0 (especificada en `.node-version`)

---

## Project Structure

```
TP_DSW_2024_3K1/
├── Backend/                    # API REST Node.js + Express
│   ├── src/
│   │   ├── index.ts           # Punto de entrada
│   │   ├── app.ts             # Configuración Express
│   │   ├── db.ts              # Re-export de database config
│   │   ├── config/            # Configuraciones (DB, env)
│   │   │   ├── database.ts    # TypeORM DataSource
│   │   │   ├── env.ts         # Validación Zod de variables
│   │   │   └── redis.ts       # Configuración Redis
│   │   ├── user/              # Módulo Usuarios
│   │   ├── event/             # Módulo Eventos
│   │   ├── ticket/            # Módulo Entradas
│   │   ├── ticketType/        # Módulo Tipos de Entrada
│   │   ├── category/          # Módulo Categorías
│   │   ├── payment/           # Módulo Pagos (MercadoPago)
│   │   ├── subscription/      # Módulo Suscripciones
│   │   ├── scanner/           # Módulo Escáner QR
│   │   ├── coupon/            # Módulo Cupones
│   │   ├── admin/             # Módulo Admin
│   │   ├── common/            # Utilidades compartidas
│   │   │   ├── middleware/    # Middlewares (auth, errorHandler)
│   │   │   └── services/      # Servicios (mailer, logger, etc.)
│   │   └── schemas/           # Esquemas Zod
│   ├── tests/                 # Tests manuales
│   ├── dist/                  # Compilado TypeScript
│   └── docs/                  # Documentación
│
├── Frontend/                   # Aplicación Angular
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/    # Componentes reutilizables
│   │   │   ├── pages/         # Páginas/Vistas
│   │   │   ├── services/      # Servicios HTTP
│   │   │   ├── guards/        # Route Guards
│   │   │   ├── interceptors/  # HTTP Interceptors
│   │   │   ├── interfaces/    # TypeScript interfaces
│   │   │   ├── pipes/         # Custom pipes
│   │   │   ├── app.routes.ts  # Definición de rutas
│   │   │   └── app.config.ts  # Configuración Angular
│   │   ├── environments/      # Environment files
│   │   └── styles.css         # Estilos globales
│   ├── dist/                  # Build output
│   └── docs/                  # Documentación
│
├── gifs/                      # Recursos multimedia
├── render.yaml                # Configuración Render.com
└── README.md                  # Documentación principal
```

### Convención de Módulos Backend
Cada módulo sigue una estructura consistente:
```
modulo/
├── {modulo}.entity.ts      # Entidad TypeORM
├── {modulo}.controller.ts  # Controladores Express
├── {modulo}.routes.ts      # Definición de rutas
├── {modulo}.service.ts     # Lógica de negocio
└── {modulo}.interfaces.ts  # Tipos TypeScript (opcional)
```

---

## Build and Run Commands

### Backend

```bash
cd Backend

# Instalar dependencias
npm install

# Desarrollo (con hot-reload)
npm run dev

# Compilar TypeScript
npm run build

# Producción
npm start

# Seed de base de datos
npm run seed

# Tests
npm run test:payment              # Test de pagos
npm run test:payment-idempotency  # Test de idempotencia
npm run test:auth                 # Test de autenticación
npm run test:google               # Test de Google OAuth
npm run test:roles                # Test de roles
npm run test:db                   # Test de conexión DB
```

**URLs Backend:**
- Desarrollo: http://localhost:3000
- Producción: https://backend-eventlife.onrender.com
- Health Check: GET /health
- Métricas: GET /metrics
- API Docs: /api-docs (Swagger UI)

### Frontend

```bash
cd Frontend

# Instalar dependencias
npm install

# Desarrollo
npm start
# o
ng serve

# Build producción
npm run build

# Build desarrollo
npm run watch

# Tests (Karma + Jasmine)
npm test

# SSR Server
npm run serve:ssr:frontend
```

**URLs Frontend:**
- Desarrollo: http://localhost:4200
- Producción: https://event-life.netlify.app

---

## Configuration

### Backend Environment Variables (.env)

```env
# Entorno
NODE_ENV=production|development
PORT=3000

# Frontend URLs (CORS)
CLIENT_URL=https://event-life.netlify.app
CLIENT_URLS=https://event-life.netlify.app,http://localhost:4200

# Base de Datos (Neon PostgreSQL)
DATABASE_URL=postgresql://...
# o
PGHOST=...
PGPORT=5432
PGUSER=...
PGPASSWORD=...
PGDATABASE=...

# JWT
SECRET_KEY=tu_clave_secreta

# MercadoPago
MP_ACCESS_TOKEN=TEST-...|APP_USR-...
MP_NOTIFICATION_URL=https://backend-eventlife.onrender.com/webhook
MP_WEBHOOK_SECRET=...

# Google OAuth
ID_CLIENT_GOOGLE_OAUTH=...

# Redis (opcional en dev)
REDIS_URL=redis://...

# Email (Brevo/Sendinblue)
MAIL_HOST=smtp.brevo.com
MAIL_PORT=587
MAIL_USER=...
MAIL_PASSWORD=...
MAIL_FROM=noreply@eventlife.com
BREVO_API_KEY=...
```

### Frontend Environment

**src/environments/environment.ts** (Producción):
```typescript
export const environment = {
    production: true,
    apiUrl: 'https://backend-eventlife.onrender.com/api',
    googleClientId: '...apps.googleusercontent.com'
};
```

**src/environments/environment.development.ts** (Desarrollo):
```typescript
export const environment = {
    production: false,
    apiUrl: 'http://localhost:3000/api',
    googleClientId: '...apps.googleusercontent.com'
};
```

---

## Code Style Guidelines

### TypeScript (Backend y Frontend)

1. **Tipado estricto en Frontend, relajado en Backend:**
   - Frontend usa `strict: true` en tsconfig.json
   - Backend usa `strict: false` por compatibilidad histórica

2. **Imports:**
   - Usar imports absolutos con alias cuando estén configurados
   - Ordenar imports: externos primero, luego internos

3. **Nomenclatura:**
   - Clases/Interfaces: PascalCase (`UserController`, `EventEntity`)
   - Variables/Funciones: camelCase (`getUserById`, `ticketQuantity`)
   - Archivos: kebab-case o camelCase según el módulo
   - Constantes: SCREAMING_SNAKE_CASE para valores fijos

4. **Entidades TypeORM:**
   ```typescript
   @Entity()
   export class EntityName extends BaseEntity {
       @PrimaryGeneratedColumn()
       id: number;
       
       @Column()
       fieldName: string;
       
       @CreateDateColumn({ type: 'timestamp' })
       createdAt: Date;
   }
   ```

5. **Controladores Express:**
   - Usar `async/await` siempre
   - Manejar errores con try/catch
   - Retornar respuestas con estructura consistente

6. **Validación con Zod:**
   ```typescript
   const Schema = z.object({
       field: z.string().min(1),
       number: z.number().optional()
   });
   ```

### Angular Guidelines

1. **Standalone Components:**
   - Todos los componentes son `standalone: true`
   - Importar dependencias directamente en cada componente

2. **Inyección de Dependencias:**
   - Usar `inject()` en lugar de constructor cuando sea posible
   ```typescript
   private http = inject(HttpClient);
   ```

3. **Servicios:**
   - `providedIn: 'root'` por defecto
   - Manejar errores con `catchError` de RxJS

4. **Rutas:**
   - Usar lazy loading cuando sea apropiado
   - Proteger rutas con guards (`canActivate: [authGuard]`)

---

## Testing Instructions

### Backend Tests

Los tests están en `/Backend/tests/` y se ejecutan con `ts-node-dev`:

```bash
# Test de flujo de pagos
npm run test:payment

# Test de idempotencia (pagos duplicados)
npm run test:payment-idempotency

# Test de autenticación y tokens
npm run test:auth

# Test de Google OAuth
npm run test:google

# Test de actualización de roles
npm run test:roles
```

**Nota:** Estos son tests manuales, no una suite automatizada con Jest.

### Frontend Tests

```bash
# Ejecutar tests con Karma
npm test

# Tests unitarios generados por Angular CLI
# Ubicación: *.spec.ts junto a cada archivo
```

---

## Security Considerations

### Autenticación y Autorización

1. **JWT Tokens:**
   - Almacenados en localStorage del frontend
   - Enviados en header `Authorization: Bearer <token>` o `token: <token>`
   - Expiración configurable (default: 24h)

2. **Roles de Usuario:**
   - `user`: Usuario regular, puede comprar entradas
   - `organizer`: Puede crear y gestionar eventos
   - `scanner`: Puede escanear/validar entradas
   - `admin`: Acceso completo al sistema

3. **Middleware de Auth:**
   ```typescript
   // Proteger rutas
   router.get('/protected', checkAuthToken, controller);
   
   // Verificar roles
   router.get('/admin', checkAuthToken, checkRole(['admin']), controller);
   ```

### Seguridad en API

1. **Helmet:** Configurado con `crossOriginOpenerPolicy: same-origin-allow-popups` para Google OAuth
2. **Rate Limiting:** 120 requests por minuto por IP
3. **CORS:** Orígenes explícitamente permitidos desde `CLIENT_URLS`
4. **Validación:** Todos los inputs validados con Zod
5. **Passwords:** Hasheados con bcrypt (salt rounds: 10)

### Variables Sensibles

- Nunca commitear archivos `.env`
- Usar `select: false` en columnas sensibles de TypeORM (passwords, tokens)
- Tokens de MercadoPago almacenados encriptados en DB

---

## Database Architecture

### Entidades Principales

| Entidad | Descripción |
|---------|-------------|
| `User` | Usuarios del sistema con roles |
| `Event` | Eventos creados por organizadores |
| `Category` | Categorías de eventos |
| `TicketType` | Tipos de entrada para cada evento |
| `Ticket` | Entradas compradas por usuarios |
| `Payment` | Registros de pagos de MercadoPago |
| `Subscription` | Suscripciones de organizadores |
| `Coupon` | Cupones de descuento |

### Relaciones

```
User 1:N Event (organizador)
User 1:N Ticket (compras)
Event N:1 Category
Event 1:N TicketType
Event 1:N Ticket
TicketType 1:N Ticket
Ticket 1:1 Payment
```

### Migraciones

```bash
# Verificar migración de datos
npm run verify:migration

# Seed de planes de suscripción
npm run seed
```

---

## Deployment

### Backend (Render)

Configuración en `render.yaml`:
```yaml
services:
  - type: web
    name: eventlife-backend
    env: node
    buildCommand: cd Backend && npm install && npm run build
    startCommand: cd Backend && npm start
    healthCheckPath: /health
```

**Variables de entorno en Render:**
- Configurar todas las variables del `.env.example`
- `NODE_ENV=production`
- `PORT=3000`

### Frontend (Netlify)

Configuración en `netlify.toml`:
```toml
[build]
  command = "npm install --legacy-peer-deps && npm run build"
  publish = "dist/frontend/browser"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Build settings:**
- Node version: 18
- Build command: `npm install --legacy-peer-deps && npm run build`
- Publish directory: `dist/frontend/browser`

---

## Common Issues & Solutions

### Google OAuth en Safari iOS
**Solución implementada** en `login.component.ts`:
- **Detección automática**: Detecta Safari en iOS/iPadOS mediante user-agent
- **FedCM**: Intenta usar Federated Credential Management (API moderna) si está disponible
- **Fallback a redirect**: Si FedCM no está disponible, usa `ux_mode: 'redirect'` en lugar de popup
- **Botón personalizado**: Renderiza un botón estilizado para Safari cuando usa modo redirect

**Configuración requerida:**
- Ver documentación detallada en `Frontend/docs/OAUTH_TROUBLESHOOTING.md`
- Configurar URI de redirección en Google Cloud Console: `https://tudominio.com/login`
- COOP headers ya configurados en backend (`same-origin-allow-popups`)
- `itp_support: true` habilitado para Safari Intelligent Tracking Prevention

### MercadoPago Webhooks
- URL de webhook debe ser pública (usar ngrok en desarrollo)
- Configurar `MP_NOTIFICATION_URL` correctamente
- Implementar idempotencia con claves únicas

### TypeScript Strict Mode
- Backend usa `strict: false` por compatibilidad
- Frontend usa `strict: true`
- Tener cuidado al compartir tipos entre ambos

---

## API Endpoints Reference

### Autenticación
- `POST /api/user/register` - Registro
- `POST /api/user/login` - Login
- `POST /api/user/login/google` - Login con Google
- `GET /api/user/profile` - Perfil (auth)

### Eventos
- `GET /api/event` - Listar eventos
- `GET /api/event/:id` - Detalle de evento
- `POST /api/event` - Crear evento (organizer)
- `PUT /api/event/:id` - Actualizar evento (organizer)
- `DELETE /api/event/:id` - Eliminar evento (organizer)

### Tickets
- `GET /api/ticket` - Mis tickets (auth)
- `POST /api/ticket` - Comprar ticket (auth)
- `GET /api/ticket/:id/qr` - Generar QR (auth)
- `GET /api/ticket/:id/pdf` - Generar PDF (auth)

### Pagos
- `POST /api/payment/preference` - Crear preferencia MP
- `POST /api/payment/webhook` - Webhook MP
- `GET /api/payment/success` - Callback éxito
- `GET /api/payment/failure` - Callback fallo

### Scanner
- `POST /api/scanner/validate` - Validar ticket QR (auth)

### Admin
- `GET /api/admin/stats` - Estadísticas globales (admin)
- `GET /api/admin/users` - Listar usuarios (admin)

---

## External Services Integration

### MercadoPago
- SDK oficial `@mercadopago/sdk-node`
- Soporte para Marketplace (organizadores conectan su cuenta)
- Webhooks para notificaciones de pago
- Idempotencia implementada para evitar duplicados

### Google OAuth 2.0
- Google Identity Services SDK
- **Flujo popup** para Chrome/Desktop (mejor UX)
- **Flujo redirect** para Safari iOS (evita bloqueo de popups)
- **FedCM API** cuando está disponible (futuro estándar)
- **ITP Support** habilitado para Safari Intelligent Tracking Prevention

### Email (Brevo/Sendinblue)
- SMTP para envío de tickets
- Templates HTML para confirmaciones

### Redis
- Caché de sesiones y datos frecuentes
- Rate limiting distribuido (opcional)

---

*Documento generado para agentes de IA. Para información más detallada, consultar README.md y la documentación en cada carpeta.*
