/**
 * QR Payment Service
 * 
 * Servicio para generar pagos por QR usando MercadoPago Checkout Pro.
 * 
 * Características:
 * - Comisión MP: 2.59%
 * - El usuario paga escaneando QR desde la app o click directo
 * - El dinero va a la cuenta de la plataforma (no marketplace)
 * - Ideal para venta rápida de tickets
 */

import { MercadoPagoConfig, Preference } from 'mercadopago';
import AppDataSource from '../db';
import { User } from '../user/user.entity';
import { TicketType } from '../ticketType/ticketType.entity';
import { logger } from '../common/services/logger';
import { getMPConfig, sanitizeUrl } from './mp.config';

/**
 * Crear una preferencia de pago por QR (Checkout Pro estándar)
 * 
 * A diferencia del marketplace, aquí:
 * - El dinero va a la cuenta de la PLATAFORMA
 * - Comisión MP: 2.59%
 * - El organizador recibe el pago después (transferencia manual o acumulación)
 */
export async function createQRPaymentPreference(
    userId: number,
    ticketTypeId: number,
    quantity: number
): Promise<{ id: string; initPoint: string; qrCodeUrl?: string }> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
        // 1. Obtener datos del usuario y ticket type
        const userRepo = queryRunner.manager.getRepository(User);
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);

        const user = await userRepo.findOne({ where: { id: userId } });
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event']
        });

        if (!user || !ticketType) {
            throw new Error('Usuario o tipo de ticket no encontrado');
        }

        // 2. Validar stock
        const availableStock = ticketType.capacity - ticketType.soldCount;
        if (availableStock < quantity) {
            throw new Error(`Sin stock. Quedan: ${availableStock}`);
        }

        // 3. Calcular montos
        const unitPrice = Number(ticketType.price);
        const totalAmount = unitPrice * quantity;
        
        // Comisión de MP para QR (2.59%)
        const mpCommissionPercent = 2.59;
        const mpCommissionAmount = (totalAmount * mpCommissionPercent) / 100;
        
        // Lo que recibe la plataforma después de la comisión de MP
        const platformNetAmount = totalAmount - mpCommissionAmount;

        logger.info('QR_PAYMENT_PREFERENCE', {
            userId,
            ticketTypeId,
            quantity,
            totalAmount,
            mpCommissionPercent,
            mpCommissionAmount,
            platformNetAmount
        });

        // 4. Crear preferencia de MP (Checkout Pro estándar)
        const config = getMPConfig();
        const mpClient = new MercadoPagoConfig({ accessToken: config.accessToken });
        const preference = new Preference(mpClient);

        // Validar que tenemos una URL de cliente válida
        let clientUrl = sanitizeUrl(config.clientUrl);
        if (!clientUrl || clientUrl === '') {
            // Fallback a valores conocidos
            clientUrl = process.env.NODE_ENV === 'production' 
                ? 'https://event-life.netlify.app'
                : 'http://localhost:4200';
            logger.warn('QR_PAYMENT_USING_FALLBACK_CLIENT_URL', { 
                original: config.clientUrl,
                fallback: clientUrl 
            });
        }

        const successUrl = `${clientUrl}/checkout/success?type=qr`;
        const failureUrl = `${clientUrl}/checkout/failure?type=qr`;
        const pendingUrl = `${clientUrl}/checkout/pending?type=qr`;

        logger.info('QR_PAYMENT_URLS', {
            clientUrl,
            successUrl,
            failureUrl,
            pendingUrl
        });

        // Referencia externa para identificar el pago
        // Formato: QR|userId|ticketTypeId|quantity
        const externalRef = `QR|${userId}|${ticketTypeId}|${quantity}`;

        // Construir el body según el modo (sandbox vs producción)
        // Algunas versiones del SDK tienen problemas con auto_return en sandbox
        const body: any = {
            items: [{
                id: ticketType.id.toString(),
                title: `${ticketType.event.title} - ${ticketType.name}`,
                description: `Entrada para ${ticketType.event.title}`,
                quantity: quantity,
                unit_price: unitPrice,
                currency_id: 'ARS',
            }],
            payer: {
                email: user.email,
                name: user.firstname,
                surname: user.lastname
            },
            external_reference: externalRef,
            metadata: {
                payment_type: 'qr',
                user_id: userId,
                ticket_type_id: ticketTypeId,
                quantity: quantity,
                event_id: ticketType.event.id,
                mp_commission_percent: mpCommissionPercent,
                mp_commission_amount: mpCommissionAmount,
                platform_net_amount: platformNetAmount
            },
            // Configuración específica para QR
            payment_methods: {
                excluded_payment_types: [], // Permitir todos los tipos
                installments: 1, // Solo cuota única para tickets
                default_installments: 1
            }
        };

        // Agregar back_urls - MP requiere que todas las URLs sean válidas y accesibles
        // El orden es importante: algunas versiones del SDK requieren que back_urls vaya antes que auto_return
        body.back_urls = {
            success: successUrl,
            failure: failureUrl,
            pending: pendingUrl
        };

        // auto_return solo funciona en producción con URLs públicas accesibles
        // En sandbox o con localhost, MP puede rechazarlo
        const isSandbox = config.accessToken.startsWith('TEST-');
        if (!isSandbox) {
            body.auto_return = 'approved';
            logger.info('QR_PAYMENT_AUTO_RETURN_ENABLED');
        } else {
            logger.info('QR_PAYMENT_SANDBOX_MODE_AUTO_RETURN_SKIPPED');
        }

        logger.info('QR_PAYMENT_BODY', { 
            back_urls: body.back_urls,
            auto_return: body.auto_return,
            isSandbox 
        });

        const result = await preference.create({ body });

        if (!result.id || !result.init_point) {
            throw new Error('MercadoPago no devolvió preferencia válida');
        }

        // URL para QR (sandbox o producción)
        const initPoint = result.init_point;
        
        // Generar URL del QR
        // En producción, MP genera el QR automáticamente
        // Podemos usar el init_point como base para el QR
        const qrCodeUrl = initPoint; // El init_point ya es scaneable

        logger.info('QR_PREFERENCE_CREATED', {
            preferenceId: result.id,
            userId,
            ticketTypeId,
            initPoint,
            externalRef
        });

        return {
            id: result.id,
            initPoint,
            qrCodeUrl
        };

    } catch (error: any) {
        logger.error('QR_PAYMENT_ERROR', {
            userId,
            ticketTypeId,
            error: error?.message
        });
        throw error;
    } finally {
        await queryRunner.release();
    }
}

/**
 * Calcular comisión y neto para QR
 */
export function calculateQRCommission(amount: number): {
    grossAmount: number;
    mpCommissionPercent: number;
    mpCommissionAmount: number;
    platformNetAmount: number;
} {
    const mpCommissionPercent = 2.59;
    const mpCommissionAmount = (amount * mpCommissionPercent) / 100;
    
    return {
        grossAmount: amount,
        mpCommissionPercent,
        mpCommissionAmount,
        platformNetAmount: amount - mpCommissionAmount
    };
}
