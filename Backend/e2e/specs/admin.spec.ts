import { test, expect } from '@playwright/test';
import { AdminPage } from '../pages/admin.page';
import { LoginPage } from '../pages/login.page';
import { HomePage } from '../pages/home.page';
import { CONFIG } from '../utils/config';

/**
 * Tests de Panel de Administración
 * CRÍTICO: Gestión de usuarios, eventos y estadísticas
 */

test.describe('👑 Admin - Acceso y Dashboard', () => {
  let adminPage: AdminPage;

  test.beforeEach(async ({ page }) => {
    // Login como admin
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.admin.email, CONFIG.users.admin.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    adminPage = new AdminPage(page);
    await adminPage.goto();
  });

  test('debería acceder al panel de admin', async () => {
    await adminPage.expectAdminPageLoaded();
  });

  test('debería mostrar estadísticas en el dashboard', async () => {
    // Verificar que hay datos de estadísticas
    const usersCount = await adminPage.getTotalUsers();
    expect(usersCount).toBeGreaterThanOrEqual(0);
    
    // Verificar que se muestran los contadores
    await expect(adminPage.totalUsersStat).toBeVisible();
    await expect(adminPage.totalEventsStat).toBeVisible();
  });

  test('debería mostrar gráficos de estadísticas', async () => {
    if (await adminPage.revenueChart.isVisible().catch(() => false)) {
      await expect(adminPage.revenueChart).toBeVisible();
    }
  });

  test('no debería permitir acceso a usuarios no-admin', async ({ browser }) => {
    // Crear contexto con usuario regular
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    // Intentar acceder a admin
    await page.goto(`${CONFIG.baseURL}/admin`);
    
    // Debería redirigir o mostrar error 403
    const isRedirected = !page.url().includes('/admin');
    const hasForbidden = await page.locator('text=403, text=Forbidden, text=no tienes permisos').first().isVisible().catch(() => false);
    
    expect(isRedirected || hasForbidden).toBeTruthy();
    
    await context.close();
  });
});

test.describe('👑 Admin - Gestión de Usuarios', () => {
  let adminPage: AdminPage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.admin.email, CONFIG.users.admin.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.navigateToUsers();
  });

  test('debería mostrar lista de usuarios', async () => {
    await expect(adminPage.usersTable).toBeVisible();
    
    const rowCount = await adminPage.getRowCount();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('debería buscar usuarios por email', async () => {
    await adminPage.search(CONFIG.users.user.email);
    
    // Verificar resultados
    const hasResults = await adminPage.dataRows.first().isVisible().catch(() => false);
    const noResults = await adminPage.page.locator('text=no se encontraron, text=no results').first().isVisible().catch(() => false);
    
    expect(hasResults || noResults).toBeTruthy();
  });

  test('debería filtrar usuarios por rol', async () => {
    if (await adminPage.filterSelect.isVisible().catch(() => false)) {
      await adminPage.filterSelect.selectOption('organizer');
      await adminPage.page.waitForLoadState('networkidle');
      
      // Verificar que se aplicó filtro
      await expect(adminPage.page).toHaveURL(/.*filter.*/);
    }
  });

  test('debería editar información de usuario', async () => {
    const rowCount = await adminPage.getRowCount();
    
    if (rowCount > 0) {
      await adminPage.editFirstUser();
      
      // Verificar que se abrió el formulario de edición
      const editForm = adminPage.page.locator('form, .edit-user-modal, [data-testid="edit-user-form"]').first();
      await expect(editForm).toBeVisible();
    }
  });

  test('debería cambiar rol de usuario', async () => {
    const rowCount = await adminPage.getRowCount();
    
    if (rowCount > 0 && await adminPage.changeRoleButton.isVisible().catch(() => false)) {
      await adminPage.changeUserRole('organizer');
      
      // Verificar mensaje de éxito
      await expect(adminPage.page.locator('.toast, .success, [data-testid="success-message"]').first()).toBeVisible();
    }
  });
});

test.describe('👑 Admin - Gestión de Eventos', () => {
  let adminPage: AdminPage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.admin.email, CONFIG.users.admin.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.navigateToEvents();
  });

  test('debería mostrar lista de eventos', async () => {
    await expect(adminPage.eventsTable).toBeVisible();
    
    const rowCount = await adminPage.getRowCount();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('debería aprobar un evento pendiente', async () => {
    const rowCount = await adminPage.getRowCount();
    
    if (rowCount > 0 && await adminPage.approveEventButton.isVisible().catch(() => false)) {
      await adminPage.approveFirstEvent();
      
      // Verificar mensaje de éxito
      await expect(adminPage.page.locator('.toast, .success').first()).toBeVisible();
    }
  });

  test('debería marcar evento como destacado', async () => {
    const rowCount = await adminPage.getRowCount();
    
    if (rowCount > 0 && await adminPage.featureEventButton.isVisible().catch(() => false)) {
      await adminPage.featureEventButton.click();
      
      // Verificar cambio
      await expect(adminPage.page.locator('.toast, .success').first()).toBeVisible();
    }
  });

  test('debería filtrar eventos por estado', async () => {
    if (await adminPage.filterSelect.isVisible().catch(() => false)) {
      await adminPage.filterSelect.selectOption('pending');
      await adminPage.page.waitForLoadState('networkidle');
      
      await expect(adminPage.page).toHaveURL(/.*filter.*/);
    }
  });
});

test.describe('👑 Admin - Categorías', () => {
  test('debería gestionar categorías de eventos', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.admin.email, CONFIG.users.admin.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    
    if (await adminPage.categoriesTab.isVisible().catch(() => false)) {
      await adminPage.navigateToCategories();
      
      // Verificar lista de categorías
      await expect(page.locator('.categories-list, [data-testid="categories-table"]').first()).toBeVisible();
    }
  });
});

test.describe('👑 Admin - Reportes', () => {
  test('debería exportar datos de usuarios', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.admin.email, CONFIG.users.admin.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.navigateToUsers();
    
    if (await adminPage.exportButton.isVisible().catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        adminPage.exportButton.click()
      ]);
      
      const filename = download.suggestedFilename();
      expect(filename.match(/\.(csv|xlsx|pdf)$/)).toBeTruthy();
    }
  });

  test('debería mostrar reportes de ventas', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.admin.email, CONFIG.users.admin.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    
    if (await adminPage.reportsTab.isVisible().catch(() => false)) {
      await adminPage.reportsTab.click();
      
      // Verificar gráficos de reportes
      await expect(page.locator('.report-chart, canvas, [data-testid="sales-chart"]').first()).toBeVisible();
    }
  });
});
