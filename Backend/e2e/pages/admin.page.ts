import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object para el Panel de Admin
 */

export class AdminPage extends BasePage {
  // Stats
  readonly totalUsersStat: Locator;
  readonly totalEventsStat: Locator;
  readonly totalTicketsStat: Locator;
  readonly totalRevenueStat: Locator;
  
  // Tabs
  readonly dashboardTab: Locator;
  readonly usersTab: Locator;
  readonly eventsTab: Locator;
  readonly categoriesTab: Locator;
  readonly reportsTab: Locator;
  
  // Tablas
  readonly usersTable: Locator;
  readonly eventsTable: Locator;
  readonly dataRows: Locator;
  
  // Acciones
  readonly searchInput: Locator;
  readonly filterSelect: Locator;
  readonly exportButton: Locator;
  readonly refreshButton: Locator;
  
  // User actions
  readonly editUserButton: Locator;
  readonly deleteUserButton: Locator;
  readonly changeRoleButton: Locator;
  
  // Event actions
  readonly approveEventButton: Locator;
  readonly rejectEventButton: Locator;
  readonly featureEventButton: Locator;
  
  // Gráficos
  readonly revenueChart: Locator;
  readonly usersChart: Locator;
  readonly eventsChart: Locator;

  constructor(page: Page) {
    super(page, '/admin');
    
    // Stats
    this.totalUsersStat = page.locator('[data-testid="stat-users"], .stat-users').first();
    this.totalEventsStat = page.locator('[data-testid="stat-events"], .stat-events').first();
    this.totalTicketsStat = page.locator('[data-testid="stat-tickets"], .stat-tickets').first();
    this.totalRevenueStat = page.locator('[data-testid="stat-revenue"], .stat-revenue').first();
    
    // Tabs
    this.dashboardTab = page.locator('a:has-text("Dashboard"), button:has-text("Dashboard"), [data-testid="tab-dashboard"]').first();
    this.usersTab = page.locator('a:has-text("Usuarios"), button:has-text("Users"), [data-testid="tab-users"]').first();
    this.eventsTab = page.locator('a:has-text("Eventos"), button:has-text("Events"), [data-testid="tab-events"]').first();
    this.categoriesTab = page.locator('a:has-text("Categorías"), button:has-text("Categories"), [data-testid="tab-categories"]').first();
    this.reportsTab = page.locator('a:has-text("Reportes"), button:has-text("Reports"), [data-testid="tab-reports"]').first();
    
    // Tablas
    this.usersTable = page.locator('[data-testid="users-table"], table:has(th:has-text("Email"))').first();
    this.eventsTable = page.locator('[data-testid="events-table"], table:has(th:has-text("Evento"))').first();
    this.dataRows = page.locator('table tbody tr');
    
    // Acciones
    this.searchInput = page.locator('input[type="search"], input[placeholder*="buscar" i], [data-testid="admin-search"]').first();
    this.filterSelect = page.locator('select[name="filter"], [data-testid="filter-select"]').first();
    this.exportButton = page.locator('button:has-text("Exportar"), button:has-text("Export"), [data-testid="export"]').first();
    this.refreshButton = page.locator('button:has-text("Actualizar"), button:has([class*="refresh"]), [data-testid="refresh"]').first();
    
    // User actions
    this.editUserButton = page.locator('button:has-text("Editar"), [data-testid="edit-user"]').first();
    this.deleteUserButton = page.locator('button:has-text("Eliminar"), button:has([class*="delete"]), [data-testid="delete-user"]').first();
    this.changeRoleButton = page.locator('button:has-text("Rol"), [data-testid="change-role"]').first();
    
    // Event actions
    this.approveEventButton = page.locator('button:has-text("Aprobar"), [data-testid="approve-event"]').first();
    this.rejectEventButton = page.locator('button:has-text("Rechazar"), [data-testid="reject-event"]').first();
    this.featureEventButton = page.locator('button:has-text("Destacar"), [data-testid="feature-event"]').first();
    
    // Gráficos
    this.revenueChart = page.locator('[data-testid="revenue-chart"], canvas').first();
    this.usersChart = page.locator('[data-testid="users-chart"]').first();
    this.eventsChart = page.locator('[data-testid="events-chart"]').first();
  }

  async navigateToUsers() {
    await this.usersTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToEvents() {
    await this.eventsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToCategories() {
    await this.categoriesTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount(): Promise<number> {
    return await this.dataRows.count();
  }

  async editFirstUser() {
    await this.editUserButton.click();
  }

  async deleteFirstUser() {
    await this.deleteUserButton.click();
    // Confirmar en modal
    const confirmButton = this.page.locator('button:has-text("Sí"), button:has-text("Confirmar"), [data-testid="confirm-delete"]').first();
    await confirmButton.click();
  }

  async changeUserRole(newRole: string) {
    await this.changeRoleButton.click();
    const roleOption = this.page.locator(`button:has-text("${newRole}"), [data-testid="role-${newRole}"]`).first();
    await roleOption.click();
  }

  async approveFirstEvent() {
    await this.approveEventButton.click();
  }

  async getTotalUsers(): Promise<number> {
    const text = await this.totalUsersStat.textContent() || '0';
    return parseInt(text.replace(/\D/g, ''), 10) || 0;
  }

  async expectAdminPageLoaded() {
    await expect(this.dashboardTab).toBeVisible();
    await expect(this.usersTab).toBeVisible();
  }
}
