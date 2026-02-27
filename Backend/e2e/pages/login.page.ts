import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { waitForLoading, expectToast } from '../utils/test-helpers';

/**
 * Page Object para la página de Login
 */

export class LoginPage extends BasePage {
  // Selectores
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly registerLink: Locator;
  readonly forgotPasswordLink: Locator;
  readonly googleButton: Locator;
  readonly showPasswordButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page, '/login');
    
    this.emailInput = page.locator('input[type="email"], input[name="email"], input[formcontrolname="email"]').first();
    this.passwordInput = page.locator('input[type="password"], input[name="password"], input[formcontrolname="password"]').first();
    this.submitButton = page.locator('button[type="submit"], button:has-text("Iniciar"), button:has-text("Login")').first();
    this.registerLink = page.locator('a[href*="register"], a:has-text("Registrarse"), a:has-text("Crear cuenta")').first();
    this.forgotPasswordLink = page.locator('a[href*="forgot"], a:has-text("Olvidé"), a:has-text("recuperar")').first();
    this.googleButton = page.locator('button:has-text("Google"), [class*="google" i]').first();
    this.showPasswordButton = page.locator('button[aria-label*="password" i], button:has([class*="eye"]), button:has([class*="visibility"])').first();
    this.errorMessage = page.locator('[data-testid="error-message"], .error, .alert-danger').first();
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await waitForLoading(this.page);
  }

  async loginExpectingSuccess(email: string, password: string) {
    await this.login(email, password);
    // Después de login exitoso, deberíamos estar en el home o dashboard
    await this.page.waitForURL(/\/(home|dashboard|events)?$/, { timeout: 10000 });
  }

  async loginExpectingError(email: string, password: string, expectedError?: string) {
    await this.login(email, password);
    
    if (expectedError) {
      await expectToast(this.page, expectedError);
    } else {
      // Verificar que hay un mensaje de error visible
      const hasError = await this.errorMessage.isVisible().catch(() => false);
      const hasToastError = await this.isToastVisible();
      expect(hasError || hasToastError).toBeTruthy();
    }
  }

  async navigateToRegister() {
    await this.registerLink.click();
    await this.page.waitForURL(/.*register.*/, { timeout: 10000 });
  }

  async navigateToForgotPassword() {
    await this.forgotPasswordLink.click();
    await this.page.waitForURL(/.*forgot.*/, { timeout: 10000 });
  }

  async togglePasswordVisibility() {
    await this.showPasswordButton.click();
  }

  async isPasswordVisible(): Promise<boolean> {
    const type = await this.passwordInput.getAttribute('type');
    return type === 'text';
  }

  async clearForm() {
    await this.emailInput.clear();
    await this.passwordInput.clear();
  }

  async expectValidationError(field: 'email' | 'password') {
    const input = field === 'email' ? this.emailInput : this.passwordInput;
    const isInvalid = await input.evaluate((el) => el.classList.contains('ng-invalid') || el.hasAttribute('aria-invalid'));
    expect(isInvalid).toBeTruthy();
  }
}
