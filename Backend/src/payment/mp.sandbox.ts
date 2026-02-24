/**
 * MercadoPago Sandbox Configuration
 *
 * Este módulo permite forzar el modo sandbox para testing,
 * independientemente de si usás tokens de TEST o APP_USR.
 *
 * Para activar: MP_FORCE_SANDBOX_MODE=true en .env
 */

import { logger } from "../common/services/logger";

// Variable para forzar modo sandbox (útil para testing con tokens de producción)
const FORCE_SANDBOX = process.env.MP_FORCE_SANDBOX_MODE === "true";

/**
 * Detecta si estamos en modo sandbox
 *
 * Modos:
 * 1. Token empieza con TEST- → Sandbox automático
 * 2. MP_FORCE_SANDBOX_MODE=true → Forzado (útil con APP_USR- tokens)
 * 3. NODE_ENV=development → Desarrollo (relajado)
 */
export function isSandboxMode(): boolean {
  const accessToken = process.env.MP_ACCESS_TOKEN || "";
  const isTestToken = accessToken.startsWith("TEST-");
  const isDevelopment = process.env.NODE_ENV === "development";

  return isTestToken || FORCE_SANDBOX || isDevelopment;
}

/**
 * Loguea el modo actual al iniciar
 */
export function logSandboxStatus(): void {
  const accessToken = process.env.MP_ACCESS_TOKEN || "";
  const isTestToken = accessToken.startsWith("TEST-");

  if (FORCE_SANDBOX) {
    logger.warn("MP_SANDBOX_FORCED", {
      message: "Sandbox mode FORCED via MP_FORCE_SANDBOX_MODE",
      tokenType: isTestToken ? "TEST" : "APP_USR",
      nodeEnv: process.env.NODE_ENV,
    });
  } else if (isTestToken) {
    logger.warn("MP_SANDBOX_MODE", {
      message: "Sandbox mode detected (TEST token)",
      nodeEnv: process.env.NODE_ENV,
    });
  } else if (process.env.NODE_ENV === "development") {
    logger.info("MP_DEVELOPMENT_MODE", {
      message: "Development mode (relaxed security)",
      sandbox: false,
    });
  } else {
    logger.info("MP_PRODUCTION_MODE", {
      message: "Production mode (strict security)",
    });
  }
}

/**
 * Configuración específica para sandbox
 */
export interface SandboxConfig {
  // Deshabilitar validación de IPs en webhooks
  skipIpValidation: boolean;
  // Deshabilitar validación de firmas en webhooks
  skipSignatureValidation: boolean;
  // Permitir HTTP (no solo HTTPS) en back_urls
  allowHttp: boolean;
  // Usar init_point de sandbox en lugar de www.mercadopago.com
  useSandboxUrls: boolean;
}

/**
 * Obtiene la configuración de sandbox según el modo actual
 */
export function getSandboxConfig(): SandboxConfig {
  const sandbox = isSandboxMode();
  const isDev = process.env.NODE_ENV === "development";

  return {
    // En sandbox/dev, podemos saltear validación de IPs
    skipIpValidation: sandbox || isDev,
    // En sandbox/dev, podemos saltear validación de firmas
    skipSignatureValidation: sandbox || isDev,
    // En sandbox, permitir HTTP
    allowHttp: sandbox || isDev,
    // Solo usar URLs de sandbox si tenemos TEST token
    useSandboxUrls: (process.env.MP_ACCESS_TOKEN || "").startsWith("TEST-"),
  };
}

/**
 * Modifica el init_point para usar sandbox si es necesario
 */
export function normalizeInitPoint(initPoint: string): string {
  const config = getSandboxConfig();

  // Si estamos en sandbox, cambiar de www.mercadopago.com a sandbox.mercadopago.com
  if (config.useSandboxUrls && initPoint.includes("www.mercadopago.com")) {
    return initPoint.replace("www.mercadopago.com", "sandbox.mercadopago.com");
  }

  return initPoint;
}

/**
 * Helper para logs de debugging en sandbox
 */
export function sandboxLog(context: string, data: any): void {
  if (isSandboxMode() || process.env.DEBUG_MP === "true") {
    logger.info(`[SANDBOX] ${context}`, data);
  }
}
