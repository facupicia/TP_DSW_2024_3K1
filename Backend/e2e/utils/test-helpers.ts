import { Page, expect } from '@playwright/test';
import { CONFIG } from './config';

/**
 * Helper functions para tests E2E
 */

export async function waitForLoading(page: Page) {
  // Esperar a que termine cualquier loading
  await page.waitForSelector(CONFIG.selectors.loading, { state: 'detached', timeout: 10000 }).catch(() => {});
}

export async function dismissToast(page: Page) {
  const toast = page.locator(CONFIG.selectors.toast).first();
  if (await toast.isVisible().catch(() => false)) {
    await toast.click();
    await toast.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  }
}

export async function fillFormField(page: Page, fieldName: string, value: string) {
  const field = page.locator(`[data-testid="${fieldName}-input"], input[name="${fieldName}"], input[formcontrolname="${fieldName}"]`).first();
  await field.fill(value);
}

export async function clickButton(page: Page, buttonText: string | RegExp) {
  const button = page.getByRole('button', { name: buttonText }).first();
  await button.click();
}

export async function expectToast(page: Page, message: string | RegExp) {
  const toast = page.locator(CONFIG.selectors.toast);
  await expect(toast).toContainText(message);
}

export async function waitForNavigation(page: Page, urlPattern: RegExp | string) {
  await page.waitForURL(urlPattern, { timeout: CONFIG.timeout.navigation });
}

export async function scrollToElement(page: Page, selector: string) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
}

export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ 
    path: `./test-results/screenshots/${name}-${Date.now()}.png`,
    fullPage: true 
  });
}

export function generateTestEmail(prefix: string = 'test'): string {
  return `${prefix}.${Date.now()}@test.com`;
}

export function generateTestEventName(): string {
  return `Evento Test ${Date.now()}`;
}

/**
 * Esperar a que un elemento esté listo para interacción
 */
export async function waitForElementReady(page: Page, selector: string) {
  const element = page.locator(selector).first();
  await element.waitFor({ state: 'visible', timeout: 10000 });
  await element.waitFor({ state: 'attached', timeout: 10000 });
  return element;
}
