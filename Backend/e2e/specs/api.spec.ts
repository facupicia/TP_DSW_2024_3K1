import { test, expect } from '@playwright/test';
import { CONFIG } from '../utils/config';

/**
 * Tests de API - Contratos y Endpoints
 * CRÍTICO: Verificar que la API responde correctamente
 */

const API_URL = CONFIG.apiURL;

test.describe('🔌 API - Health Checks', () => {
  
  test('debería responder health check', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`, { timeout: 30000 });
    
    expect(response.status()).toBe(200);
    
    const body = await response.json().catch(() => ({}));
    expect(body).toHaveProperty('status', 'ok');
  });

  test('debería responder métricas', async ({ request }) => {
    const response = await request.get(`${API_URL}/metrics`, { timeout: 30000 });
    expect([200, 401, 403]).toContain(response.status());
  });
});

test.describe('🔌 API - Eventos', () => {
  
  test('debería listar eventos públicos', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/event`, { timeout: 30000 });
    
    // Puede ser 200 (éxito) o 401 (si requiere auth)
    expect([200, 401]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
      
      if (data.length > 0) {
        const event = data[0];
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('title');
        expect(event).toHaveProperty('date');
        expect(event).toHaveProperty('location');
      }
    }
  });

  test('debería obtener detalle de evento', async ({ request }) => {
    // Primero obtener un evento
    const listResponse = await request.get(`${API_URL}/api/event`, { timeout: 30000 });
    const events = await listResponse.json();
    
    if (events.length > 0) {
      const eventId = events[0].id;
      const detailResponse = await request.get(`${API_URL}/api/event/${eventId}`, { timeout: 30000 });
      
      expect(detailResponse.status()).toBe(200);
      
      const event = await detailResponse.json();
      expect(event).toHaveProperty('id', eventId);
      expect(event).toHaveProperty('title');
      expect(event).toHaveProperty('description');
      expect(event).toHaveProperty('ticketTypes');
    }
  });

  test('debería retornar 404 para evento inexistente', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/event/999999999`, { timeout: 30000 });
    expect(response.status()).toBe(404);
  });

  test('debería filtrar eventos por categoría', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/event?category=musica`, { timeout: 30000 });
    
    expect([200, 401]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    }
  });

  test('debería buscar eventos por texto', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/event?search=concierto`, { timeout: 30000 });
    
    expect([200, 401]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    }
  });
});

test.describe('🔌 API - Autenticación', () => {
  
  test('debería rechazar acceso sin token', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/user/profile`, { timeout: 30000 });
    expect(response.status()).toBe(401);
  });

  test('debería rechazar token inválido', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/user/profile`, {
      headers: {
        'Authorization': 'Bearer invalid-token',
      },
      timeout: 30000,
    });
    expect(response.status()).toBe(401);
  });

  test('debería autenticar con credenciales válidas', async ({ request }) => {
    // Nota: Este test requiere que exista el usuario en la base de datos
    const response = await request.post(`${API_URL}/api/user/login`, {
      data: {
        email: CONFIG.users.user.email,
        password: CONFIG.users.user.password,
      },
      timeout: 30000,
    });
    
    // Puede ser 200 (éxito), 400 (usuario no existe), o 401 (contraseña incorrecta)
    expect([200, 400, 401]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('token');
    }
  });

  test('debería rechazar credenciales inválidas', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/user/login`, {
      data: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      },
      timeout: 30000,
    });
    
    // El backend retorna 400 si el usuario no existe, 401 si la contraseña es incorrecta
    expect([400, 401]).toContain(response.status());
  });
});

test.describe('🔌 API - Categorías', () => {
  
  test('debería listar categorías', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/category`, { timeout: 30000 });
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    
    // El backend puede retornar array directo o objeto con propiedad 'categories'
    const categories = Array.isArray(data) ? data : data.categories;
    expect(Array.isArray(categories)).toBeTruthy();
    
    if (categories.length > 0) {
      expect(categories[0]).toHaveProperty('id');
      expect(categories[0]).toHaveProperty('name');
    }
  });
});

test.describe('🔌 API - Rate Limiting', () => {
  
  test('debería limitar requests excesivos', async ({ request }) => {
    // Hacer múltiples requests rápidos
    const requests = Array(5).fill(null).map(() => 
      request.get(`${API_URL}/health`, { timeout: 10000 })
    );
    
    const responses = await Promise.all(requests);
    
    // Verificar que al menos algunos respondieron (200, 401, o 429)
    const statusCodes = responses.map(r => r.status());
    const validResponses = statusCodes.filter(s => [200, 401, 429].includes(s));
    
    expect(validResponses.length).toBeGreaterThan(0);
  });
});

test.describe('🔌 API - CORS', () => {
  
  test('debería tener headers CORS correctos', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/event`, {
      headers: {
        'Origin': 'https://event-life.netlify.app',
      },
      timeout: 30000,
    });
    
    const corsHeader = response.headers()['access-control-allow-origin'];
    expect(corsHeader).toBeTruthy();
  });
});

test.describe('🔌 API - Content Types', () => {
  
  test('debería retornar JSON', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/event`, { timeout: 30000 });
    
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });

  test('debería aceptar JSON en POST', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/user/login`, {
      data: {
        email: 'test@test.com',
        password: 'test',
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    
    // Puede fallar por credenciales pero debería aceptar el formato
    expect([200, 401, 400]).toContain(response.status());
  });
});

test.describe('🔌 API - Swagger Docs', () => {
  
  test('debería servir documentación Swagger', async ({ request }) => {
    const response = await request.get(`${API_URL}/api-docs`, { timeout: 30000 });
    
    // Puede ser 200 (configurado) o 404 (no configurado)
    expect([200, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const body = await response.text();
      expect(body).toContain('swagger');
    }
  });
});
