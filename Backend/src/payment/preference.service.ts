import { MercadoPagoConfig, Preference } from 'mercadopago';
import bcrypt from 'bcrypt';
import AppDataSource from '../db';
import { User } from '../user/user.entity';
import { TicketType, TicketTypeStatus } from '../ticketType/ticketType.entity';
import { getActiveSubscription } from '../subscription/subscription.service';
import { refreshOrganizerToken } from './mp-oauth.controller';
import { logger } from '../common/services/logger';
import { getMPConfig, sanitizeUrl } from './mp.config';
import { Coupon } from '../coupon/coupon.entity';
import { findRolesByNames } from '../user/role.entity';

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
    userId?: number;
    ticketTypeId: number;
    quantity: number;
    promoterCode?: string;
    couponId?: number;
    couponCode?: string;
    guestBuyer?: GuestBuyerInput;
}

export interface PreferenceResult {
    id: string;
    initPoint: string;
    pricing: PreferencePricing;
    externalReference: string;
    buyerEmail: string;
    guestCheckout: boolean;
}

export interface PreferencePricing {
    baseAmount: number;
    discountAmount: number;
    totalAmount: number;
    unitPrice: number;
    couponId?: number;
    discountPercent?: number;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
    code?: string;
    statusCode?: number;
}

export interface GuestBuyerInput {
    firstname: string;
    lastname: string;
    email: string;
    phone: string;
    birth?: string;
}

export interface MarketPlaceInfo {
    commissionPercent: number;
    planName: string;
    marketplaceFee: number;
    organizerAccessToken: string | null;
}

interface PurchasePayer {
    user: User;
    payer: {
        firstname: string;
        lastname: string;
        email: string;
    };
    guestCheckout: boolean;
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
    const { userId, ticketTypeId, quantity, guestBuyer } = input;
    
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
        // Obtener ticket type y usuario si corresponde
        const userRepo = queryRunner.manager.getRepository(User);
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event', 'event.user']
        });
        
        if (!ticketType) {
            return {
                valid: false,
                error: 'Tipo de ticket no encontrado',
                code: 'NOT_FOUND',
                statusCode: 404
            };
        }

        let birthDate: Date | null = null;
        if (userId) {
            const user = await userRepo.findOne({ where: { id: userId } });
            if (!user) {
                return {
                    valid: false,
                    error: 'Usuario no encontrado',
                    code: 'USER_NOT_FOUND',
                    statusCode: 404
                };
            }

            birthDate = user.birth ? new Date(user.birth) : null;
        } else if (guestBuyer?.birth) {
            birthDate = new Date(`${guestBuyer.birth}T00:00:00`);
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
            if (!birthDate || isNaN(birthDate.getTime())) {
                return {
                    valid: false,
                    error: 'Debes completar tu fecha de nacimiento para comprar entradas a este evento.',
                    code: 'BIRTH_REQUIRED',
                    statusCode: 400
                };
            }

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

async function resolveValidCoupon(
    couponId: number | undefined,
    couponCode: string | undefined,
    eventId: number
): Promise<Coupon | null> {
    if (!couponId && !couponCode) return null;

    const where: any = couponId
        ? { id: couponId, eventId, isActive: true }
        : { code: couponCode!.toUpperCase().trim(), eventId, isActive: true };

    const coupon = await Coupon.findOne({ where });
    if (!coupon) {
        throw new Error('COUPON_INVALID');
    }

    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
        throw new Error('COUPON_EXPIRED');
    }

    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
        throw new Error('COUPON_EXHAUSTED');
    }

    return coupon;
}

