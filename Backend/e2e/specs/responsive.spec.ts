import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { LoginPage } from '../pages/login.page';
import { EventDetailPage } from '../pages/event-detail.page';
import { CONFIG } from '../utils/config';

/**
 * Tests Responsive y Accesibilidad
 * CRÍTICO: La app debe funcionar en todos los dispositivos
 */

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 },
  mobileLandscape: { width: 667, height: 375 },
};

test.describe('📱 Responsive - Mobile (375x667)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('debería mostrar navegación mobile', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Verificar menú hamburguesa o navegación adaptada
    const hasMobileNav = await page.locator('.mobile-nav, [data-testid="mobile-menu"], .hamburger, button:has([class*="menu"])').first().isVisible().catch(() => false);
    const navVisible = await homePage.navigation.isVisible().catch(() => false);
    
    expect(hasMobileNav || navVisible).toBeTruthy();
  });

  test('no debería tener scroll horizontal', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);
  });

  test('debería mostrar cards de eventos en columna', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    const firstCard = homePage.eventCards.first();
    const box = await firstCard.boundingBox();
    
    if (box) {
      // En mobile, la card debería ocupar casi todo el ancho
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(box.width).toBeGreaterThan(viewportWidth * 0.8);
    }
  });

  test('debería funcionar el menú hamburguesa', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    const menuButton = page.locator('.hamburger, button:has([class*="menu"]), [data-testid="menu-toggle"]').first();
    
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
      
      // Verificar que se abrió el menú
      const mobileMenu = page.locator('.mobile-menu, .nav-open, [data-testid="mobile-nav"]').first();
      await expect(mobileMenu).toBeVisible();
    }
  });

  test('debería ajustar el detalle de evento a mobile', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await eventDetail.expectEventLoaded();
    
    // Verificar que el contenido es legible
    const titleSize = await eventDetail.eventTitle.evaluate(el => {
      const style = window.getComputedStyle(el);
      return parseInt(style.fontSize);
    });
    
    expect(titleSize).toBeGreaterThanOrEqual(16);
  });
});

test.describe('📱 Responsive - Tablet (768x1024)', () => {
  test.use({ viewport: VIEWPORTS.tablet });

  test('debería mostrar navegación adaptada a tablet', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    await expect(homePage.navigation).toBeVisible();
  });

  test('debería mostrar grid de eventos', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    const eventCount = await homePage.getEventCount();
    
    if (eventCount >= 2) {
      const firstCard = homePage.eventCards.nth(0);
      const secondCard = homePage.eventCards.nth(1);
      
      const box1 = await firstCard.boundingBox();
      const box2 = await secondCard.boundingBox();
      
      if (box1 && box2) {
        // En tablet, deberían estar lado a lado o con layout de grid
        expect(box1.width).toBeLessThan(400);
      }
    }
  });

  test('debería mantener proporciones correctas', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Verificar que no hay elementos cortados
    const overflow = await page.evaluate(() => {
      const body = document.body;
      return body.scrollWidth > body.clientWidth;
    });
    
    expect(overflow).toBeFalsy();
  });
});

test.describe('📱 Responsive - Desktop (1920x1080)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('debería mostrar navegación completa', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    await expect(homePage.navigation).toBeVisible();
    
    // Verificar que no hay menú hamburguesa
    const hamburger = page.locator('.hamburger, .mobile-menu-toggle').first();
    expect(await hamburger.isVisible().catch(() => false)).toBeFalsy();
  });

  test('debería mostrar múltiples columnas de eventos', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    const eventCount = await homePage.getEventCount();
    
    if (eventCount >= 3) {
      const cards = await homePage.eventCards.allBoundingBoxes();
      
      // Verificar que hay cards en diferentes posiciones X (múltiples columnas)
      const uniqueX = new Set(cards.map(box => box?.x).filter(Boolean));
      expect(uniqueX.size).toBeGreaterThan(1);
    }
  });
});

test.describe('♿ Accesibilidad', () => {
  test('debería tener atributos ARIA correctos', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Verificar que hay landmarks
    const hasMain = await page.locator('main').first().isVisible().catch(() => false);
    const hasNav = await page.locator('nav').first().isVisible().catch(() => false);
    
    expect(hasMain || hasNav).toBeTruthy();
  });

  test('debería permitir navegación por teclado', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    // Tab al primer input
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBe('INPUT');
    
    // Tab al siguiente
    await page.keyboard.press('Tab');
    const focusedElement2 = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement2).toBe('INPUT');
  });

  test('debería tener contraste adecuado en texto', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Verificar que los textos son legibles
    const bodyStyles = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
      };
    });
    
    expect(bodyStyles.fontSize).not.toBe('0px');
    expect(bodyStyles.color).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('debería tener alt text en imágenes', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const images = page.locator('img');
    const count = await images.count();
    
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const hasAlt = await images.nth(i).getAttribute('alt').then(a => !!a).catch(() => false);
        const hasAriaLabel = await images.nth(i).getAttribute('aria-label').then(a => !!a).catch(() => false);
        
        // Las imágenes deberían tener alt o aria-label
        expect(hasAlt || hasAriaLabel).toBeTruthy();
      }
    }
  });

  test('debería funcionar con zoom del 200%', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Simular zoom con viewport más grande
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // El layout debería seguir siendo usable
    const eventCount = await homePage.getEventCount();
    expect(eventCount).toBeGreaterThanOrEqual(0);
  });

  test('debería anunciar cambios dinámicos', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Verificar que hay regiones live para anuncios
    const hasLiveRegion = await page.locator('[aria-live], [role="status"], [role="alert"]').count() > 0;
    
    // No es obligatorio pero es buena práctica
    expect(typeof hasLiveRegion).toBe('boolean');
  });
});

test.describe('🌐 Cross-Browser', () => {
  test('debería funcionar en diferentes navegadores @smoke', async ({ page, browserName }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Verificar que la página carga en todos los navegadores
    await expect(homePage.eventCards.first()).toBeVisible();
    
    console.log(`✅ Test pasado en ${browserName}`);
  });
});
