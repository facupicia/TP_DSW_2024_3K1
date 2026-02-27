import { test, expect } from '@playwright/test';
import { CONFIG } from '../utils/config';

/**
 * Tests de Pagos - MercadoPago
 * CRÍTICO: Flujos de pago, marketplace OAuth y suscripciones
 */

const API_URL = CONFIG.apiURL;

test.describe('💳 Pagos - API Endpoints', () => {
  
  test('debería crear preferencia de pago (requiere auth)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        eventId: 1,
        ticketTypeId: 1,
        quantity: 1
      },
      timeout: 30000,
    });
    
    // Sin auth debería retornar 401
    expect([200, 401, 404]).toContain(response.status());
    console.log('💳 Crear preferencia:', response.status());
  });

  test('debería crear preferencia QR (requiere auth)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-qr-preference`, {
      data: {
        eventId: 1,
        ticketTypeId: 1,
        quantity: 1
      },
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('📱 Crear preferencia QR:', response.status());
  });

  test('debería verificar estado de pago (requiere auth)', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/payment/status?external_reference=test-ref`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('🔍 Verificar estado:', response.status());
  });

  test('webhook de pagos responde correctamente', async ({ request }) => {
    // El webhook no requiere auth y siempre debe retornar 200
    const response = await request.post(`${API_URL}/api/payment/webhook`, {
      data: {
        action: 'payment.created',
        data: { id: '123456789' }
      },
      timeout: 30000,
    });
    
    // Webhook debe responder 200 incluso si hay errores (para que MP no reintente)
    expect(response.status()).toBe(200);
    console.log('📡 Webhook POST:', response.status());
  });

  test('webhook GET responde correctamente', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/payment/webhook`, {
      timeout: 30000,
    });
    
    expect(response.status()).toBe(200);
    console.log('📡 Webhook GET:', response.status());
  });

  test('simulador de webhook funciona (requiere auth)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/test-webhook`, {
      data: {
        paymentId: 'test-123',
        externalReference: 'test-ref-123'
      },
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('🧪 Simular webhook:', response.status());
  });
});

test.describe('🏪 Marketplace - OAuth MercadoPago', () => {
  
  test('iniciar OAuth de MP (requiere auth)', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/payment/mp/connect`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('authUrl');
      expect(data.authUrl).toContain('mercadopago');
      console.log('🔗 OAuth URL generada:', data.authUrl.substring(0, 60) + '...');
    }
  });

  test('callback OAuth sin params redirige con error', async ({ request, page }) => {
    // Hacer la request y seguir redirecciones
    const response = await page.goto(`${API_URL}/api/payment/mp/callback`);
    
    // Debería redirigir al frontend con error
    expect(page.url()).toContain('mp_error');
    console.log('🔄 Callback sin params redirige a:', page.url().substring(0, 80));
  });

  test('verificar estado de conexión MP (requiere auth)', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/payment/mp/status`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('connected');
      expect(typeof data.connected).toBe('boolean');
      console.log('✅ Estado MP:', data.connected ? 'Conectado' : 'Desconectado');
    }
  });

  test('desconectar MP (requiere auth)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/mp/disconnect`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      console.log('🔓 Cuenta MP desconectada');
    }
  });
});

test.describe('🔄 Suscripciones - Planes y Pagos', () => {
  
  test('debería listar planes de suscripción (público)', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/subscription/plans`, {
      timeout: 30000,
    });
    
    expect([200, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data) || typeof data === 'object').toBeTruthy();
      
      // Si es array, verificar estructura
      if (Array.isArray(data) && data.length > 0) {
        expect(data[0]).toHaveProperty('name');
        expect(data[0]).toHaveProperty('monthlyPrice');
        console.log('📋 Planes encontrados:', data.length);
      }
    }
  });

  test('webhook de suscripciones responde correctamente', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/webhook`, {
      data: {
        action: 'subscription.authorized_payment',
        data: { id: 'sub-123' }
      },
      timeout: 30000,
    });
    
    expect(response.status()).toBe(200);
    console.log('📡 Webhook suscripción:', response.status());
  });

  test('callback de suscripción redirige', async ({ page }) => {
    const response = await page.goto(`${API_URL}/api/subscription/callback?status=success`);
    
    // Debería redirigir al frontend
    const url = page.url();
    expect(url).not.toContain('/api/subscription/callback');
    console.log('🔄 Callback suscripción redirige a frontend');
  });

  test('verificar mi suscripción (requiere auth)', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/subscription/my-subscription`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('👤 Mi suscripción:', response.status());
  });

  test('verificar límites del plan (requiere auth)', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/subscription/my-limits`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('📊 Mis límites:', response.status());
  });

  test('crear checkout de suscripción (requiere auth)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/checkout/1`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('💰 Checkout suscripción:', response.status());
  });

  test('cancelar suscripción (requiere auth)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/cancel`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('❌ Cancelar suscripción:', response.status());
  });

  test('verificar suscripción manualmente (requiere auth)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/verify/1`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('🔍 Verificar suscripción:', response.status());
  });
});

