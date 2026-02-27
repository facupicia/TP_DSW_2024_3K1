import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { EventDetailPage } from '../pages/event-detail.page';
import { CreateEventPage } from '../pages/create-event.page';
import { LoginPage } from '../pages/login.page';
import { generateTestEventName, generateTestEmail } from '../utils/test-helpers';
import { CONFIG } from '../utils/config';

/**
 * Tests de Eventos
 * CRÍTICO: Listado, búsqueda, creación, edición y visualización de eventos
 */

test.describe('📅 Eventos - Listado y Búsqueda', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('debería mostrar lista de eventos en la home', async () => {
    const eventCount = await homePage.getEventCount();
    expect(eventCount).toBeGreaterThan(0);
  });

  test('debería mostrar eventos destacados', async () => {
    await expect(homePage.featuredSection).toBeVisible();
  });

  test('debería mostrar eventos próximos', async () => {
    await expect(homePage.upcomingSection).toBeVisible();
  });

  test('debería buscar eventos por nombre', async () => {
    await homePage.searchEvents('concierto');
    
    // Verificar que hay resultados o mensaje de "no encontrado"
    const hasEvents = await homePage.eventCards.first().isVisible().catch(() => false);
    const hasNoResults = await homePage.page.locator('text=no se encontraron, text=No results').first().isVisible().catch(() => false);
    
    expect(hasEvents || hasNoResults).toBeTruthy();
  });

  test('debería filtrar eventos por categoría', async () => {
    const categories = await homePage.categoryFilters.allTextContents();
    
    if (categories.length > 0) {
      await homePage.filterByCategory(categories[0]);
      await homePage.waitForLoading();
      
      // Verificar que se aplicó el filtro
      await expect(homePage.page).toHaveURL(/.*category.*/);
    }
  });

  test('debería navegar al detalle de un evento', async ({ page }) => {
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await eventDetail.expectEventLoaded();
  });

  test('debería mostrar información completa del evento', async ({ page }) => {
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await expect(eventDetail.eventTitle).toBeVisible();
    await expect(eventDetail.eventDate).toBeVisible();
    await expect(eventDetail.eventLocation).toBeVisible();
    await expect(eventDetail.eventDescription).toBeVisible();
  });

  test('debería mostrar tipos de entradas disponibles', async ({ page }) => {
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    const ticketCount = await eventDetail.getTicketTypesCount();
    expect(ticketCount).toBeGreaterThan(0);
  });

  test('debería mostrar mapa de ubicación', async ({ page }) => {
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    await expect(eventDetail.map).toBeVisible();
  });
});

test.describe('📅 Eventos - Creación (Organizador)', () => {
  let createEventPage: CreateEventPage;

  test.beforeEach(async ({ page }) => {
    // Login como organizador
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    // Ir a crear evento
    createEventPage = new CreateEventPage(page);
    await createEventPage.goto();
  });

  test('debería mostrar el formulario de creación de evento', async () => {
    await expect(createEventPage.titleInput).toBeVisible();
    await expect(createEventPage.descriptionInput).toBeVisible();
    await expect(createEventPage.dateInput).toBeVisible();
    await expect(createEventPage.locationInput).toBeVisible();
  });

  test('debería crear un evento básico exitosamente', async ({ page }) => {
    const eventName = generateTestEventName();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    await createEventPage.fillBasicInfo(
      eventName,
      'Descripción de prueba para el evento de testing automatizado'
    );
    
    await createEventPage.fillDateTime(dateStr, '19:00', '23:00');
    await createEventPage.fillLocation(
      'Teatro Municipal',
      'Av. Corrientes 1234, CABA'
    );
    
    await createEventPage.addTicket('Entrada General', 1500, 100, 'Acceso general al evento');
    
    await createEventPage.publish();
    
    // Verificar redirección al evento creado o lista de eventos
    await page.waitForURL(/.*events.*|.*dashboard.*/, { timeout: 15000 });
  });

  test('debería guardar evento como borrador', async ({ page }) => {
    const eventName = generateTestEventName();
    
    await createEventPage.fillBasicInfo(
      eventName,
      'Evento en borrador para testing'
    );
    
    await createEventPage.saveDraft();
    
    // Verificar mensaje de éxito o redirección
    await expect(page.locator('.success, [data-testid="success-message"], .toast-success').first()).toBeVisible();
  });

  test('debería validar campos obligatorios', async () => {
    await createEventPage.publishButton.click();
    
    await createEventPage.expectValidationError('title');
    await createEventPage.expectValidationError('description');
    await createEventPage.expectValidationError('date');
  });

  test('debería agregar múltiples tipos de entradas', async () => {
    await createEventPage.fillBasicInfo(
      generateTestEventName(),
      'Evento con múltiples tickets'
    );
    
    await createEventPage.addTicket('General', 1000, 200);
    await createEventPage.addTicket('VIP', 2500, 50, 'Acceso preferencial');
    await createEventPage.addTicket('Early Bird', 800, 100, 'Precio promocional');
    
    // Verificar que se agregaron los tickets
    await expect(createEventPage.page.locator('.ticket-item, [data-testid="ticket-row"]')).toHaveCount(3);
  });

  test('no debería permitir fecha pasada', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    await createEventPage.dateInput.fill(dateStr);
    await createEventPage.dateInput.blur();
    
    // Verificar que hay error de validación
    const hasError = await createEventPage.dateInput.evaluate(el => 
      el.classList.contains('ng-invalid') || el.getAttribute('aria-invalid') === 'true'
    );
    expect(hasError).toBeTruthy();
  });

  test('debería permitir evento gratuito', async ({ page }) => {
    await createEventPage.fillBasicInfo(
      generateTestEventName(),
      'Evento gratuito de testing'
    );
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await createEventPage.fillDateTime(tomorrow.toISOString().split('T')[0], '14:00', '18:00');
    await createEventPage.fillLocation('Parque Centenario', 'Av. Ángel Gallardo');
    
    await createEventPage.addTicket('Entrada Gratuita', 0, 500, 'Evento sin costo');
    
    await createEventPage.publish();
    
    await page.waitForURL(/.*events.*|.*dashboard.*/, { timeout: 15000 });
  });
});

