import { MercadoPagoConfig, Preference } from 'mercadopago';
import AppDataSource from '../db';
import { User } from '../user/user.entity';
import { TicketType, TicketTypeStatus } from '../ticketType/ticketType.entity';
import { getActiveSubscription } from '../subscription/subscription.service';
import { refreshOrganizerToken } from './mp-oauth.controller';
import { logger } from '../common/services/logger';
import { getMPConfig, sanitizeUrl } from './mp.config';
import { normalizeInitPoint, sandboxLog } from './mp.sandbox';

/**
 * Preference Service
 * 
 * Servicio especializado en la creación de preferencias de MercadoPago.
 * Maneja validaciones, cálculo de comisiones y construcción del payload.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PreferenceInput {
    userId: number;
    ticketTypeId: number;
    quantity: number;
    promoterCode?: string;
}

export interface PreferenceResult {
    id: string;
    initPoint: string;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
    code?: string;
    statusCode?: number;
}

export interface MarketPlaceInfo {
    commissionPercent: number;
    planName: string;
    marketplaceFee: number;
    organizerAccessToken: string | null;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Valida que el usuario pueda comprar tickets para un evento
 */
export async function validatePurchaseEligibility(
    input: PreferenceInput
): Promise<ValidationResult> {
    const { userId, ticketTypeId, quantity } = input;
    
    // Validar cantidad
    if (!Number.isInteger(quantity) || quantity <= 0) {
        return {
            valid: false,
            error: 'Cantidad inválida',
            code: 'INVALID_QUANTITY',
            statusCode: 400
        };
    }
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        // Obtener usuario y ticket type
        const userRepo = queryRunner.manager.getRepository(User);
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        
        const user = await userRepo.findOne({ where: { id: userId } });
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event', 'event.user']
        });
        
        if (!user || !ticketType) {
            return {
                valid: false,
                error: 'Usuario o tipo de ticket no encontrado',
                code: 'NOT_FOUND',
                statusCode: 404
            };
        }
        
        // Validar estado del ticket type
        if (ticketType.status !== TicketTypeStatus.ACTIVE) {
            return {
                valid: false,
                error: 'Este tipo de ticket no está disponible',
                code: 'TICKET_TYPE_INACTIVE',
                statusCode: 400
            };
        }
        
        // Validar stock
        const availableStock = ticketType.capacity - ticketType.soldCount;
        if (availableStock < quantity) {
            return {
                valid: false,
                error: `Sin stock. Quedan: ${availableStock}`,
                code: 'NO_STOCK',
                statusCode: 409
            };
        }
        
        // Validar que el evento no haya comenzado
        const event = ticketType.event;
        const eventDateTime = new Date(`${event.date}T${event.time}`);
        if (new Date() > eventDateTime) {
            return {
                valid: false,
                error: 'Las ventas han cerrado. El evento ya comenzó.',
                code: 'EVENT_STARTED',
                statusCode: 400
            };
        }
        
        // Validar edad mínima
        if (event.minAge && event.minAge > 0) {
            const birthDate = new Date(user.birth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            
            if (age < event.minAge) {
                return {
                    valid: false,
                    error: `Debes tener al menos ${event.minAge} años para comprar entradas a este evento.`,
                    code: 'AGE_RESTRICTED',
                    statusCode: 403
                };
            }
        }
        
        return { valid: true };
        
    } finally {
        await queryRunner.release();
    }
}

// ============================================================================
// COMMISSION CALCULATION
// ============================================================================

/**
 * Obtiene información del marketplace para un evento
 * Incluye token del organizador y comisión
 */
export async function getMarketPlaceInfo(eventUserId: number): Promise<MarketPlaceInfo> {
    // Default: comisión FREE plan
    const defaultInfo: MarketPlaceInfo = {
        commissionPercent: 8.00,
        planName: 'FREE',
        marketplaceFee: 0,
        organizerAccessToken: null
    };
    
    try {
        // Obtener token del organizador
        const organizerAccessToken = await refreshOrganizerToken(eventUserId);
        
        // Obtener plan y comisión
        const subscription = await getActiveSubscription(eventUserId);
        const commissionPercent = Number(subscription.plan.commissionPercent);
        
        return {
            commissionPercent,
            planName: subscription.plan.name,
            marketplaceFee: 0, // Se calcula después
            organizerAccessToken
        };
        
    } catch (error) {
        logger.warn('MARKETPLACE_INFO_ERROR', {
            eventUserId,
            error: (error as Error).message
        });
        return defaultInfo;
    }
}

