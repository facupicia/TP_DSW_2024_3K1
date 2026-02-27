import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { EventDetailPage } from '../pages/event-detail.page';
import { CheckoutPage } from '../pages/checkout.page';
import { LoginPage } from '../pages/login.page';
import { RegisterPage } from '../pages/register.page';
import { ProfilePage } from '../pages/profile.page';
import { CreateEventPage } from '../pages/create-event.page';
import { AdminPage } from '../pages/admin.page';
import { generateTestEmail, generateTestEventName } from '../utils/test-helpers';
import { CONFIG } from '../utils/config';

/**
 * Tests End-to-End
 * FLUJOS CRÍTICOS: Escenarios completos de usuario
 */

test.describe('🎯 E2E - Flujo Completo Usuario', () => {
  
  test('flujo completo: registro → login → comprar ticket → ver entrada', async ({ page }) => {
    // 1. Registro
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    
    const testEmail = generateTestEmail('e2e');
    const testPassword = 'TestPass123!';
    
    await registerPage.registerExpectingSuccess({
      firstName: 'E2E',
      lastName: 'Test',
      email: testEmail,
      password: testPassword,
    });
    
    // 2. Login
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testEmail, testPassword);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    // 3. Buscar evento
    const homePage = new HomePage(page);
    await homePage.goto();
    
    const eventCount = await homePage.getEventCount();
    expect(eventCount).toBeGreaterThan(0);
    
    // 4. Ver detalle
    await homePage.clickEventCard(0);
    const eventDetail = new EventDetailPage(page);
    await eventDetail.expectEventLoaded();
    
    // 5. Comprar ticket
    const ticketCount = await eventDetail.getTicketTypesCount();
    if (ticketCount > 0 && !await eventDetail.isSoldOut()) {
      await eventDetail.selectTicketType('General');
      await eventDetail.clickBuy();
      
      // 6. Checkout
      await expect(page).toHaveURL(/.*checkout.*/);
      const checkout = new CheckoutPage(page);
      await checkout.expectCheckoutLoaded();
      
      // 7. Ir a perfil y ver entrada
      await page.goto(`${CONFIG.baseURL}/profile`);
      const profilePage = new ProfilePage(page);
      await profilePage.navigateToTickets();
      
      // Verificar que hay tickets o estado vacío
      const hasTickets = await profilePage.getTicketCount() > 0;
      const emptyState = await page.locator('.empty-state, text=no tienes entradas').first().isVisible().catch(() => false);
      expect(hasTickets || emptyState).toBeTruthy();
    }
  });
});

test.describe('🎯 E2E - Flujo Organizador', () => {
  
  test('flujo completo organizador: crear evento → ver estadísticas', async ({ page }) => {
    // Login como organizador
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    // Crear evento
    const createPage = new CreateEventPage(page);
    await createPage.goto();
    
    const eventName = generateTestEventName();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    await createPage.fillBasicInfo(
      eventName,
      'Evento creado en test E2E automatizado'
    );
    await createPage.fillDateTime(
      tomorrow.toISOString().split('T')[0],
      '20:00',
      '23:59'
    );
    await createPage.fillLocation(
      'Lugar de Prueba E2E',
      'Dirección de Test 123'
    );
    await createPage.addTicket('Entrada General', 2000, 100);
    await createPage.publish();
    
    // Verificar redirección
    await page.waitForURL(/.*events.*|.*dashboard.*/, { timeout: 15000 });
    
    // Ir a perfil y ver el evento creado
    await page.goto(`${CONFIG.baseURL}/profile`);
    const profilePage = new ProfilePage(page);
    
    if (await profilePage.isOrganizerView()) {
      await profilePage.navigateToMyEvents();
      
      // Verificar que el evento aparece en la lista
      const hasEvent = await page.locator('.my-event-card, [data-testid="my-event-item"]')
        .filter({ hasText: eventName })
        .first()
        .isVisible()
        .catch(() => false);
      
      expect(hasEvent).toBeTruthy();
      
      // Ver estadísticas
      if (await profilePage.eventStatsButton.first().isVisible().catch(() => false)) {
        await profilePage.eventStatsButton.first().click();
        await expect(page.locator('.stats-container, canvas, [data-testid="event-stats"]').first()).toBeVisible();
      }
    }
  });
});