async function resolvePurchasePayer(queryRunner: any, input: PreferenceInput): Promise<PurchasePayer> {
    const userRepo = queryRunner.manager.getRepository(User);

    if (input.userId) {
        const user = await userRepo.findOne({
            where: { id: input.userId },
            relations: ['roles']
        });

        if (!user) {
            throw new Error('USER_NOT_FOUND');
        }

        return {
            user,
            payer: {
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email
            },
            guestCheckout: false
        };
    }

    if (!input.guestBuyer) {
        throw new Error('GUEST_BUYER_REQUIRED');
    }

    const normalizedEmail = input.guestBuyer.email.trim().toLowerCase();
    let user = await userRepo.findOne({
        where: { email: normalizedEmail },
        relations: ['roles']
    });

    if (user && !user.isGuestAccount) {
        // Do not link guest checkout to existing registered accounts without consent
        throw new Error('GUEST_EMAIL_ALREADY_REGISTERED');
    }

    if (!user) {
        const fallbackBirth = input.guestBuyer.birth
            ? new Date(`${input.guestBuyer.birth}T00:00:00`)
            : new Date('1900-01-01T00:00:00');
        const hashedPassword = await bcrypt.hash(`guest:${normalizedEmail}:${Date.now()}`, 12);
        const userRoles = await findRolesByNames(['user']);

        user = userRepo.create({
            firstname: input.guestBuyer.firstname,
            lastname: input.guestBuyer.lastname,
            email: normalizedEmail,
            phone: input.guestBuyer.phone,
            birth: fallbackBirth,
            password: hashedPassword,
            roles: userRoles,
            legacyRoles: ['user'],
            active: true,
            isGuestAccount: true,
            claimedAt: null
        });

        user = await userRepo.save(user);
    }

    return {
        user,
        payer: {
            firstname: input.guestBuyer.firstname || user.firstname,
            lastname: input.guestBuyer.lastname || user.lastname,
            email: normalizedEmail
        },
        guestCheckout: true
    };
}

function buildExternalReference(userId: number, ticketType: TicketType, quantity: number, promoterCode?: string): string {
    const promoterCodeStr = promoterCode ? `|${promoterCode}` : '';
    return `${userId}|${ticketType.id}|${quantity}|${ticketType.event.user_id}${promoterCodeStr}`;
}

