import { Page, Locator } from '@playwright/test';
import { CONFIG } from '../utils/config';

/**
 * Clase base para todos los Page Objects
 */

export abstract class BasePage {
  readonly page: Page;
  readonly url: string;
  
  // Elementos comunes
  readonly toast: Locator;
  readonly loadingSpinner: Locator;
  readonly navigation: Locator;
  readonly logo: Locator;

  constructor(page: Page, path: string = '') {
    this.page = page;
    this.url = `${CONFIG.baseURL}${path}`;
    
    // Selectores globales
    this.toast = page.locator(CONFIG.selectors.toast);
    this.loadingSpinner = page.locator(CONFIG.selectors.loading);
    this.navigation = page.locator('nav, header');
    this.logo = page.locator('[data-testid="logo"], a[href="/"]').first();
  }

  async goto() {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForLoading() {
    await this.loadingSpinner.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  }

  async getToastMessage(): Promise<string> {
    return await this.toast.textContent() || '';
  }

  async isToastVisible(): Promise<boolean> {
    return await this.toast.isVisible().catch(() => false);
  }

  async dismissToast() {
    if (await this.isToastVisible()) {
      await this.toast.click();
      await this.toast.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    }
  }

  async clickLogo() {
    await this.logo.click();
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `./test-results/screenshots/${name}.png` });
  }
}
