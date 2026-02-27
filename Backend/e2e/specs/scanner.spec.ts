import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { CONFIG } from '../utils/config';

/**
 * Tests de Scanner QR y Validación de Entradas
 * CRÍTICO: Validación de tickets en puerta del evento
 */

test.describe('📱 Scanner - Validación de Entradas', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login como scanner o organizer con permisos de scanner
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
  });

  test('debería acceder a la página de scanner', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    // Verificar que carga el scanner
    await expect(page.locator('.scanner-container, [data-testid="qr-scanner"], video').first()).toBeVisible();
  });

  test('debería mostrar interfaz de escaneo', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    // Verificar elementos del scanner
    const hasScanner = await page.locator('.scanner-viewport, video, canvas, [data-testid="camera-preview"]').first().isVisible().catch(() => false);
    const hasInstructions = await page.locator('text=escanear, text=QR, text=código').first().isVisible().catch(() => false);
    
    expect(hasScanner || hasInstructions).toBeTruthy();
  });

  test('debería mostrar resultado de validación exitosa', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    // Simular entrada de código QR válido (mock)
    const qrInput = page.locator('input[placeholder*="QR"], input[name="qrCode"], [data-testid="qr-input"]').first();
    
    if (await qrInput.isVisible().catch(() => false)) {
      // Usar un código de test
      await qrInput.fill('VALID-TEST-CODE-12345');
      await page.keyboard.press('Enter');
      
      // Verificar resultado
      await page.waitForLoadState('networkidle');
      
      const resultVisible = await page.locator('.scan-result, [data-testid="scan-result"]').first().isVisible().catch(() => false);
      expect(resultVisible).toBeTruthy();
    }
  });

  test('debería mostrar error para código QR inválido', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    const qrInput = page.locator('input[placeholder*="QR"], input[name="qrCode"], [data-testid="qr-input"]').first();
    
    if (await qrInput.isVisible().catch(() => false)) {
      await qrInput.fill('INVALID-CODE-99999');
      await page.keyboard.press('Enter');
      
      await page.waitForLoadState('networkidle');
      
      // Verificar mensaje de error
      const errorVisible = await page.locator('.error, .invalid, text=inválido, text=no válido').first().isVisible().catch(() => false);
      expect(errorVisible).toBeTruthy();
    }
  });

  test('debería marcar entrada como usada', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    const qrInput = page.locator('input[placeholder*="QR"], input[name="qrCode"]').first();
    
    if (await qrInput.isVisible().catch(() => false)) {
      await qrInput.fill('VALID-TEST-CODE-12345');
      await page.keyboard.press('Enter');
      
      await page.waitForLoadState('networkidle');
      
      // Buscar botón de confirmar/marcar usada
      const confirmButton = page.locator('button:has-text("Confirmar"), button:has-text("Marcar"), button:has-text("Validar"), [data-testid="confirm-entry"]').first();
      
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
        
        // Verificar mensaje de éxito
        await expect(page.locator('.success, .toast-success, text=validado, text=confirmado').first()).toBeVisible();
      }
    }
  });

  test('debería mostrar información del ticket validado', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    const qrInput = page.locator('input[placeholder*="QR"], input[name="qrCode"]').first();
    
    if (await qrInput.isVisible().catch(() => false)) {
      await qrInput.fill('VALID-TEST-CODE-12345');
      await page.keyboard.press('Enter');
      
      await page.waitForLoadState('networkidle');
      
      // Verificar información mostrada
      const hasTicketInfo = await page.locator('.ticket-info, .attendee-info, [data-testid="ticket-details"]').first().isVisible().catch(() => false);
      expect(hasTicketInfo).toBeTruthy();
    }
  });

  test('debería prevenir doble validación del mismo ticket', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    const qrInput = page.locator('input[placeholder*="QR"], input[name="qrCode"]').first();
    
    if (await qrInput.isVisible().catch(() => false)) {
      // Usar un código de ticket ya usado
      await qrInput.fill('ALREADY-USED-CODE-99999');
      await page.keyboard.press('Enter');
      
      await page.waitForLoadState('networkidle');
      
      // Verificar mensaje de ticket ya usado
      const alreadyUsed = await page.locator('text=ya usado, text=ya fue, text=already used, .warning').first().isVisible().catch(() => false);
      expect(alreadyUsed).toBeTruthy();
    }
  });

  test('debería permitir cambiar cámara', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    const switchCameraButton = page.locator('button:has-text("Cambiar"), button:has([class*="camera"]), [data-testid="switch-camera"]').first();
    
    if (await switchCameraButton.isVisible().catch(() => false)) {
      await switchCameraButton.click();
      
      // No debería haber error
      const error = await page.locator('.error, .camera-error').first().isVisible().catch(() => false);
      expect(error).toBeFalsy();
    }
  });

  test('debería funcionar en modo manual (sin cámara)', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    // Verificar que hay input manual como alternativa
    const hasManualInput = await page.locator('input[type="text"], input[placeholder*="código"]').first().isVisible().catch(() => false);
    const hasManualButton = await page.locator('button:has-text("Manual"), button:has-text("ingresar")').first().isVisible().catch(() => false);
    
    expect(hasManualInput || hasManualButton).toBeTruthy();
  });
});

test.describe('📱 Scanner - Accesos y Permisos', () => {
  
  test('no debería permitir acceso a usuarios sin permisos de scanner', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Login como usuario regular
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    // Intentar acceder a scanner
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    // Debería redirigir o mostrar error 403
    const isRedirected = !page.url().includes('/scanner');
    const hasForbidden = await page.locator('text=403, text=Forbidden, text=no tienes permisos, text=acceso denegado').first().isVisible().catch(() => false);
    
    expect(isRedirected || hasForbidden).toBeTruthy();
    
    await context.close();
  });

  test('debería mostrar historial de validaciones', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    
    await page.goto(`${CONFIG.baseURL}/scanner/history`);
    
    // Verificar lista de validaciones
    const hasHistory = await page.locator('.history-list, .validations-list, [data-testid="scan-history"]').first().isVisible().catch(() => false);
    const emptyState = await page.locator('text=no hay, text=sin registros, .empty-state').first().isVisible().catch(() => false);
    
    expect(hasHistory || emptyState).toBeTruthy();
  });

  test('debería mostrar estadísticas de validación del evento', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    
    await page.goto(`${CONFIG.baseURL}/scanner/stats`);
    
    // Verificar estadísticas
    const hasStats = await page.locator('.stats-container, .validation-stats, [data-testid="scanner-stats"]').first().isVisible().catch(() => false);
    expect(hasStats).toBeTruthy();
  });
});