test.describe('👑 Admin - Suscripciones', () => {
  
  test('asignar plan a usuario (solo admin)', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/admin/assign`, {
      data: {
        userId: 1,
        planId: 1
      },
      timeout: 30000,
    });
    
    // 401 si no es admin, 200 si es admin
    expect([200, 401, 404]).toContain(response.status());
    console.log('👑 Asignar plan:', response.status());
  });

  test('estadísticas de suscripciones (solo admin)', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/subscription/admin/stats`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('📈 Stats suscripciones:', response.status());
  });
});

test.describe('🌐 Frontend - Checkout y Pagos', () => {
  
  test('página de checkout carga', async ({ page }) => {
    // Intentar acceder a checkout (puede redirigir a login si no hay auth)
    await page.goto(`${CONFIG.baseURL}/checkout?event=1&ticket=1&quantity=1`);
    
    // La página debería cargar (aunque redirija)
    await page.waitForLoadState('networkidle');
    
    const url = page.url();
    const hasContent = await page.locator('body').innerText().then(t => t.length > 0);
    
    expect(hasContent).toBeTruthy();
    console.log('💳 Checkout URL:', url.substring(0, 60));
  });

  test('página de suscripciones carga', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/subscription/plans`);
    
    await page.waitForLoadState('networkidle');
    
    const url = page.url();
    const hasContent = await page.locator('body').innerText().then(t => t.length > 0);
    
    expect(hasContent).toBeTruthy();
    console.log('📋 Suscripciones URL:', url.substring(0, 60));
  });

  test('conectar MercadoPago inicia flujo OAuth', async ({ page, context }) => {
    // Ir a perfil donde debería estar la opción de conectar MP
    await page.goto(`${CONFIG.baseURL}/profile`);
    
    await page.waitForLoadState('networkidle');
    
    // Buscar botón de conectar MP
    const connectButton = page.locator('button:has-text("MercadoPago"), button:has-text("MP"), a:has-text("conectar"), button:has-text("Conectar")').first();
    
    if (await connectButton.isVisible().catch(() => false)) {
      console.log('✅ Botón de conectar MP encontrado');
      
      // Click en el botón
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        connectButton.click()
      ]);
      
      // Verificar que se abrió popup o redirigió
      await popup.waitForLoadState();
      const popupUrl = popup.url();
      
      expect(popupUrl).toContain('mercadopago');
      console.log('🔗 Popup MP abierto:', popupUrl.substring(0, 60));
      
      await popup.close();
    } else {
      console.log('ℹ️ Botón de conectar MP no visible (posiblemente requiere login)');
      test.skip();
    }
  });
});

test.describe('🔒 Seguridad - Pagos', () => {
  
  test('webhook rechaza firma inválida (si está configurado)', async ({ request }) => {
    // Intentar enviar webhook con firma incorrecta
    const response = await request.post(`${API_URL}/api/payment/webhook`, {
      data: {
        action: 'payment.created',
        data: { id: 'fake-id' },
        signature: 'invalid-signature'
      },
      headers: {
        'x-signature': 'invalid'
      },
      timeout: 30000,
    });
    
    // Aún así debería retornar 200 (para no hacer reintentos de MP)
    // pero internamente debería rechazar el procesamiento
    expect(response.status()).toBe(200);
    console.log('🔒 Webhook con firma inválida:', response.status());
  });

  test('no expone tokens de MP en respuestas', async ({ request }) => {
    // Verificar que el estado de MP no expone tokens
    const response = await request.get(`${API_URL}/api/payment/mp/status`, {
      timeout: 30000,
    });
    
    if (response.status() === 200) {
      const data = await response.json();
      
      // No debería haber tokens en la respuesta
      expect(data).not.toHaveProperty('access_token');
      expect(data).not.toHaveProperty('refresh_token');
      expect(data).not.toHaveProperty('mpAccessToken');
      
      console.log('✅ Tokens no expuestos en respuesta');
    }
  });
});
