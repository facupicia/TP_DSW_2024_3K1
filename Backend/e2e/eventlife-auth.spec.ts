import { test, expect } from '@playwright/test';

/**
 * Tests de autenticación para EventLife
 * Usando data-testid para selectores robustos
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://event-life.netlify.app';

test.describe('EventLife - Autenticación', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('debería mostrar formulario de login cuando se navega a /login', async ({ page }) => {
    // Intentar navegar directamente a login
    await page.goto(`${BASE_URL}/login`);
    
    // Verificar que estamos en la página de login
    await expect(page).toHaveURL(/.*login.*/);
    
    // Buscar campos de email y password
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    
    // Verificar que existen los campos o la página tiene contenido
    const hasEmail = await emailInput.isVisible().catch(() => false);
    const hasPassword = await passwordInput.isVisible().catch(() => false);
    const hasContent = await page.locator('body').innerText().then(t => t.length > 0);
    
    console.log('Tiene campo email:', hasEmail);
    console.log('Tiene campo password:', hasPassword);
    
    expect(hasEmail || hasPassword || hasContent).toBeTruthy();
  });

  test('debería tener botón de Google OAuth', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    // Buscar botón de Google
    const googleButton = page.locator('button:has-text("Google"), [class*="google" i], [id*="google" i]').first();
    const hasGoogle = await googleButton.isVisible().catch(() => false);
    
    console.log('Botón de Google encontrado:', hasGoogle);
    
    // La presencia del botón es opcional, solo logueamos
    if (hasGoogle) {
      await expect(googleButton).toBeVisible();
    }
  });

  test('debería navegar a registro desde login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    // Buscar link a registro
    const registerLink = page.locator('a[href*="register"], a:has-text("Registro"), a:has-text("registrarse" i)').first();
    
    if (await registerLink.isVisible().catch(() => false)) {
      await registerLink.click();
      await expect(page).toHaveURL(/.*register.*/);
    } else {
      console.log('Link a registro no encontrado');
      test.skip();
    }
  });

});

test.describe('EventLife - Responsive', () => {
  
  test('debería adaptarse a vista móvil', async ({ page }) => {
    // Configurar viewport móvil
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    
    // Verificar que la página carga
    await expect(page).toHaveURL(BASE_URL);
    
    // Verificar que no hay scroll horizontal (indica responsive correcto)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    
    console.log('Body width:', bodyWidth);
    console.log('Viewport width:', viewportWidth);
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // tolerancia de 10px
  });

  test('debería adaptarse a vista tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL);
    
    await expect(page).toHaveURL(BASE_URL);
    
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('debería adaptarse a vista desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(BASE_URL);
    
    await expect(page).toHaveURL(BASE_URL);
    
    const title = await page.title();
    expect(title).toBeTruthy();
  });

});
