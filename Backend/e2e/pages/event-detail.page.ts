import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object para la página de Detalle de Evento
 */

export class EventDetailPage extends BasePage {
  readonly eventTitle: Locator;
  readonly eventDescription: Locator;
  readonly eventDate: Locator;
  readonly eventLocation: Locator;
  readonly ticketTypes: Locator;
  readonly buyButton: Locator;
  readonly shareButton: Locator;
  readonly favoriteButton: Locator;
  readonly organizerInfo: Locator;
  readonly map: Locator;
  readonly backButton: Locator;
  readonly ticketQuantityInput: Locator;

  constructor(page: Page) {
    super(page, '');
    
    this.eventTitle = page.locator('[data-testid="event-title"], h1').first();
    this.eventDescription = page.locator('[data-testid="event-description"], .description').first();
    this.eventDate = page.locator('[data-testid="event-date"], .event-date').first();
    this.eventLocation = page.locator('[data-testid="event-location"], .location').first();
    this.ticketTypes = page.locator('[data-testid="ticket-type"], .ticket-option');
    this.buyButton = page.locator('[data-testid="buy-button"], button:has-text("Comprar"), button:has-text("Adquirir")').first();
    this.shareButton = page.locator('button:has-text("Compartir"), [data-testid="share-button"]').first();
    this.favoriteButton = page.locator('[data-testid="favorite-button"], button:has([class*="heart"]), button:has([class*="favorite"])').first();
    this.organizerInfo = page.locator('[data-testid="organizer-info"], .organizer').first();
    this.map = page.locator('[data-testid="event-map"], .map-container').first();
    this.backButton = page.locator('button:has-text("Volver"), [data-testid="back-button"], a[href="/"]').first();
    this.ticketQuantityInput = page.locator('input[type="number"], [data-testid="quantity-input"]').first();
  }

  async gotoEvent(eventId: string) {
    await this.page.goto(`${CONFIG.baseURL}/events/${eventId}`);
    await this.waitForPageLoad();
  }

  async getEventTitle(): Promise<string> {
    return await this.eventTitle.textContent() || '';
  }

  async selectTicketType(ticketName: string) {
    const ticket = this.ticketTypes.filter({ hasText: ticketName }).first();
    await ticket.click();
  }

  async setTicketQuantity(quantity: number) {
    await this.ticketQuantityInput.fill(quantity.toString());
  }

  async clickBuy() {
    await this.buyButton.click();
    // Debería ir al checkout o mostrar modal
    await this.page.waitForLoadState('networkidle');
  }

  async clickShare() {
    await this.shareButton.click();
  }

  async clickFavorite() {
    await this.favoriteButton.click();
  }

  async clickBack() {
    await this.backButton.click();
  }

  async getTicketTypesCount(): Promise<number> {
    return await this.ticketTypes.count();
  }

  async isSoldOut(): Promise<boolean> {
    const buttonText = await this.buyButton.textContent() || '';
    return buttonText.toLowerCase().includes('agotado') || buttonText.toLowerCase().includes('sold out');
  }

  async expectEventLoaded() {
    await expect(this.eventTitle).toBeVisible();
    await expect(this.eventDate).toBeVisible();
  }
}

import { CONFIG } from '../utils/config';
