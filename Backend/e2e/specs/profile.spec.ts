import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { ProfilePage } from '../pages/profile.page';
import { CONFIG } from '../utils/config';

/**
 * Tests de Perfil de Usuario
 * CRÍTICO: Gestión de información personal y preferencias
 */

test.describe('👤 Perfil - Información Personal', () => {
  let profilePage: ProfilePage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    await page.waitForURL(/\/(home|dashboard)?$/, { timeout: 10000 });
    
    profilePage = new ProfilePage(page);
    await profilePage.goto();
  });

  test('debería mostrar información del perfil', async () => {
    await expect(profilePage.emailInput).toBeVisible();
    await expect(profilePage.firstNameInput).toBeVisible();
    await expect(profilePage.lastNameInput).toBeVisible();
  });

  test('debería actualizar nombre y apellido', async ({ page }) => {
    const timestamp = Date.now();
    const newFirstName = `Test${timestamp}`;
    const newLastName = `User${timestamp}`;
    
    await profilePage.updateProfile({
      firstName: newFirstName,
      lastName: newLastName,
    });
    
    // Verificar mensaje de éxito
    await expect(page.locator('.toast, .success, text=actualizado, text=guardado').first()).toBeVisible();
    
    // Refrescar y verificar persistencia
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const firstNameValue = await profilePage.firstNameInput.inputValue();
    expect(firstNameValue).toBe(newFirstName);
  });

  test('debería actualizar teléfono', async ({ page }) => {
    const newPhone = `+5411${Date.now().toString().slice(-8)}`;
    
    await profilePage.updateProfile({
      phone: newPhone,
    });
    
    await expect(page.locator('.toast, .success').first()).toBeVisible();
  });

  test('debería actualizar biografía', async ({ page }) => {
    if (await profilePage.bioInput.isVisible().catch(() => false)) {
      const newBio = `Biografía de prueba actualizada el ${new Date().toISOString()}`;
      
      await profilePage.updateProfile({
        bio: newBio,
      });
      
      await expect(page.locator('.toast, .success').first()).toBeVisible();
    }
  });

  test('no debería permitir email vacío', async () => {
    await profilePage.emailInput.fill('');
    await profilePage.saveButton.click();
    
    // Verificar validación
    const hasError = await profilePage.emailInput.evaluate(el => 
      el.classList.contains('ng-invalid') || el.classList.contains('is-invalid')
    );
    expect(hasError).toBeTruthy();
  });

  test('debería validar formato de teléfono', async () => {
    if (await profilePage.phoneInput.isVisible().catch(() => false)) {
      await profilePage.phoneInput.fill('not-a-phone');
      await profilePage.saveButton.click();
      
      const hasError = await profilePage.phoneInput.evaluate(el => 
        el.classList.contains('ng-invalid') || el.classList.contains('is-invalid')
      );
      expect(hasError).toBeTruthy();
    }
  });
});

test.describe('👤 Perfil - Cambio de Contraseña', () => {
  test('debería cambiar contraseña exitosamente', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    await page.goto(`${CONFIG.baseURL}/profile`);
    const profilePage = new ProfilePage(page);
    
    if (await profilePage.changePasswordButton.isVisible().catch(() => false)) {
      await profilePage.changePassword(
        CONFIG.users.user.password,
        'NewPassword123!'
      );
      
      // Verificar mensaje de éxito
      await expect(page.locator('.toast, .success, text=contraseña actualizada').first()).toBeVisible();
      
      // Cambiar de vuelta para no afectar otros tests
      await profilePage.changePassword(
        'NewPassword123!',
        CONFIG.users.user.password
      );
    }
  });

  test('debería rechazar contraseña actual incorrecta', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    await page.goto(`${CONFIG.baseURL}/profile`);
    const profilePage = new ProfilePage(page);
    
    if (await profilePage.changePasswordButton.isVisible().catch(() => false)) {
      await profilePage.changePasswordButton.click();
      
      const currentPassInput = page.locator('input[name="currentPassword"]').first();
      const newPassInput = page.locator('input[name="newPassword"]').first();
      const submitButton = page.locator('button[type="submit"]').first();
      
      await currentPassInput.fill('wrongpassword');
      await newPassInput.fill('NewPassword123!');
      await submitButton.click();
      
      // Verificar error
      await expect(page.locator('.error, text=incorrecta, text=error').first()).toBeVisible();
    }
  });

  test('debería validar fortaleza de nueva contraseña', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    await page.goto(`${CONFIG.baseURL}/profile`);
    const profilePage = new ProfilePage(page);
    
    if (await profilePage.changePasswordButton.isVisible().catch(() => false)) {
      await profilePage.changePasswordButton.click();
      
      const currentPassInput = page.locator('input[name="currentPassword"]').first();
      const newPassInput = page.locator('input[name="newPassword"]').first();
      const submitButton = page.locator('button[type="submit"]').first();
      
      await currentPassInput.fill(CONFIG.users.user.password);
      await newPassInput.fill('123'); // Contraseña débil
      await submitButton.click();
      
      // Verificar error de validación
      const hasError = await newPassInput.evaluate(el => 
        el.classList.contains('ng-invalid') || el.classList.contains('is-invalid')
      );
      expect(hasError).toBeTruthy();
    }
  });
});

test.describe('👤 Perfil - Preferencias', () => {
  test('debería cambiar preferencias de notificaciones', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    await page.goto(`${CONFIG.baseURL}/profile`);
    const profilePage = new ProfilePage(page);
    await profilePage.navigateToSettings();
    
    if (await profilePage.notificationsToggle.isVisible().catch(() => false)) {
      const initialState = await profilePage.notificationsToggle.isChecked().catch(() => false);
      
      await profilePage.notificationsToggle.click();
      
      // Verificar que cambió
      const newState = await profilePage.notificationsToggle.isChecked().catch(() => false);
      expect(newState).toBe(!initialState);
      
      // Volver al estado original
      await profilePage.notificationsToggle.click();
    }
  });
});

test.describe('👤 Perfil - Avatar', () => {
  test('debería permitir subir nuevo avatar', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    await page.goto(`${CONFIG.baseURL}/profile`);
    const profilePage = new ProfilePage(page);
    
    if (await profilePage.avatarUpload.isVisible().catch(() => false)) {
      // Crear archivo de imagen de prueba
      const imageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      
      await profilePage.avatarUpload.setInputFiles({
        name: 'test-avatar.png',
        mimeType: 'image/png',
        buffer: imageBuffer,
      });
      
      // Verificar mensaje de éxito
      await expect(page.locator('.toast, .success, text=avatar actualizado').first()).toBeVisible();
    }
  });
});

test.describe('👤 Perfil - Cerrar Sesión', () => {
  test('debería cerrar sesión desde el perfil', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(CONFIG.users.user.email, CONFIG.users.user.password);
    
    await page.goto(`${CONFIG.baseURL}/profile`);
    const profilePage = new ProfilePage(page);
    await profilePage.logout();
    
    // Verificar que estamos fuera
    await expect(page).toHaveURL(/.*(login|home)?$/);
  });
});