/**
 * Calcula el marketplace fee basado en el monto total y comisión
 */
export function calculateMarketplaceFee(
    totalAmount: number,
    commissionPercent: number
): number {
    if (totalAmount <= 0 || commissionPercent <= 0) {
        return 0;
    }
    
    // Usar Math.ceil y mínimo 1 peso si hay comisión
    let fee = Math.ceil((totalAmount * commissionPercent) / 100);
    if (fee < 1) {
        fee = 1;
    }
    
    return fee;
}

// ============================================================================
// PREFERENCE BUILDER
// ============================================================================

/**
 * Construye el body para crear una preferencia de MP
 * 
 * Nuevo modelo con cargo de servicio:
 * - El asistente paga: precio ticket + cargo de servicio
 * - El organizador recibe: precio ticket (exacto)
 * - EventLife se financia del cargo de servicio
 */
export function buildPreferenceBody(
    user: User,
    ticketType: TicketType,
    quantity: number,
    marketplaceInfo: MarketPlaceInfo,
    promoterCode?: string
): any {
    const config = getMPConfig();
    
    const unitPrice = Number(ticketType.price);
    const baseAmount = unitPrice * quantity;
    
    // Cargo de servicio de EventLife (configurable, default 10%)
    const serviceFeePercent = Number(process.env.PLATFORM_SERVICE_FEE_PERCENT || 10);
    const serviceFeeAmount = (baseAmount * serviceFeePercent) / 100;
    
    // Total a cobrar al asistente
    const totalAmount = baseAmount + serviceFeeAmount;
    
    // En marketplace, el marketplace_fee va a la cuenta del integrador (EventLife)
    // Lo configuramos como el cargo de servicio para que vaya a EventLife
    const marketplaceFee = Math.ceil(serviceFeeAmount);
    
    const clientUrl = sanitizeUrl(config.clientUrl);
    const notificationUrl = sanitizeUrl(config.notificationUrl);
    
    // Referencia externa para conciliación
    // Formato: userId|ticketTypeId|quantity|organizerId|promoterCode
    const promoterCodeStr = promoterCode ? `|${promoterCode}` : '';
    const externalRef = `${user.id}|${ticketType.id}|${quantity}|${ticketType.event.user_id}${promoterCodeStr}`;
    
    const body: any = {
        items: [
            {
                id: ticketType.id.toString(),
                title: `${ticketType.event.title} - ${ticketType.name}`.substring(0, 255),
                description: `Entrada para ${ticketType.event.title}`,
                quantity: quantity,
                unit_price: unitPrice,
                currency_id: 'ARS',
            },
            {
                id: 'service-fee',
                title: 'Cargo de servicio EventLife',
                description: `Comisión por uso de la plataforma (${serviceFeePercent}%)`,
                quantity: 1,
                unit_price: serviceFeeAmount,
                currency_id: 'ARS',
            }
        ],
        payer: {
            email: user.email,
            name: user.firstname,
            surname: user.lastname
        },
        back_urls: {
            success: `${clientUrl}/checkout/success`,
            failure: `${clientUrl}/checkout/failure`,
            pending: `${clientUrl}/checkout/pending`,
        },
        // auto_return solo si las URLs son HTTPS
        auto_return: clientUrl.startsWith('https') ? 'approved' : undefined,
        notification_url: notificationUrl || undefined,
        external_reference: externalRef,
        
        // Marketplace fee: va al integrador (EventLife) desde la cuenta del organizador
        // Esto representa el cargo de servicio que EventLife cobra
        marketplace_fee: 0, // Ya incluimos el cargo como item, no necesitamos marketplace_fee
        
        // Metadata para el webhook
        metadata: {
            user_id: Number(user.id),
            ticket_type_id: Number(ticketType.id),
            event_id: Number(ticketType.event.id),
            amount_tickets: Number(quantity),
            organizer_id: ticketType.event.user_id,
            organizer_plan: marketplaceInfo.planName,
            base_amount: baseAmount,
            service_fee_percent: serviceFeePercent,
            service_fee_amount: serviceFeeAmount,
            total_amount: totalAmount,
            commission_percent: marketplaceInfo.commissionPercent,
            marketplace_fee: marketplaceFee,
            payment_model: 'marketplace_with_service_fee',
            promoter_code: promoterCode || null
        }
    };
    
    return body;
}

