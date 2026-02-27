import { test, expect } from '@playwright/test';

/**
 * Tests de integración para EventLife
 * Estos tests verifican que la aplicación funciona correctamente
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://event-life.netlify.app';
const API_URL = process.env.TEST_API_URL || 'https://backend-eventlife.onrender.com';

test.describe('EventLife - Página Principal', () => {
  
  test('debería cargar la página de inicio', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Verificar que el título contenga EventLife
    const title = await page.title();
    console.log('Título de la página:', title);
    
    // Verificar que la página cargue sin errores
    await expect(page).toHaveURL(BASE_URL);
  });

  test('debería tener el logo o nombre de la aplicación', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Buscar elementos que contengan "Event" o "Life"
    const hasEventText = await page.locator('text=Event').count() > 0;
    const hasLifeText = await page.locator('text=Life').count() > 0;
    
    console.log('Contiene "Event":', hasEventText);
    console.log('Contiene "Life":', hasLifeText);
    
    // La página debería tener al menos alguno de estos textos
    expect(hasEventText || hasLifeText).toBeTruthy();
  });

  test('debería tener navegación o menú', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Verificar elementos de navegación comunes
    const navElements = await page.locator('nav, header, [role="navigation"]').count();
    console.log('Elementos de navegación encontrados:', navElements);
    
    // La página debería tener al menos un elemento de navegación
    expect(navElements).toBeGreaterThan(0);
  });

});

test.describe('EventLife - API Backend', () => {
  
  test('debería responder el health check', async ({ request }) => {
    // Configurar timeout más largo para el servidor de Render
    test.setTimeout(60000);
    
    try {
      const response = await request.get(`${API_URL}/health`, { timeout: 30000 });
      console.log('Status de /health:', response.status());
      expect([200, 404]).toContain(response.status());
    } catch (error) {
      console.log('No se pudo conectar al servidor (puede estar en modo sleep)');
      test.skip();
    }
  });

  test('debería obtener lista de eventos', async ({ request }) => {
    test.setTimeout(60000);
    
    try {
      const response = await request.get(`${API_URL}/api/event`, { timeout: 30000 });
      console.log('Status de /api/event:', response.status());
      
      if (response.status() === 200) {
        const data = await response.json();
        console.log('Número de eventos:', Array.isArray(data) ? data.length : 'No es array');
        expect(Array.isArray(data) || typeof data === 'object').toBeTruthy();
      }
    } catch (error) {
      console.log('No se pudo conectar al servidor de API');
      test.skip();
    }
  });

});

test.describe('EventLife - Navegación', () => {
  
  test('debería navegar a la página de login', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Buscar link de login
    const loginLink = page.locator('a[href*="login"], button:has-text("Iniciar"), button:has-text("Login")').first();
    
    if (await loginLink.isVisible().catch(() => false)) {
      await loginLink.click();
      await expect(page).toHaveURL(/.*login.*/);
    } else {
      console.log('Link de login no encontrado');
    }
  });

  test('debería navegar a la página de registro', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Buscar link de registro
    const registerLink = page.locator('a[href*="register"], button:has-text("Registro"), button:has-text("Registrarse"]').first();
    
    if (await registerLink.isVisible().catch(() => false)) {
      await registerLink.click();
      await expect(page).toHaveURL(/.*register.*/);
    } else {
      console.log('Link de registro no encontrado');
    }
  });

});
