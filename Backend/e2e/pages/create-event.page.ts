import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object para la página de Crear Evento
 */

export class CreateEventPage extends BasePage {
  // Información básica
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly categorySelect: Locator;
  readonly imageUpload: Locator;
  
  // Fecha y hora
  readonly dateInput: Locator;
  readonly startTimeInput: Locator;
  readonly endTimeInput: Locator;
  
  // Ubicación
  readonly locationInput: Locator;
  readonly addressInput: Locator;
  readonly cityInput: Locator;
  readonly mapPin: Locator;
  
  // Tickets
  readonly addTicketButton: Locator;
  readonly ticketNameInput: Locator;
  readonly ticketPriceInput: Locator;
  readonly ticketQuantityInput: Locator;
  readonly ticketDescriptionInput: Locator;
  
  // Configuración adicional
  readonly isPublicToggle: Locator;
  readonly maxTicketsPerUserInput: Locator;
  readonly refundPolicySelect: Locator;
  
  // Botones
  readonly saveDraftButton: Locator;
  readonly publishButton: Locator;
  readonly cancelButton: Locator;
  readonly nextStepButton: Locator;
  readonly prevStepButton: Locator;

  constructor(page: Page) {
    super(page, '/events/create');
    
    // Información básica
    this.titleInput = page.locator('input[name="title"], input[formcontrolname="title"], [data-testid="event-title"]').first();
    this.descriptionInput = page.locator('textarea[name="description"], textarea[formcontrolname="description"]').first();
    this.categorySelect = page.locator('select[name="category"], [data-testid="category-select"]').first();
    this.imageUpload = page.locator('input[type="file"], [data-testid="image-upload"]').first();
    
    // Fecha y hora
    this.dateInput = page.locator('input[type="date"], input[name="date"]').first();
    this.startTimeInput = page.locator('input[name="startTime"], input[formcontrolname="startTime"]').first();
    this.endTimeInput = page.locator('input[name="endTime"], input[formcontrolname="endTime"]').first();
    
    // Ubicación
    this.locationInput = page.locator('input[name="location"], [data-testid="location-input"]').first();
    this.addressInput = page.locator('input[name="address"], textarea[name="address"]').first();
    this.cityInput = page.locator('input[name="city"]').first();
    this.mapPin = page.locator('[data-testid="map-pin"], .leaflet-marker-icon').first();
    
    // Tickets
    this.addTicketButton = page.locator('button:has-text("Agregar entrada"), button:has-text("Añadir ticket"), [data-testid="add-ticket"]').first();
    this.ticketNameInput = page.locator('input[name="ticketName"], input[formcontrolname="ticketName"]').first();
    this.ticketPriceInput = page.locator('input[name="ticketPrice"], input[formcontrolname="ticketPrice"]').first();
    this.ticketQuantityInput = page.locator('input[name="ticketQuantity"], input[formcontrolname="ticketQuantity"]').first();
    this.ticketDescriptionInput = page.locator('input[name="ticketDescription"], textarea[name="ticketDescription"]').first();
    
    // Configuración
    this.isPublicToggle = page.locator('input[type="checkbox"][name*="public"], [data-testid="public-toggle"]').first();
    this.maxTicketsPerUserInput = page.locator('input[name="maxTicketsPerUser"]').first();
    this.refundPolicySelect = page.locator('select[name="refundPolicy"]').first();
    
    // Botones
    this.saveDraftButton = page.locator('button:has-text("Guardar borrador"), [data-testid="save-draft"]').first();
    this.publishButton = page.locator('button:has-text("Publicar"), button[type="submit"]').first();
    this.cancelButton = page.locator('button:has-text("Cancelar"), [data-testid="cancel"]').first();
    this.nextStepButton = page.locator('button:has-text("Siguiente"), [data-testid="next-step"]').first();
    this.prevStepButton = page.locator('button:has-text("Anterior"), [data-testid="prev-step"]').first();
  }

  async fillBasicInfo(title: string, description: string, category?: string) {
    await this.titleInput.fill(title);
    await this.descriptionInput.fill(description);
    if (category) {
      await this.categorySelect.selectOption(category);
    }
  }

  async fillDateTime(date: string, startTime: string, endTime: string) {
    await this.dateInput.fill(date);
    await this.startTimeInput.fill(startTime);
    await this.endTimeInput.fill(endTime);
  }

  async fillLocation(location: string, address: string, city?: string) {
    await this.locationInput.fill(location);
    await this.addressInput.fill(address);
    if (city) await this.cityInput.fill(city);
  }

  async addTicket(name: string, price: number, quantity: number, description?: string) {
    await this.addTicketButton.click();
    await this.ticketNameInput.fill(name);
    await this.ticketPriceInput.fill(price.toString());
    await this.ticketQuantityInput.fill(quantity.toString());
    if (description) await this.ticketDescriptionInput.fill(description);
  }

  async publish() {
    await this.publishButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async saveDraft() {
    await this.saveDraftButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async nextStep() {
    await this.nextStepButton.click();
  }

  async prevStep() {
    await this.prevStepButton.click();
  }

  async expectValidationError(field: string) {
    const fieldLocator = this.page.locator(`[formcontrolname="${field}"], input[name="${field}"], textarea[name="${field}"]`).first();
    const hasError = await fieldLocator.evaluate((el) => 
      el.classList.contains('ng-invalid') || 
      el.classList.contains('is-invalid') ||
      el.closest('.form-group')?.classList.contains('has-error')
    );
    expect(hasError).toBeTruthy();
  }

  async uploadImage(filePath: string) {
    await this.imageUpload.setInputFiles(filePath);
  }
}
