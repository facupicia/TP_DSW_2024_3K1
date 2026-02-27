import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object para la página de Perfil
 */

export class ProfilePage extends BasePage {
  // Información personal
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly avatarUpload: Locator;
  readonly bioInput: Locator;
  
  // Tabs
  readonly personalInfoTab: Locator;
  readonly myTicketsTab: Locator;
  readonly myEventsTab: Locator;
  readonly settingsTab: Locator;
  
  // Tickets
  readonly ticketList: Locator;
  readonly downloadTicketButton: Locator;
  readonly viewQRButton: Locator;
  
  // Eventos creados (para organizadores)
  readonly createdEventList: Locator;
  readonly eventStatsButton: Locator;
  readonly editEventButton: Locator;
  
  // Configuración
  readonly changePasswordButton: Locator;
  readonly notificationsToggle: Locator;
  readonly deleteAccountButton: Locator;
  
  // Botones
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    super(page, '/profile');
    
    // Información personal
    this.firstNameInput = page.locator('input[name="firstName"], input[formcontrolname="firstName"]').first();
    this.lastNameInput = page.locator('input[name="lastName"], input[formcontrolname="lastName"]').first();
    this.emailInput = page.locator('input[type="email"][name="email"]').first();
    this.phoneInput = page.locator('input[name="phone"], input[formcontrolname="phone"]').first();
    this.avatarUpload = page.locator('input[type="file"][accept*="image"], [data-testid="avatar-upload"]').first();
    this.bioInput = page.locator('textarea[name="bio"], textarea[formcontrolname="bio"]').first();
    
    // Tabs
    this.personalInfoTab = page.locator('a:has-text("Información"), button:has-text("Perfil"), [data-testid="tab-personal"]').first();
    this.myTicketsTab = page.locator('a:has-text("Mis entradas"), button:has-text("Tickets"), [data-testid="tab-tickets"]').first();
    this.myEventsTab = page.locator('a:has-text("Mis eventos"), button:has-text("Eventos"), [data-testid="tab-events"]').first();
    this.settingsTab = page.locator('a:has-text("Configuración"), button:has-text("Ajustes"), [data-testid="tab-settings"]').first();
    
    // Tickets
    this.ticketList = page.locator('[data-testid="ticket-item"], .ticket-card');
    this.downloadTicketButton = page.locator('button:has-text("Descargar"), button:has([class*="download"])').first();
    this.viewQRButton = page.locator('button:has-text("Ver QR"), button:has([class*="qr"]), [data-testid="view-qr"]').first();
    
    // Eventos
    this.createdEventList = page.locator('[data-testid="my-event-item"], .my-event-card');
    this.eventStatsButton = page.locator('button:has-text("Estadísticas"), [data-testid="event-stats"]').first();
    this.editEventButton = page.locator('button:has-text("Editar"), a:has-text("Editar"), [data-testid="edit-event"]').first();
    
    // Configuración
    this.changePasswordButton = page.locator('button:has-text("Cambiar contraseña"), [data-testid="change-password"]').first();
    this.notificationsToggle = page.locator('input[type="checkbox"][name*="notifications"], [data-testid="notifications-toggle"]').first();
    this.deleteAccountButton = page.locator('button:has-text("Eliminar cuenta"), [data-testid="delete-account"]').first();
    
    // Botones
    this.saveButton = page.locator('button[type="submit"], button:has-text("Guardar"), [data-testid="save-profile"]').first();
    this.editButton = page.locator('button:has-text("Editar"), [data-testid="edit-profile"]').first();
    this.logoutButton = page.locator('button:has-text("Cerrar sesión"), a:has-text("Logout"), [data-testid="logout"]').first();
  }

  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    bio?: string;
  }) {
    if (data.firstName) await this.firstNameInput.fill(data.firstName);
    if (data.lastName) await this.lastNameInput.fill(data.lastName);
    if (data.phone) await this.phoneInput.fill(data.phone);
    if (data.bio) await this.bioInput.fill(data.bio);
    
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToTickets() {
    await this.myTicketsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToMyEvents() {
    await this.myEventsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToSettings() {
    await this.settingsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  async getTicketCount(): Promise<number> {
    return await this.ticketList.count();
  }

  async downloadFirstTicket() {
    await this.downloadTicketButton.first().click();
  }

  async viewQRCode() {
    await this.viewQRButton.first().click();
  }

  async logout() {
    await this.logoutButton.click();
    await this.page.waitForURL(/.*(login|home)?$/, { timeout: 10000 });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    await this.changePasswordButton.click();
    
    const currentPassInput = this.page.locator('input[name="currentPassword"]').first();
    const newPassInput = this.page.locator('input[name="newPassword"]').first();
    const confirmPassInput = this.page.locator('input[name="confirmPassword"]').first();
    const submitButton = this.page.locator('button[type="submit"]').first();
    
    await currentPassInput.fill(currentPassword);
    await newPassInput.fill(newPassword);
    await confirmPassInput.fill(newPassword);
    await submitButton.click();
  }

  async isOrganizerView(): Promise<boolean> {
    return await this.myEventsTab.isVisible().catch(() => false);
  }
}
