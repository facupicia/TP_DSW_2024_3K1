# Playwright E2E Tests - EventLife

Este directorio contiene tests de extremo a extremo (E2E) para la aplicación EventLife usando Playwright.

## 🚀 Instalación

Los navegadores ya están instalados. Si necesitas reinstalarlos:

```bash
npx playwright install
```

## 📁 Estructura

```
e2e/
├── example.spec.ts           # Tests de ejemplo de Playwright
├── eventlife.spec.ts         # Tests de integración para EventLife
├── eventlife-auth.spec.ts    # Tests de autenticación y responsive
└── README.md                 # Este archivo
```

## 🧪 Comandos

### Ejecutar todos los tests
```bash
npm run test:e2e
```

### Ejecutar con navegador visible (headed)
```bash
npm run test:e2e:headed
```

### Modo UI interactivo
```bash
npm run test:e2e:ui
```

### Debug
```bash
npm run test:e2e:debug
```

### Ver reporte HTML
```bash
npm run test:e2e:report
```

### Ejecutar tests específicos
```bash
npx playwright test eventlife.spec.ts
npx playwright test --grep "autenticación"
```

### Ejecutar en un solo navegador
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## 🛠️ Herramientas

### Codegen - Generar código automáticamente
```bash
# Abrir codegen en el sitio de producción
npx playwright codegen https://event-life.netlify.app

# Generar código para Python
npx playwright codegen --target=python https://event-life.netlify.app

# Emular dispositivo móvil
npx playwright codegen --device="iPhone 13" https://event-life.netlify.app
```

### Inspector - Debug paso a paso
```bash
# Ejecutar con inspector
PWDEBUG=1 npx playwright test

# O usar
npx playwright test --debug
```

### Abrir página en navegador específico
```bash
# Abrir en Chromium
npx playwright open https://event-life.netlify.app

# Abrir en WebKit (Safari)
npx playwright open -b webkit https://event-life.netlify.app

# Emular dispositivo
npx playwright open --device="Pixel 5" https://event-life.netlify.app
```

## 📊 Configuración

### Variables de entorno

Puedes configurar las URLs de test mediante variables de entorno:

```bash
# Windows PowerShell
$env:TEST_BASE_URL="http://localhost:4200"
$env:TEST_API_URL="http://localhost:3000"
npx playwright test

# Windows CMD
set TEST_BASE_URL=http://localhost:4200
set TEST_API_URL=http://localhost:3000
npx playwright test
```

### Configuración de dispositivos

El archivo `playwright.config.ts` ya incluye configuración para:
- Chromium (Desktop Chrome)
- Firefox (Desktop Firefox)
- WebKit (Desktop Safari)

Puedes descomentar las secciones de dispositivos móviles para probar en:
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

## 📝 Escribir Tests

### Ejemplo básico
```typescript
import { test, expect } from '@playwright/test';

test('debería cargar la página', async ({ page }) => {
  await page.goto('https://event-life.netlify.app');
  await expect(page).toHaveTitle(/EventLife/);
});
```

### Usar selectores
```typescript
// Por rol
await page.getByRole('button', { name: 'Iniciar sesión' }).click();

// Por texto
await page.getByText('Bienvenido').isVisible();

// Por placeholder
await page.getByPlaceholder('Email').fill('test@example.com');

// Por test ID (recomendado)
await page.getByTestId('login-button').click();
```

### Tests API
```typescript
import { test, expect } from '@playwright/test';

test('debería obtener eventos', async ({ request }) => {
  const response = await request.get('https://backend-eventlife.onrender.com/api/event');
  expect(response.ok()).toBeTruthy();
});
```

## 📈 Reportes

Los reportes se generan en formato HTML en `playwright-report/`:

```bash
# Generar reporte
npx playwright test --reporter=html

# Ver reporte
npx playwright show-report
```

También se pueden generar reportes en otros formatos:
```bash
npx playwright test --reporter=json
npx playwright test --reporter=junit
npx playwright test --reporter=line
```

## 🔧 Troubleshooting

### Navegadores no instalados
```bash
npx playwright install
```

### Tests fallan por timeout
```bash
# Aumentar timeout global
npx playwright test --timeout=60000
```

### Tests flaky (intermitentes)
```bash
# Reintentar tests fallidos
npx playwright test --retries=3
```

### Modo headed para debug
```bash
npx playwright test --headed --timeout=0
```

## 📚 Recursos

- [Documentación de Playwright](https://playwright.dev/)
- [API Reference](https://playwright.dev/docs/api/class-playwright)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Selectors](https://playwright.dev/docs/selectors)