// ============================================================================
// PREFERENCE CREATION
// ============================================================================

/**
 * Crea una preferencia de MercadoPago
 * 
 * NOTA IMPORTANTE: En el modelo marketplace, la preferencia se crea con el
 * token del ORGANIZADOR, no con el de la plataforma. Esto permite que el
 * dinero vaya directamente a la cuenta del organizador.
 * 
 * Si el organizador no tiene token válido, se usa el de la plataforma
 * (con redirección manual después).
 */
export async function createMercadoPagoPreference(
    input: PreferenceInput
): Promise<PreferenceResult> {
    const { userId, ticketTypeId, quantity } = input;
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        // Obtener datos
        const userRepo = queryRunner.manager.getRepository(User);
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        
        const user = await userRepo.findOne({ where: { id: userId } });
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event']
        });
        
        if (!user || !ticketType) {
            throw new Error('User or TicketType not found');
        }
        
        // Obtener info del marketplace
        const marketplaceInfo = await getMarketPlaceInfo(ticketType.event.user_id);
        
        // Verificar que el organizador tenga MP vinculado
        if (!marketplaceInfo.organizerAccessToken) {
            logger.error('MARKETPLACE_NO_ORGANIZER_TOKEN', {
                organizerId: ticketType.event.user_id,
                eventId: ticketType.event.id
            });
            throw new Error('ORGANIZER_MP_NOT_LINKED');
        }
        
        // Crear cliente MP con token del ORGANIZADOR
        const mpClient = new MercadoPagoConfig({
            accessToken: marketplaceInfo.organizerAccessToken
        });
        
        const preference = new Preference(mpClient);
        
        // Construir body
        const body = buildPreferenceBody(user, ticketType, quantity, marketplaceInfo, input.promoterCode);
        
        // Log de creación
        logger.info('PREFERENCE_CREATING', {
            userId,
            ticketTypeId,
            quantity,
            organizerId: ticketType.event.user_id,
            marketplaceFee: body.marketplace_fee,
            promoterCode: input.promoterCode
        });
        
        // Crear preferencia
        const result = await preference.create({ body });
        
        if (!result.id || !result.init_point) {
            throw new Error('MercadoPago did not return preference ID or init_point');
        }
        
        // Normalizar URL para sandbox si es necesario
        const initPoint = normalizeInitPoint(result.init_point!);
        
        logger.info('PREFERENCE_CREATED', {
            preferenceId: result.id,
            userId,
            organizerId: ticketType.event.user_id,
            sandbox: initPoint.includes('sandbox')
        });
        
        sandboxLog('PREFERENCE_CREATED', {
            preferenceId: result.id,
            initPoint,
            items: body.items
        });
        
        return {
            id: result.id!,
            initPoint
        };
        
    } finally {
        await queryRunner.release();
    }
}

/**
 * Crea una preferencia usando el token de la PLATAFORMA
 * Útil como fallback si el organizador no tiene MP vinculado
 */
export async function createPlatformPreference(
    input: PreferenceInput
): Promise<PreferenceResult> {
    const { userId, ticketTypeId, quantity } = input;
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        const config = getMPConfig();
        
        const userRepo = queryRunner.manager.getRepository(User);
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        
        const user = await userRepo.findOne({ where: { id: userId } });
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event']
        });
        
        if (!user || !ticketType) {
            throw new Error('User or TicketType not found');
        }
        
        // Usar token de la plataforma
        const mpClient = new MercadoPagoConfig({ accessToken: config.accessToken });
        const preference = new Preference(mpClient);
        
        // Obtener info de comisión para metadata
        const marketplaceInfo = await getMarketPlaceInfo(ticketType.event.user_id);
        const body = buildPreferenceBody(user, ticketType, quantity, marketplaceInfo, input.promoterCode);
        
        // Sin marketplace_fee al usar token de plataforma
        delete body.marketplace_fee;
        
        const result = await preference.create({ body });
        
        if (!result.id || !result.init_point) {
            throw new Error('MercadoPago did not return preference ID or init_point');
        }
        
        const initPoint = normalizeInitPoint(result.init_point!);
        
        logger.info('PLATFORM_PREFERENCE_CREATED', {
            preferenceId: result.id,
            userId,
            organizerId: ticketType.event.user_id,
            sandbox: initPoint.includes('sandbox')
        });
        
        return {
            id: result.id!,
            initPoint
        };
        
    } finally {
        await queryRunner.release();
    }
}
