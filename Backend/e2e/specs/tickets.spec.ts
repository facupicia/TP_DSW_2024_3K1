import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { EventDetailPage } from '../pages/event-detail.page';
import { CheckoutPage } from '../pages/checkout.page';
import { LoginPage } from '../pages/login.page';
import { ProfilePage } from '../pages/profile.page';
import { CONFIG } from '../utils/config';

/**
 * Tests de Compra de Tickets
 * CRÍTICO: Flujo completo de compra desde selección hasta pago
 */

test.describe('🎫 Tickets - Compra Flujo Completo', () => {
  test.beforeEach(async ({ page }) => {
    // Login antes de cada test de compra
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    await page.waitForURL(/\/(home|dashboard|events)?$/, { timeout: 10000 });
  });

  test('debería mostrar tipos de entradas en el evento', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    const ticketCount = await eventDetail.getTicketTypesCount();
    
    expect(ticketCount).toBeGreaterThan(0);
    
    // Verificar que se muestra precio
    await expect(eventDetail.ticketTypes.first()).toContainText(/\$|Gratis|Free/);
  });

  test('debería seleccionar tipo y cantidad de entradas', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    
    // Seleccionar tipo de entrada
    await eventDetail.selectTicketType('General');
    
    // Establecer cantidad
    if (await eventDetail.ticketQuantityInput.isVisible().catch(() => false)) {
      await eventDetail.setTicketQuantity(2);
    }
    
    await expect(eventDetail.buyButton).toBeEnabled();
  });

  test('debería navegar al checkout al comprar', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await eventDetail.selectTicketType('General');
    await eventDetail.clickBuy();
    
    // Verificar que estamos en checkout
    await expect(page).toHaveURL(/.*checkout.*/);
  });

  test('debería mostrar resumen de orden en checkout', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await eventDetail.selectTicketType('General');
    await eventDetail.clickBuy();
    
    const checkout = new CheckoutPage(page);
    await checkout.expectCheckoutLoaded();
    
    // Verificar total
    const total = await checkout.getTotalAmount();
    expect(total).toBeTruthy();
  });

  test('debería aplicar cupón de descuento', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await eventDetail.selectTicketType('General');
    await eventDetail.clickBuy();
    
    const checkout = new CheckoutPage(page);
    
    if (await checkout.couponInput.isVisible().catch(() => false)) {
      await checkout.applyCoupon('DESCUENTO10');
      
      // Verificar que el cupón fue aplicado o mostró error
      const toast = page.locator('.toast, [data-testid="toast"]');
      await expect(toast).toBeVisible();
    }
  });

  test('debería iniciar pago con MercadoPago', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await eventDetail.selectTicketType('General');
    await eventDetail.clickBuy();
    
    const checkout = new CheckoutPage(page);
    await checkout.expectCheckoutLoaded();
    
    // Verificar método de pago disponible
    if (await checkout.mercadoPagoButton.isVisible().catch(() => false)) {
      await checkout.selectMercadoPago();
    }
    
    // Intentar pagar
    await checkout.clickPay();
    
    // Puede redirigir a MercadoPago o mostrar modal
    await page.waitForLoadState('networkidle');
    
    // Verificar que hay interacción con MP
    const isRedirected = page.url().includes('mercadopago') || page.url().includes('mp');
    const hasModal = await page.locator('.payment-modal, .mercadopago, iframe[name*="MP"]').first().isVisible().catch(() => false);
    
    expect(isRedirected || hasModal).toBeTruthy();
  });

  test('debería cancelar la compra y volver al evento', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await eventDetail.selectTicketType('General');
    await eventDetail.clickBuy();
    
    const checkout = new CheckoutPage(page);
    await checkout.clickCancel();
    
    // Debería volver al evento o al home
    await expect(page).toHaveURL(/.*event.*|\/$/);
  });
});

test.describe('🎫 Tickets - Mis Entradas', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
  });

  test('debería mostrar lista de mis entradas', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/profile`);
    
    const profilePage = new ProfilePage(page);
    await profilePage.navigateToTickets();
    
    // Verificar que se cargaron las entradas (puede estar vacío)
    await expect(page.locator('.tickets-list, [data-testid="tickets-list"], .empty-state').first()).toBeVisible();
  });

  test('debería descargar entrada en PDF', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/profile`);
    
    const profilePage = new ProfilePage(page);
    await profilePage.navigateToTickets();
    
    const ticketCount = await profilePage.getTicketCount();
    
    if (ticketCount > 0) {
      // Esperar descarga
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        profilePage.downloadFirstTicket()
      ]);
      
      expect(download.suggestedFilename()).toContain('.pdf');
    }
  });

  test('debería mostrar código QR de la entrada', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/profile`);
    
    const profilePage = new ProfilePage(page);
    await profilePage.navigateToTickets();
    
    const ticketCount = await profilePage.getTicketCount();
    
    if (ticketCount > 0 && await profilePage.viewQRButton.first().isVisible().catch(() => false)) {
      await profilePage.viewQRCode();
      
      // Verificar que se muestra el QR
      const qrModal = page.locator('.qr-modal, [data-testid="qr-code"], canvas').first();
      await expect(qrModal).toBeVisible();
    }
  });

  test('debería mostrar detalles de la entrada', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/profile`);
    
    const profilePage = new ProfilePage(page);
    await profilePage.navigateToTickets();
    
    const ticketCount = await profilePage.getTicketCount();
    
    if (ticketCount > 0) {
      // Verificar información del ticket
      const ticketInfo = page.locator('.ticket-info, [data-testid="ticket-info"]').first();
      await expect(ticketInfo).toBeVisible();
      
      // Debería tener fecha y evento
      await expect(page.locator('text=/\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4}/').first()).toBeVisible();
    }
  });
});

test.describe('🎫 Tickets - Validaciones', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    await page.waitForURL(/\/(home|dashboard|events)?$/, { timeout: 10000 });
  });

  test('no debería permitir comprar más entradas que el límite', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    
    // Intentar poner cantidad excesiva
    if (await eventDetail.ticketQuantityInput.isVisible().catch(() => false)) {
      await eventDetail.setTicketQuantity(999);
      
      // Verificar validación
      const hasError = await eventDetail.page.locator('.error, .text-danger, [role="alert"]').first().isVisible();
      expect(hasError).toBeTruthy();
    }
  });

  test('debería mostrar evento agotado cuando no hay entradas', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Buscar evento agotado
    const eventCount = await homePage.getEventCount();
    
    for (let i = 0; i < Math.min(eventCount, 5); i++) {
      await homePage.clickEventCard(i);
      
      const eventDetail = new EventDetailPage(page);
      
      if (await eventDetail.isSoldOut()) {
        // Verificar que no se puede comprar
        await expect(eventDetail.buyButton).toBeDisabled();
        return;
      }
      
      await eventDetail.clickBack();
    }
    
    // Si no encontramos evento agotado, skip
    test.skip();
  });

  test('debería requerir login para comprar', async ({ page, context }) => {
    // Crear nueva página sin sesión
    const newContext = await context.browser().newContext();
    const newPage = await newContext.newPage();
    
    const homePage = new HomePage(newPage);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(newPage);
    await eventDetail.clickBuy();
    
    // Debería redirigir a login
    await expect(newPage).toHaveURL(/.*login.*/);
    
    await newContext.close();
  });
});
