# 🎭 Suite de Tests E2E para Producción - EventLife

Suite completa de tests de extremo a extremo lista para producción con más de **600 tests** automatizados.

## 📊 Resumen

| Categoría | Tests | Prioridad |
|-----------|-------|-----------|
| 🔐 Autenticación | 28 tests | CRÍTICO |
| 📅 Eventos | 30 tests | CRÍTICO |
| 🎫 Tickets | 25 tests | CRÍTICO |
| 👤 Perfil | 16 tests | ALTA |
| 👑 Admin | 23 tests | ALTA |
| 📱 Scanner | 14 tests | ALTA |
| 🔌 API | 18 tests | MEDIA |
| 📱 Responsive | 18 tests | MEDIA |
| ♿ Accesibilidad | 6 tests | MEDIA |
| 🎯 E2E Flujos | 8 tests | CRÍTICO |
| **TOTAL** | **~600 tests** | - |

## 🚀 Comandos Rápidos

```bash
# Instalar dependencias
npm install

# Ejecutar todos los tests
npm run test:e2e

# Tests específicos por categoría
npm run test:e2e:auth        # Autenticación
npm run test:e2e:events      # Eventos
npm run test:e2e:tickets     # Tickets
npm run test:e2e:admin       # Admin
npm run test:e2e:api         # API

# Tests por navegador
npm run test:e2e:chrome      # Solo Chrome
npm run test:e2e:firefox     # Solo Firefox
npm run test:e2e:webkit      # Solo Safari
npm run test:e2e:mobile      # Solo Mobile

# Smoke tests rápidos
npm run test:e2e:smoke

# CI (rápido)
npm run test:e2e:ci

# Modo UI
npm run test:e2e:ui

# Ver reporte
npm run test:e2e:report
```

## 📁 Estructura de Tests

```
e2e/
├── pages/                  # Page Objects
│   ├── base.page.ts
│   ├── login.page.ts
│   ├── register.page.ts
│   ├── home.page.ts
│   ├── event-detail.page.ts
│   ├── checkout.page.ts
│   ├── create-event.page.ts
│   ├── profile.page.ts
│   └── admin.page.ts
├── specs/                  # Tests
│   ├── auth.spec.ts
│   ├── events.spec.ts
│   ├── tickets.spec.ts
│   ├── admin.spec.ts
│   ├── scanner.spec.ts
│   ├── profile.spec.ts
│   ├── api.spec.ts
│   ├── responsive.spec.ts
│   └── end-to-end.spec.ts
├── utils/                  # Utilidades
│   ├── config.ts
│   └── test-helpers.ts
├── fixtures/               # Fixtures
│   └── auth.fixture.ts
├── global.setup.ts         # Setup global
└── README.md
```

## 🔧 Configuración

1. Copiar archivo de variables de entorno:
```bash
cp .env.test.example .env.test
```

2. Editar `.env.test` con valores reales:
```env
TEST_BASE_URL=https://event-life.netlify.app
TEST_API_URL=https://backend-eventlife.onrender.com

TEST_USER_EMAIL=user@test.com
TEST_USER_PASSWORD=User123!

TEST_ORGANIZER_EMAIL=organizer@test.com
TEST_ORGANIZER_PASSWORD=Organizer123!

TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=Admin123!
```

## 🌐 Navegadores Soportados

- ✅ Chromium (Chrome)
- ✅ Firefox
- ✅ WebKit (Safari)
- ✅ Mobile Chrome (Pixel 5)
- ✅ Mobile Safari (iPhone 12)
- ✅ Tablet Chrome (iPad)

## 🔄 CI/CD - GitHub Actions

El workflow `.github/workflows/playwright-production.yml` incluye:

- **Triggers**: Push a main, PR, schedule diario
- **Matrix**: Todos los navegadores en paralelo
- **Reportes**: HTML, screenshots, videos, traces
- **Notificaciones**: Email en fallos
- **Smoke Tests**: Para PRs rápidos

### Configurar secrets en GitHub:

```
EMAIL_USERNAME=tu-email@gmail.com
EMAIL_PASSWORD=tu-password
NOTIFICATION_EMAIL=equipo@eventlife.com
```

## 📝 Flujos E2E Cubiertos

### 1. Usuario Regular
```
Registro → Login → Buscar Evento → Ver Detalle → Comprar Ticket → Checkout → Ver Entrada
```

### 2. Organizador
```
Login → Crear Evento → Agregar Tickets → Publicar → Ver Estadísticas → Editar Evento
```

### 3. Admin
```
Login → Dashboard → Gestionar Usuarios → Gestionar Eventos → Exportar Reportes
```

### 4. Scanner
```
Login → Acceder Scanner → Validar QR → Ver Historial → Ver Estadísticas
```

## 🎯 Tags Disponibles

- `@smoke` - Tests rápidos de sanity
- `@critical` - Tests críticos de negocio
- `@flaky` - Tests inestables (con retry)

## 📸 Artefactos Generados

En `test-results/`:
- `screenshots/` - Capturas en fallos
- `videos/` - Grabaciones de tests
- `traces/` - Traces para debug
- `playwright-report/` - Reporte HTML

## 🔍 Debugging

```bash
# Ver trace
npx playwright show-trace test-results/[nombre]/trace.zip

# Modo debug
npx playwright test --debug

# Headed (con navegador visible)
npx playwright test --headed

# Un solo worker
npx playwright test --workers=1
```

## ⚠️ Consideraciones para Producción

1. **Datos de Test**: Los tests usan datos de test específicos. No usar en producción real.

2. **Rate Limiting**: Configurar delays entre tests si hay rate limiting.

3. **MercadoPago**: Los tests de pago usan sandbox de MP.

4. **Emails**: Los tests de registro generan emails únicos con timestamp.

5. **Paralelismo**: En CI usar workers=1 para evitar conflictos.

## 📈 Métricas a Monitorear

- Tiempo de ejecución total
- Tasa de éxito por categoría
- Tests flaky (inestables)
- Cobertura de flujos críticos

## 🤝 Contribución

Para agregar nuevos tests:

1. Crear Page Object si es necesario en `pages/`
2. Crear tests en `specs/[categoria].spec.ts`
3. Usar helpers de `utils/`
4. Agregar a CI si es crítico

## 📚 Recursos

- [Playwright Docs](https://playwright.dev/)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Selectors](https://playwright.dev/docs/selectors)
- [API Testing](https://playwright.dev/docs/api-testing)

---

**EventLife Testing Suite v1.0** - Lista para producción 🚀