test.describe('📅 Eventos - Edición y Gestión', () => {
  test('debería editar un evento existente', async ({ page }) => {
    // Login como organizador
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    
    // Ir a perfil -> mis eventos
    await page.goto(`${CONFIG.baseURL}/profile`);
    const { ProfilePage } = await import('../pages/profile.page');
    const profilePage = new ProfilePage(page);
    
    if (await profilePage.isOrganizerView()) {
      await profilePage.navigateToMyEvents();
      
      // Verificar que hay eventos
      const eventCount = await profilePage.createdEventList.count();
      
      if (eventCount > 0) {
        await profilePage.editEventButton.first().click();
        
        // Editar título
        const createPage = new CreateEventPage(page);
        const newTitle = generateTestEventName();
        await createPage.titleInput.fill(newTitle);
        await createPage.publishButton.click();
        
        // Verificar mensaje de éxito
        await expect(page.locator('.success, .toast-success').first()).toBeVisible();
      }
    }
  });

  test('debería mostrar estadísticas del evento', async ({ page }) => {
    // Login como organizador
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.organizer.email, CONFIG.users.organizer.password);
    
    await page.goto(`${CONFIG.baseURL}/profile`);
    const { ProfilePage } = await import('../pages/profile.page');
    const profilePage = new ProfilePage(page);
    
    if (await profilePage.isOrganizerView()) {
      await profilePage.navigateToMyEvents();
      
      if (await profilePage.eventStatsButton.first().isVisible().catch(() => false)) {
        await profilePage.eventStatsButton.first().click();
        
        // Verificar que se muestran estadísticas
        await expect(page.locator('.stats, [data-testid="event-stats"], canvas').first()).toBeVisible();
      }
    }
  });
});

test.describe('📅 Eventos - Compartir y Social', () => {
  test('debería compartir un evento', async ({ page, context }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    
    // Esperar a que el botón de compartir esté disponible
    if (await eventDetail.shareButton.isVisible().catch(() => false)) {
      await eventDetail.clickShare();
      
      // Verificar que aparece modal de compartir
      const shareModal = page.locator('.share-modal, [data-testid="share-modal"], .social-share').first();
      await expect(shareModal).toBeVisible();
    }
  });

  test('debería agregar/quitar evento de favoritos', async ({ page }) => {
    // Login primero
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.clickEventCard(0);
    
    const eventDetail = new EventDetailPage(page);
    
    if (await eventDetail.favoriteButton.isVisible().catch(() => false)) {
      await eventDetail.clickFavorite();
      
      // Verificar feedback visual
      await expect(page.locator('.toast, .success, [data-testid="favorite-added"]').first()).toBeVisible();
    }
  });
});
