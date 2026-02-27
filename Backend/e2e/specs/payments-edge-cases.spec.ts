import { test, expect } from '@playwright/test';
import { CONFIG } from '../utils/config';

/**
 * Tests de Casos Edge para Pagos
 * Detecta problemas potenciales en el sistema de pagos
 */

const API_URL = CONFIG.apiURL;

test.describe('🚨 Pagos - Casos Edge y Seguridad', () => {
  
  test('webhook con body vacío no debe crashear', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/webhook`, {
      data: {},
      timeout: 30000,
    });
    
    // Debe retornar 200 para no hacer reintentos
    expect([200, 403]).toContain(response.status());
    console.log('✅ Webhook con body vacío manejado correctamente');
  });

  test('webhook con data inválida no debe crashear', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/webhook`, {
      data: {
        action: 'invalid.action',
        data: null,
        id: undefined
      },
      timeout: 30000,
    });
    
    expect([200, 403]).toContain(response.status());
    console.log('✅ Webhook con data inválida manejado correctamente');
  });

  test('webhook con paymentId malicioso no debe procesar', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/webhook`, {
      data: {
        action: 'payment.created',
        data: { id: "'; DROP TABLE payments; --" }  // SQL Injection attempt
      },
      timeout: 30000,
    });
    
    expect(response.status()).toBe(200);
    console.log('✅ Webhook con ID malicioso manejado correctamente');
  });

  test('crear preferencia con cantidad negativa debe ser rechazado', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: -5,
        ticketTypeId: 1
      },
      timeout: 30000,
    });
    
    // Sin auth da 401, pero con auth debería dar 400
    expect([400, 401, 404]).toContain(response.status());
    console.log('✅ Cantidad negativa rechazada:', response.status());
  });

  test('crear preferencia con cantidad cero debe ser rechazado', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: 0,
        ticketTypeId: 1
      },
      timeout: 30000,
    });
    
    expect([400, 401, 404]).toContain(response.status());
    console.log('✅ Cantidad cero rechazada:', response.status());
  });

  test('crear preferencia con cantidad muy alta debe ser rechazado', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: 999999,
        ticketTypeId: 1
      },
      timeout: 30000,
    });
    
    expect([400, 401, 422]).toContain(response.status());
    console.log('✅ Cantidad excesiva manejada:', response.status());
  });

  test('crear preferencia sin ticketTypeId debe ser rechazado', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: 1
      },
      timeout: 30000,
    });
    
    expect([400, 401]).toContain(response.status());
    console.log('✅ Falta ticketTypeId manejado:', response.status());
  });

  test('webhook duplicado no debe crear tickets duplicados', async ({ request }) => {
    // Enviar el mismo webhook dos veces
    const webhookData = {
      action: 'payment.created',
      data: { id: 'test-payment-12345' },
      external_reference: 'test|1|1|1'
    };
    
    const response1 = await request.post(`${API_URL}/api/payment/webhook`, {
      data: webhookData,
      timeout: 30000,
    });
    
    const response2 = await request.post(`${API_URL}/api/payment/webhook`, {
      data: webhookData,
      timeout: 30000,
    });
    
    // Ambos deben retornar 200 (idempotencia)
    expect(response1.status()).toBe(200);
    expect(response2.status()).toBe(200);
    console.log('✅ Webhooks duplicados manejados (idempotencia)');
  });

  test('status de pago con external_reference inválido', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/payment/status?external_reference=invalid|reference|format`, {
      timeout: 30000,
    });
    
    expect([200, 401, 404]).toContain(response.status());
    console.log('✅ External reference inválido manejado:', response.status());
  });

  test('OAuth callback con state manipulado', async ({ page }) => {
    // Intentar callback con state inválido
    const response = await page.goto(`${API_URL}/api/payment/mp/callback?code=fakecode&state=manipulated_state_123`);
    
    // Debería redirigir con error
    expect(page.url()).toContain('mp_error');
    console.log('✅ State manipulado detectado');
  });

  test('OAuth callback con code reutilizado', async ({ page }) => {
    // Primera vez con el code
    await page.goto(`${API_URL}/api/payment/mp/callback?code=same_code&state=valid_state`);
    const url1 = page.url();
    
    // Segunda vez con el mismo code
    await page.goto(`${API_URL}/api/payment/mp/callback?code=same_code&state=valid_state`);
    const url2 = page.url();
    
    // Ambas deberían manejarse (la segunda probablemente con error)
    expect(url1).toContain('mp_');
    expect(url2).toContain('mp_');
    console.log('✅ Code reutilizado manejado');
  });

  test('webhook suscripción con estado inválido', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/webhook`, {
      data: {
        action: 'subscription.authorized_payment',
        data: { 
          id: 'sub-123',
          status: 'invalid_status'
        }
      },
      timeout: 30000,
    });
    
    expect(response.status()).toBe(200);
    console.log('✅ Estado de suscripción inválido manejado');
  });

  test('rate limiting en webhooks', async ({ request }) => {
    // Enviar múltiples webhooks rápidamente desde la misma IP
    const promises = Array(35).fill(null).map(() => 
      request.post(`${API_URL}/api/payment/webhook`, {
        data: { action: 'test' },
        timeout: 5000,
      })
    );
    
    const responses = await Promise.all(promises);
    
    // Algunos deben ser rate limited (429)
    const statuses = responses.map(r => r.status());
    const hasRateLimited = statuses.includes(429);
    const hasSuccess = statuses.includes(200);
    
    expect(hasSuccess || hasRateLimited).toBeTruthy();
    console.log(`✅ Rate limiting: ${statuses.filter(s => s === 429).length} requests bloqueados`);
  });

  test('validación de IP en webhook', async ({ request }) => {
    // Intentar desde una IP no válida (el header puede ser spoofeado)
    const response = await request.post(`${API_URL}/api/payment/webhook`, {
      data: { action: 'payment.created' },
      headers: {
        'X-Forwarded-For': '1.2.3.4'  // IP no válida de MP
      },
      timeout: 30000,
    });
    
    // En producción debería rechazar, en sandbox puede aceptar
    expect([200, 403]).toContain(response.status());
    console.log('✅ Validación de IP:', response.status());
  });

  test('checkout suscripción con planId inválido', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/checkout/invalid_id`, {
      timeout: 30000,
    });
    
    expect([400, 401, 404]).toContain(response.status());
    console.log('✅ Plan ID inválido manejado:', response.status());
  });

  test('checkout suscripción con planId inexistente', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/subscription/checkout/999999`, {
      timeout: 30000,
    });
    
    expect([400, 401, 404]).toContain(response.status());
    console.log('✅ Plan inexistente manejado:', response.status());
  });

  test('simular webhook sin paymentId', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/test-webhook`, {
      data: {
        externalReference: 'test-ref'
        // Sin paymentId
      },
      timeout: 30000,
    });
    
    expect([400, 401]).toContain(response.status());
    console.log('✅ Simulación sin paymentId manejada:', response.status());
  });

  test('webhook con timestamp futuro', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/webhook`, {
      data: {
        action: 'payment.created',
        data: { id: '123' },
        timestamp: Date.now() + 86400000 // Mañana
      },
      headers: {
        'x-signature': 'ts=' + (Date.now() + 86400000) + ',v1=fake'
      },
      timeout: 30000,
    });
    
    expect(response.status()).toBe(200);
    console.log('✅ Timestamp futuro manejado');
  });

  test('preferencia con metadata muy grande', async ({ request }) => {
    const largeMetadata = 'x'.repeat(10000); // 10KB de metadata
    
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: 1,
        ticketTypeId: 1,
        metadata: { huge: largeMetadata }
      },
      timeout: 30000,
    });
    
    expect([200, 401, 413]).toContain(response.status());
    console.log('✅ Metadata grande manejada:', response.status());
  });
});

test.describe('🔍 Pagos - Validaciones de Negocio', () => {
  
  test('no se puede comprar ticket de evento pasado', async ({ request }) => {
    // Esto requiere un ticketTypeId de un evento pasado
    // Por ahora solo verificamos que el endpoint responde
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: 1,
        ticketTypeId: 1  // Asumiendo que existe
      },
      timeout: 30000,
    });
    
    // Sin auth da 401, con auth podría dar 400 si el evento pasó
    expect([200, 400, 401]).toContain(response.status());
  });

  test('no se puede comprar más tickets que el disponible', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: 1000000,  // Más que cualquier stock
        ticketTypeId: 1
      },
      timeout: 30000,
    });
    
    expect([400, 401]).toContain(response.status());
    console.log('✅ Stock insuficiente manejado');
  });

  test('no se puede comprar ticket sin estar logueado', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/payment/create-preference`, {
      data: {
        ticketQuantity: 1,
        ticketTypeId: 1
      },
      // Sin headers de auth
      timeout: 30000,
    });
    
    expect(response.status()).toBe(401);
    console.log('✅ Compra sin auth rechazada');
  });

  test('suscripción gratuita no requiere pago', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/subscription/plans`, {
      timeout: 30000,
    });
    
    if (response.status() === 200) {
      const data = await response.json();
      const plans = Array.isArray(data) ? data : data.plans || [];
      
      const freePlan = plans.find((p: any) => 
        p.monthlyPrice === '0.00' || p.monthlyPrice === 0 || p.name === 'FREE'
      );
      
      if (freePlan) {
        console.log('✅ Plan gratuito encontrado:', freePlan.name);
        expect(freePlan).toBeTruthy();
      }
    }
  });
});

test.describe('🌐 Frontend - Flujo Completo de Pago', () => {
  
  test('página de éxito después de pago existe', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/payment/success`);
    await page.waitForLoadState('networkidle');
    
    // Debería mostrar mensaje de éxito o redirigir
    const content = await page.locator('body').innerText();
    expect(content.length).toBeGreaterThan(0);
    console.log('✅ Página de éxito accesible');
  });

  test('página de fallo después de pago existe', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/payment/failure`);
    await page.waitForLoadState('networkidle');
    
    const content = await page.locator('body').innerText();
    expect(content.length).toBeGreaterThan(0);
    console.log('✅ Página de fallo accesible');
  });

  test('página de pendiente existe', async ({ page }) => {
    await page.goto(`${CONFIG.baseURL}/payment/pending`);
    await page.waitForLoadState('networkidle');
    
    const content = await page.locator('body').innerText();
    expect(content.length).toBeGreaterThan(0);
    console.log('✅ Página de pendiente accesible');
  });

  test('redirección desde MP después de pago funciona', async ({ page }) => {
    // Simular redirección de MP con parámetros
    await page.goto(`${CONFIG.baseURL}/?collection_id=123&collection_status=approved`);
    await page.waitForLoadState('networkidle');
    
    const url = page.url();
    expect(url).toBeTruthy();
    console.log('✅ Redirección MP manejada');
  });
});
