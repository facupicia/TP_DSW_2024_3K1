import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { waitForLoading } from '../utils/test-helpers';

/**
 * Page Object para la página de Registro
 */

export class RegisterPage extends BasePage {
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;
  readonly termsCheckbox: Locator;
  readonly organizerToggle: Locator;

  constructor(page: Page) {
    super(page, '/register');
    
    this.firstNameInput = page.locator('input[name="firstName"], input[formcontrolname="firstName"], input[placeholder*="nombre" i]').first();
    this.lastNameInput = page.locator('input[name="lastName"], input[formcontrolname="lastName"], input[placeholder*="apellido" i]').first();
    this.emailInput = page.locator('input[type="email"], input[name="email"], input[formcontrolname="email"]').first();
    this.passwordInput = page.locator('input[name="password"], input[formcontrolname="password"]').first();
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input[formcontrolname="confirmPassword"], input[name="passwordConfirm"]').first();
    this.submitButton = page.locator('button[type="submit"], button:has-text("Registrarse"), button:has-text("Crear")').first();
    this.loginLink = page.locator('a[href*="login"], a:has-text("Iniciar sesión")').first();
    this.termsCheckbox = page.locator('input[type="checkbox"][name*="terms"], input[type="checkbox"][formcontrolname*="terms"]').first();
    this.organizerToggle = page.locator('[data-testid="organizer-toggle"], input[type="checkbox"][name*="organizer"]').first();
  }

  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword?: string;
    acceptTerms?: boolean;
    asOrganizer?: boolean;
  }) {
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);
    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    await this.confirmPasswordInput.fill(data.confirmPassword || data.password);
    
    if (data.acceptTerms && await this.termsCheckbox.isVisible().catch(() => false)) {
      await this.termsCheckbox.check();
    }
    
    if (data.asOrganizer && await this.organizerToggle.isVisible().catch(() => false)) {
      await this.organizerToggle.check();
    }
    
    await this.submitButton.click();
    await waitForLoading(this.page);
  }

  async registerExpectingSuccess(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    await this.register({ ...data, acceptTerms: true });
    // Después de registro exitoso, deberíamos ir al login o home
    await this.page.waitForURL(/\/(login|home|dashboard)?$/, { timeout: 10000 });
  }

  async navigateToLogin() {
    await this.loginLink.click();
    await this.page.waitForURL(/.*login.*/, { timeout: 10000 });
  }

  async expectValidationError(field: 'email' | 'password' | 'firstName' | 'lastName') {
    const inputMap = {
      email: this.emailInput,
      password: this.passwordInput,
      firstName: this.firstNameInput,
      lastName: this.lastNameInput,
    };
    
    const input = inputMap[field];
    const isInvalid = await input.evaluate((el) => 
      el.classList.contains('ng-invalid') || 
      el.classList.contains('is-invalid') ||
      el.hasAttribute('aria-invalid')
    );
    expect(isInvalid).toBeTruthy();
  }

  async isPasswordMatchValid(): Promise<boolean> {
    const password = await this.passwordInput.inputValue();
    const confirmPassword = await this.confirmPasswordInput.inputValue();
    return password === confirmPassword && password.length >= 6;
  }
}
