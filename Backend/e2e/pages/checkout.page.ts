import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object para la página de Checkout/Pago
 */

export class CheckoutPage extends BasePage {
  readonly orderSummary: Locator;
  readonly totalAmount: Locator;
  readonly payButton: Locator;
  readonly cancelButton: Locator;
  readonly couponInput: Locator;
  readonly applyCouponButton: Locator;
  readonly ticketList: Locator;
  readonly mercadoPagoButton: Locator;
  readonly paymentMethods: Locator;

  constructor(page: Page) {
    super(page, '');
    
    this.orderSummary = page.locator('[data-testid="order-summary"], .order-summary').first();
    this.totalAmount = page.locator('[data-testid="total-amount"], .total-price').first();
    this.payButton = page.locator('button:has-text("Pagar"), button:has-text("Confirmar"), [data-testid="pay-button"]').first();
    this.cancelButton = page.locator('button:has-text("Cancelar"), [data-testid="cancel-button"]').first();
    this.couponInput = page.locator('input[placeholder*="cupón" i], input[name="coupon"], [data-testid="coupon-input"]').first();
    this.applyCouponButton = page.locator('button:has-text("Aplicar"), [data-testid="apply-coupon"]').first();
    this.ticketList = page.locator('[data-testid="ticket-item"], .ticket-item');
    this.mercadoPagoButton = page.locator('button:has-text("MercadoPago"), [data-testid="mp-button"]').first();
    this.paymentMethods = page.locator('[data-testid="payment-method"], .payment-option');
  }

  async gotoCheckout(eventId: string, ticketTypeId: string, quantity: number = 1) {
    await this.page.goto(`${CONFIG.baseURL}/checkout?event=${eventId}&ticket=${ticketTypeId}&quantity=${quantity}`);
    await this.waitForPageLoad();
  }

  async applyCoupon(couponCode: string) {
    await this.couponInput.fill(couponCode);
    await this.applyCouponButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async getTotalAmount(): Promise<string> {
    return await this.totalAmount.textContent() || '';
  }

  async clickPay() {
    await this.payButton.click();
    // Redirección a MercadoPago o modal de pago
    await this.page.waitForLoadState('networkidle');
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async selectMercadoPago() {
    await this.mercadoPagoButton.click();
  }

  async expectCheckoutLoaded() {
    await expect(this.orderSummary).toBeVisible();
    await expect(this.totalAmount).toBeVisible();
  }

  async isCouponValid(): Promise<boolean> {
    const toast = this.page.locator('[data-testid="toast"]');
    const text = await toast.textContent().catch(() => '');
    return text.toLowerCase().includes('aplicado') || text.toLowerCase().includes('válido');
  }
}

import { CONFIG } from '../utils/config';
