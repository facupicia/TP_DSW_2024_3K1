import { test as setup } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Global Setup - Se ejecuta antes de todos los tests
 */

setup('setup test environment', async ({ request }) => {
  console.log('🚀 Iniciando suite de tests...');
  
  // Crear directorios necesarios
  const dirs = [
    join(process.cwd(), 'test-results'),
    join(process.cwd(), 'test-results', 'screenshots'),
    join(process.cwd(), 'test-results', 'videos'),
    join(process.cwd(), 'test-results', 'traces'),
  ];
  
  dirs.forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });
  
  // Verificar que las URLs son accesibles
  const baseURL = process.env.TEST_BASE_URL || 'https://event-life.netlify.app';
  const apiURL = process.env.TEST_API_URL || 'https://backend-eventlife.onrender.com';
  
  console.log(`🌐 Base URL: ${baseURL}`);
  console.log(`🔌 API URL: ${apiURL}`);
  
  // Verificar health check
  try {
    const response = await request.get(`${apiURL}/health`, { timeout: 10000 });
    if (response.status() === 200) {
      console.log('✅ Backend está saludable');
    } else {
      console.log('⚠️ Backend respondió con status:', response.status());
    }
  } catch (error) {
    console.log('⚠️ No se pudo conectar al backend:', error.message);
  }
  
  console.log('✅ Setup completado');
});