function calculatePricing(unitPrice: number, quantity: number, coupon?: Coupon | null): PreferencePricing {
    const baseAmount = unitPrice * quantity;
    const discountPercent = coupon?.discountPercent || 0;
    const discountAmount = discountPercent > 0
        ? Math.min(baseAmount, Math.round((baseAmount * discountPercent) / 100))
        : 0;
    const totalAmount = Math.max(baseAmount - discountAmount, 0);

    return {
        baseAmount,
        discountAmount,
        totalAmount,
        unitPrice: Number((totalAmount / quantity).toFixed(2)),
        couponId: coupon?.id,
        discountPercent: coupon?.discountPercent
    };
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
    payer: { email: string; firstname: string; lastname: string },
    userId: number,
    ticketType: TicketType,
    quantity: number,
    marketplaceInfo: MarketPlaceInfo,
    promoterCode?: string,
    coupon?: Coupon | null
): any {
    const config = getMPConfig();
    
    const originalUnitPrice = Number(ticketType.price);
    const pricing = calculatePricing(originalUnitPrice, quantity, coupon);
    
    // Comisión de EventLife según el plan del organizador (FREE: 8%, PRO: 3%)
    const commissionPercent = marketplaceInfo.commissionPercent;
    const commissionAmount = Math.ceil((pricing.totalAmount * commissionPercent) / 100);
    
    const clientUrl = sanitizeUrl(config.clientUrl);
    const notificationUrl = sanitizeUrl(config.notificationUrl);
    
    // Referencia externa para conciliación
    // Formato: userId|ticketTypeId|quantity|organizerId|promoterCode
    const externalRef = buildExternalReference(userId, ticketType, quantity, promoterCode);
    
    const body: any = {
        items: [
            {
                id: ticketType.id.toString(),
                title: `${ticketType.event.title} - ${ticketType.name}`.substring(0, 255),
                description: `Entrada para ${ticketType.event.title}`,
                quantity: quantity,
                unit_price: pricing.unitPrice,
                currency_id: 'ARS',
            }
        ],
        payer: {
            email: payer.email,
            name: payer.firstname,
            surname: payer.lastname
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
        
        // IMPORTANTE: marketplace_fee es lo que EventLife recibe como comisión
        // Este monto se transfiere automáticamente a la cuenta de EventLife
        marketplace_fee: commissionAmount,
        
        // Metadata para el webhook
        metadata: {
            user_id: Number(userId),
            ticket_type_id: Number(ticketType.id),
            event_id: Number(ticketType.event.id),
            amount_tickets: Number(quantity),
            organizer_id: ticketType.event.user_id,
            organizer_plan: marketplaceInfo.planName,
            base_amount: pricing.baseAmount,
            discount_amount: pricing.discountAmount,
            total_amount: pricing.totalAmount,
            commission_percent: commissionPercent,
            commission_amount: commissionAmount,
            payment_model: 'marketplace',
            promoter_code: promoterCode || null,
            coupon_id: pricing.couponId || null,
            coupon_discount_percent: pricing.discountPercent || null
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
    const { ticketTypeId, quantity } = input;
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        // Obtener datos
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        
        const purchasePayer = await resolvePurchasePayer(queryRunner, input);
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event']
        });
        
        if (!ticketType) {
            throw new Error('TICKET_TYPE_NOT_FOUND');
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
        const coupon = await resolveValidCoupon(input.couponId, input.couponCode, ticketType.event.id);
        const body = buildPreferenceBody(
            purchasePayer.payer,
            purchasePayer.user.id,
            ticketType,
            quantity,
            marketplaceInfo,
            input.promoterCode,
            coupon
        );
        const pricing = calculatePricing(Number(ticketType.price), quantity, coupon);
        const externalReference = buildExternalReference(
            purchasePayer.user.id,
            ticketType,
            quantity,
            input.promoterCode
        );
        
        // Log de creación
        logger.info('PREFERENCE_CREATING', {
            userId: purchasePayer.user.id,
            ticketTypeId,
            quantity,
            organizerId: ticketType.event.user_id,
            marketplaceFee: body.marketplace_fee,
            promoterCode: input.promoterCode,
            guestCheckout: purchasePayer.guestCheckout
        });
        
        // Crear preferencia
        const result = await preference.create({ body });
        
        if (!result.id || !result.init_point) {
            throw new Error('MercadoPago did not return preference ID or init_point');
        }
        
        logger.info('PREFERENCE_CREATED', {
            preferenceId: result.id,
            userId: purchasePayer.user.id,
            organizerId: ticketType.event.user_id
        });
        
        return {
            id: result.id!,
            initPoint: result.init_point!,
            pricing,
            externalReference,
            buyerEmail: purchasePayer.payer.email,
            guestCheckout: purchasePayer.guestCheckout
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
    const { ticketTypeId, quantity } = input;
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        const config = getMPConfig();
        
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        
        const purchasePayer = await resolvePurchasePayer(queryRunner, input);
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event']
        });
        
        if (!ticketType) {
            throw new Error('TICKET_TYPE_NOT_FOUND');
        }
        
        // Usar token de la plataforma
        const mpClient = new MercadoPagoConfig({ accessToken: config.accessToken });
        const preference = new Preference(mpClient);
        
        // Obtener info de comisión para metadata
        const marketplaceInfo = await getMarketPlaceInfo(ticketType.event.user_id);
        const coupon = await resolveValidCoupon(input.couponId, input.couponCode, ticketType.event.id);
        const body = buildPreferenceBody(
            purchasePayer.payer,
            purchasePayer.user.id,
            ticketType,
            quantity,
            marketplaceInfo,
            input.promoterCode,
            coupon
        );
        const pricing = calculatePricing(Number(ticketType.price), quantity, coupon);
        const externalReference = buildExternalReference(
            purchasePayer.user.id,
            ticketType,
            quantity,
            input.promoterCode
        );
        
        // Sin marketplace_fee al usar token de plataforma
        delete body.marketplace_fee;
        
        const result = await preference.create({ body });
        
        if (!result.id || !result.init_point) {
            throw new Error('MercadoPago did not return preference ID or init_point');
        }
        
        logger.info('PLATFORM_PREFERENCE_CREATED', {
            preferenceId: result.id,
            userId: purchasePayer.user.id,
            organizerId: ticketType.event.user_id
        });
        
        return {
            id: result.id!,
            initPoint: result.init_point!,
            pricing,
            externalReference,
            buyerEmail: purchasePayer.payer.email,
            guestCheckout: purchasePayer.guestCheckout
        };
        
    } finally {
        await queryRunner.release();
    }
}
