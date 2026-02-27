import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object para la página Home
 */

export class HomePage extends BasePage {
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly eventCards: Locator;
  readonly categoryFilters: Locator;
  readonly featuredSection: Locator;
  readonly upcomingSection: Locator;
  readonly userMenuButton: Locator;
  readonly loginButton: Locator;
  readonly createEventButton: Locator;

  constructor(page: Page) {
    super(page, '/');
    
    this.searchInput = page.locator('input[placeholder*="buscar" i], input[name="search"], [data-testid="search-input"]').first();
    this.searchButton = page.locator('button:has-text("Buscar"), [data-testid="search-button"]').first();
    this.eventCards = page.locator('[data-testid="event-card"], .event-card, app-event-card');
    this.categoryFilters = page.locator('[data-testid="category-filter"], .category-chip');
    this.featuredSection = page.locator('[data-testid="featured-events"], section:has-text("Destacados")').first();
    this.upcomingSection = page.locator('[data-testid="upcoming-events"], section:has-text("Próximos")').first();
    this.userMenuButton = page.locator('[data-testid="user-menu"], button:has-text("Mi cuenta"), button:has([alt*="avatar"])').first();
    this.loginButton = page.locator('a[href="/login"], button:has-text("Iniciar sesión")').first();
    this.createEventButton = page.locator('a[href="/events/create"], button:has-text("Crear evento")').first();
  }

  async searchEvents(query: string) {
    await this.searchInput.fill(query);
    await this.searchButton.click();
    await this.waitForLoading();
  }

  async getEventCount(): Promise<number> {
    return await this.eventCards.count();
  }

  async clickEventCard(index: number = 0) {
    const cards = this.eventCards;
    await cards.nth(index).click();
  }

  async clickEventByName(eventName: string) {
    const event = this.page.locator('.event-card, [data-testid="event-card"]').filter({ hasText: eventName }).first();
    await event.click();
  }

  async filterByCategory(categoryName: string) {
    const category = this.categoryFilters.filter({ hasText: categoryName }).first();
    await category.click();
    await this.waitForLoading();
  }

  async navigateToLogin() {
    await this.loginButton.click();
    await this.page.waitForURL(/.*login.*/, { timeout: 10000 });
  }

  async navigateToCreateEvent() {
    await this.createEventButton.click();
    await this.page.waitForURL(/.*create.*/, { timeout: 10000 });
  }

  async openUserMenu() {
    await this.userMenuButton.click();
  }

  async isLoggedIn(): Promise<boolean> {
    return await this.userMenuButton.isVisible().catch(() => false);
  }

  async expectEventCardVisible(eventName?: string) {
    if (eventName) {
      const card = this.eventCards.filter({ hasText: eventName }).first();
      await expect(card).toBeVisible();
    } else {
      await expect(this.eventCards.first()).toBeVisible();
    }
  }

  async scrollToEvents() {
    await this.eventCards.first().scrollIntoViewIfNeeded();
  }
}
