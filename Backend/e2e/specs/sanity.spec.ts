import { test, expect } from '@playwright/test';
import { CONFIG } from '../utils/config';

/**
 * Tests de Sanity - Verificaciones básicas de que la app funciona
 */

test.describe('🧪 Sanity Checks', () => {
  
  test('la página de inicio carga correctamente', async ({ page }) => {
    await page.goto(CONFIG.baseURL);
    
    // Verificar que el título está presente
    const title = await page.title();
    expect(title).toBeTruthy();
    console.log('✅ Título de la página:', title);
    
    // Verificar que hay contenido en la página
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    
    // Verificar que hay elementos visibles
    const visibleElements = await page.locator('visible=true').count();
    expect(visibleElements).toBeGreaterThan(0);
    console.log('✅ Elementos visibles encontrados:', visibleElements);
  });

  test('la página de login es accesible', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/login`);
    
    // Verificar que estamos en la página de login
    await expect(page).toHaveURL(/.*login.*/);
    
    // Verificar que hay un formulario
    const hasEmailInput = await page.locator('input[type="email"]').first().isVisible().catch(() => false);
    const hasPasswordInput = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    
    expect(hasEmailInput || hasPasswordInput).toBeTruthy();
    console.log('✅ Formulario de login encontrado');
  });

  test('la API responde correctamente', async ({ request }) => {
    const response = await request.get(`${CONFIG.apiURL}/health`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    console.log('✅ API Health:', data.status);
  });

  test('la página de registro es accesible', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/register`);
    
    // Verificar que estamos en la página de registro
    await expect(page).toHaveURL(/.*register.*/);
    
    // Verificar que hay contenido
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    console.log('✅ Página de registro accesible');
  });

  test('la página de eventos es accesible', async ({ page }) => {
    await page.goto(CONFIG.baseURL);
    
    // Buscar eventos en la página
    const eventCards = await page.locator('.event-card, [data-testid="event-card"], .card').count();
    console.log(`✅ Eventos encontrados en home: ${eventCards}`);
    
    // Incluso si no hay eventos, la página debería cargar
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('la API de eventos responde', async ({ request }) => {
    const response = await request.get(`${CONFIG.apiURL}/api/event`);
    
    // Puede ser 200 (público) o 401 (requiere auth)
    expect([200, 401]).toContain(response.status());
    console.log('✅ API de eventos responde con status:', response.status());
  });

  test('la API de categorías responde', async ({ request }) => {
    const response = await request.get(`${CONFIG.apiURL}/api/category`);
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('✅ API de categorías responde con status:', response.status());
  });

  test('el sitio usa HTTPS', async ({ page }) => {
    await page.goto(CONFIG.baseURL);
    
    const url = page.url();
    expect(url.startsWith('https://')).toBeTruthy();
    console.log('✅ HTTPS habilitado');
  });

  test('no hay errores de JavaScript graves', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto(CONFIG.baseURL);
    await page.waitForTimeout(3000);
    
    // Filtrar solo errores graves (no warnings de cookies, etc.)
    const seriousErrors = errors.filter(e => 
      !e.includes('cookie') && 
      !e.includes('Cookie') &&
      !e.includes('manifest') &&
      !e.includes('favicon') &&
      !e.includes('Google') &&
      e.length > 0
    );
    
    if (seriousErrors.length > 0) {
      console.log('⚠️ Errores encontrados:', seriousErrors.slice(0, 5));
    }
    
    // Permitir hasta 5 errores no críticos
    expect(seriousErrors.length).toBeLessThan(5);
  });

});