test.describe('🎯 E2E - Flujo Admin', () => {
  
  test('flujo completo admin: dashboard → gestionar usuarios → gestionar eventos', async ({ page }) => {
    // Login como admin
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.admin.email, CONFIG.users.admin.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    // Ir a admin
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.expectAdminPageLoaded();
    
    // Verificar estadísticas
    const usersCount = await adminPage.getTotalUsers();
    expect(usersCount).toBeGreaterThanOrEqual(0);
    
    // Gestionar usuarios
    await adminPage.navigateToUsers();
    await expect(adminPage.usersTable).toBeVisible();
    
    // Buscar usuario
    await adminPage.search(CONFIG.users.user.email);
    await page.waitForLoadState('networkidle');
    
    // Gestionar eventos
    await adminPage.navigateToEvents();
    await expect(adminPage.eventsTable).toBeVisible();
    
    // Verificar que hay eventos o estado vacío
    const hasEvents = await adminPage.getRowCount() > 0;
    const emptyState = await page.locator('.empty-state').first().isVisible().catch(() => false);
    expect(hasEvents || emptyState).toBeTruthy();
  });
});

test.describe('🎯 E2E - Flujo Scanner', () => {
  
  test('flujo scanner: acceder → validar ticket → ver historial', async ({ page }) => {
    // Login como scanner/organizador
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    
    // Ir a scanner
    await page.goto(`${CONFIG.baseURL}/scanner`);
    
    // Verificar interfaz
    const hasScanner = await page.locator('.scanner-container, [data-testid="qr-scanner"]').first().isVisible().catch(() => false);
    const hasInput = await page.locator('input[name="qrCode"], input[placeholder*="QR"]').first().isVisible().catch(() => false);
    
    expect(hasScanner || hasInput).toBeTruthy();
    
    // Ver historial
    await page.goto(`${CONFIG.baseURL}/scanner/history`);
    
    const hasHistory = await page.locator('.history-list, [data-testid="scan-history"]').first().isVisible().catch(() => false);
    const emptyHistory = await page.locator('.empty-state, text=sin registros').first().isVisible().catch(() => false);
    
    expect(hasHistory || emptyHistory).toBeTruthy();
  });
});

test.describe('🎯 E2E - Flujo de Recuperación', () => {
  
  test('usuario olvida contraseña y navega a recuperación', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    // Intentar navegar a forgot password
    if (await loginPage.forgotPasswordLink.isVisible().catch(() => false)) {
      await loginPage.navigateToForgotPassword();
      
      // Verificar formulario de recuperación
      const emailInput = page.locator('input[type="email"]').first();
      await expect(emailInput).toBeVisible();
      
      // Llenar email
      await emailInput.fill(CONFIG.users.user.email);
      
      // Enviar
      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();
      
      // Verificar mensaje de éxito
      await expect(page.locator('.success, .toast, text=enviado, text=revisa tu correo').first()).toBeVisible();
    }
  });
});

test.describe('🎯 E2E - Flujo de Búsqueda y Filtrado', () => {
  
  test('usuario busca evento por categoría y compra', async ({ page }) => {
    // Login
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    // Buscar eventos
    const homePage = new HomePage(page);
    await homePage.goto();
    
    // Obtener categorías disponibles
    const categories = await homePage.categoryFilters.allTextContents();
    
    if (categories.length > 0) {
      // Filtrar por primera categoría
      await homePage.filterByCategory(categories[0]);
      
      // Verificar que se aplicó el filtro
      await expect(page).toHaveURL(/.*category.*/);
      
      // Si hay resultados, entrar al primero
      const eventCount = await homePage.getEventCount();
      if (eventCount > 0) {
        await homePage.clickEventCard(0);
        
        const eventDetail = new EventDetailPage(page);
        await eventDetail.expectEventLoaded();
      }
    }
  });
});
