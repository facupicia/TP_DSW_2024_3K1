/**
 * Configuración global para tests E2E
 */

export const CONFIG = {
  // URLs
  baseURL: process.env.TEST_BASE_URL || 'https://event-life.netlify.app',
  apiURL: process.env.TEST_API_URL || 'https://backend-eventlife.onrender.com',
  
  // Timeouts
  timeout: {
    default: 30000,
    navigation: 60000,
    api: 30000,
    animation: 5000,
  },
  
  // Credenciales de test
  users: {
    admin: {
      email: process.env.TEST_ADMIN_EMAIL || 'fa@gmail.com',
      password: process.env.TEST_ADMIN_PASSWORD || '123456',
    },
    organizer: {
      email: process.env.TEST_ORGANIZER_EMAIL || 'fa@gmail.com',
      password: process.env.TEST_ORGANIZER_PASSWORD || '123456',
    },
    user: {
      email: process.env.TEST_USER_EMAIL || 'fa@gmail.com',
      password: process.env.TEST_USER_PASSWORD || '123456',
    },
  },
  
  // Selectores globales
  selectors: {
    toast: '[data-testid="toast"]',
    loading: '[data-testid="loading"]',
    modal: '[data-testid="modal"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
  },
};

export default CONFIG;
