import { test as base, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { CONFIG } from '../utils/config';

/**
 * Fixture extendido con autenticación
 */

type UserRole = 'admin' | 'organizer' | 'user';

interface AuthFixture {
  loggedInPage: Page;
  loginPage: LoginPage;
  authAs: (role: UserRole) => Promise<Page>;
}

export const test = base.extend<AuthFixture>({
  // Page object de login
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  
  // Página ya autenticada como usuario regular
  loggedInPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    await use(page);
    await context.close();
  },
  
  // Helper para autenticar como cualquier rol
  authAs: async ({ browser }, use) => {
    const authAs = async (role: UserRole) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      
      const credentials = CONFIG.users[role];
      await loginPage.login(credentials.email, credentials.password);
      
      return page;
    };
    
    await use(authAs);
  },
});

export { expect };
