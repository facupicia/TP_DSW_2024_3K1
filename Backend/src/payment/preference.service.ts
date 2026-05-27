import { MercadoPagoConfig, Preference } from 'mercadopago';
import bcrypt from 'bcrypt';
import { In } from 'typeorm';
import AppDataSource from '../db';
import { User } from '../user/user.entity';
import { TicketType, TicketTypeStatus } from '../ticketType/ticketType.entity';
import { getActiveSubscription } from '../subscription/subscription.service';
import { refreshOrganizerToken } from './mp-oauth.controller';
import { logger } from '../common/services/logger';
import { getMPConfig, sanitizeUrl } from './mp.config';
import { Coupon } from '../coupon/coupon.entity';
import { EventProduct } from '../extra/eventProduct.entity';
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

export interface CartItem {
    ticketTypeId: number;
    quantity: number;
}

export interface ExtraCartItem {
    eventProductId: number;
    quantity: number;
}

export interface PreferenceInput {
    userId?: number;
    items: CartItem[];
    extraItems?: ExtraCartItem[];
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
    serviceFeePercent: number;
    serviceFeeAmount: number;
    buyerTotalAmount: number;
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
    serviceFeePercent: number;
    minimumServiceFee: number;
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
    const { userId, items, extraItems, guestBuyer } = input;

    if (!Array.isArray(items) || items.length === 0) {
        return {
            valid: false,
            error: 'Debes seleccionar al menos un ticket.',
            code: 'EMPTY_CART',
            statusCode: 400
        };
    }

    if (items.some(i => !Number.isInteger(i.quantity) || i.quantity <= 0 || i.quantity > 10)) {
        return {
            valid: false,
            error: 'Cantidad inválida en uno o más tickets.',
            code: 'INVALID_QUANTITY',
            statusCode: 400
        };
    }

    // Detectar duplicados en tickets
    const uniqueTicketIds = new Set(items.map(i => i.ticketTypeId));
    if (uniqueTicketIds.size !== items.length) {
        return {
            valid: false,
            error: 'No puedes agregar el mismo tipo de ticket más de una vez.',
            code: 'DUPLICATE_TICKET_TYPE',
            statusCode: 400
        };
    }

    // Validar extras si existen
    if (extraItems && extraItems.length > 0) {
        if (extraItems.some(i => !Number.isInteger(i.quantity) || i.quantity <= 0 || i.quantity > 10)) {
            return {
                valid: false,
                error: 'Cantidad inválida en uno o más extras.',
                code: 'INVALID_EXTRA_QUANTITY',
                statusCode: 400
            };
        }
        const uniqueExtraIds = new Set(extraItems.map(i => i.eventProductId));
        if (uniqueExtraIds.size !== extraItems.length) {
            return {
                valid: false,
                error: 'No puedes agregar el mismo extra más de una vez.',
                code: 'DUPLICATE_EXTRA',
                statusCode: 400
            };
        }
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
        const userRepo = queryRunner.manager.getRepository(User);
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        const eventProductRepo = queryRunner.manager.getRepository(EventProduct);

        const ticketTypeIds = items.map(i => i.ticketTypeId);
        const ticketTypes = await ticketTypeRepo.find({
            where: { id: In(ticketTypeIds) },
            relations: ['event', 'event.user']
        });

        if (ticketTypes.length !== ticketTypeIds.length) {
            return {
                valid: false,
                error: 'Uno o más tipos de ticket no existen.',
                code: 'NOT_FOUND',
                statusCode: 404
            };
        }

        const eventId = ticketTypes[0].event.id;
        if (ticketTypes.some(tt => tt.event.id !== eventId)) {
            return {
                valid: false,
                error: 'Todos los tickets deben ser del mismo evento.',
                code: 'MULTIPLE_EVENTS',
                statusCode: 400
            };
        }

        let extras: EventProduct[] = [];
        if (extraItems && extraItems.length > 0) {
            const extraIds = extraItems.map(i => i.eventProductId);
            extras = await eventProductRepo.find({
                where: { id: In(extraIds) },
                relations: ['event', 'product']
            });

            if (extras.length !== extraIds.length) {
                return {
                    valid: false,
                    error: 'Uno o más extras no existen.',
                    code: 'EXTRA_NOT_FOUND',
                    statusCode: 404
                };
            }

            if (extras.some(ep => ep.event.id !== eventId)) {
                return {
                    valid: false,
                    error: 'Todos los extras deben ser del mismo evento que los tickets.',
                    code: 'MULTIPLE_EVENTS',
                    statusCode: 400
                };
            }

            for (const ep of extras) {
                if (!ep.isActive) {
                    return {
                        valid: false,
                        error: `El extra "${ep.product.name}" no está disponible en este evento.`,
                        code: 'EXTRA_INACTIVE',
                        statusCode: 400
                    };
                }
                const extraItem = extraItems.find(i => i.eventProductId === ep.id)!;
                if (extraItem.quantity > ep.maxPerOrder) {
                    return {
                        valid: false,
                        error: `Máximo ${ep.maxPerOrder} unidad(es) por orden para "${ep.product.name}".`,
                        code: 'EXTRA_MAX_PER_ORDER',
                        statusCode: 400
                    };
                }
                if (ep.hasStock) {
                    const availableStock = ep.stock - ep.soldCount;
                    if (availableStock < extraItem.quantity) {
                        return {
                            valid: false,
                            error: `Sin stock para "${ep.product.name}". Quedan: ${availableStock}`,
                            code: 'NO_EXTRA_STOCK',
                            statusCode: 409
                        };
                    }
                }
            }
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

        const event = ticketTypes[0].event;
        const eventDateTime = new Date(`${event.date}T${event.time}`);
        if (new Date() > eventDateTime) {
            return {
                valid: false,
                error: 'Las ventas han cerrado. El evento ya comenzó.',
                code: 'EVENT_STARTED',
                statusCode: 400
            };
        }

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

        for (const tt of ticketTypes) {
            if (tt.status !== TicketTypeStatus.ACTIVE) {
                return {
                    valid: false,
                    error: `El tipo de ticket "${tt.name}" no está disponible`,
                    code: 'TICKET_TYPE_INACTIVE',
                    statusCode: 400
                };
            }
            const item = items.find(i => i.ticketTypeId === tt.id)!;
            const availableStock = tt.capacity - tt.soldCount;
            if (availableStock < item.quantity) {
                return {
                    valid: false,
                    error: `Sin stock para "${tt.name}". Quedan: ${availableStock}`,
                    code: 'NO_STOCK',
                    statusCode: 409
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
        serviceFeePercent: 15.00,
        minimumServiceFee: 0,
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
        const serviceFeePercent = Number(subscription.plan.serviceFeePercent);
        const minimumServiceFee = Number(subscription.plan.minimumServiceFee);
        
        return {
            commissionPercent,
            serviceFeePercent: Number.isFinite(serviceFeePercent) ? serviceFeePercent : defaultInfo.serviceFeePercent,
            minimumServiceFee: Number.isFinite(minimumServiceFee) ? minimumServiceFee : defaultInfo.minimumServiceFee,
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

async function resolvePurchasePayer(_queryRunner: any, input: PreferenceInput): Promise<PurchasePayer> {
    const userRepo = AppDataSource.getRepository(User);

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

function buildExternalReference(userId: number, organizerId: number, promoterCode?: string): string {
    const promoterCodeStr = promoterCode ? `|${promoterCode}` : '';
    return `${userId}|${organizerId}${promoterCodeStr}`;
}

function calculateServiceFee(totalAmount: number, serviceFeePercent: number, minimumServiceFee: number): number {
    if (totalAmount <= 0 || serviceFeePercent <= 0) {
        return 0;
    }

    const percentFee = Math.ceil((totalAmount * serviceFeePercent) / 100);
    return Math.max(percentFee, Math.ceil(minimumServiceFee || 0));
}

function calculatePricing(
    ticketTypes: TicketType[],
    items: CartItem[],
    extras: EventProduct[],
    extraItems: ExtraCartItem[],
    coupon?: Coupon | null,
    serviceFeePercent = 0,
    minimumServiceFee = 0
): PreferencePricing {
    let ticketBaseAmount = 0;
    for (const item of items) {
        const tt = ticketTypes.find(t => t.id === item.ticketTypeId)!;
        ticketBaseAmount += Number(tt.price) * item.quantity;
    }

    let extraBaseAmount = 0;
    for (const item of extraItems) {
        const ep = extras.find(e => e.id === item.eventProductId)!;
        extraBaseAmount += Number(ep.eventPrice) * item.quantity;
    }

    const baseAmount = ticketBaseAmount + extraBaseAmount;

    const discountPercent = coupon?.discountPercent || 0;
    const discountAmount = discountPercent > 0
        ? Math.min(ticketBaseAmount, Math.round((ticketBaseAmount * discountPercent) / 100))
        : 0;
    const ticketNetAmount = Math.max(ticketBaseAmount - discountAmount, 0);
    const totalAmount = ticketNetAmount + extraBaseAmount;
    const rawServiceFeeAmount = calculateServiceFee(ticketNetAmount, serviceFeePercent, minimumServiceFee);
    const buyerTotalAmount = Number((totalAmount + rawServiceFeeAmount).toFixed(2));
    const serviceFeeAmount = Number((buyerTotalAmount - totalAmount).toFixed(2));

    return {
        baseAmount,
        discountAmount,
        totalAmount,
        serviceFeePercent,
        serviceFeeAmount,
        buyerTotalAmount,
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
    ticketTypes: TicketType[],
    items: CartItem[],
    extras: EventProduct[],
    extraItems: ExtraCartItem[],
    marketplaceInfo: MarketPlaceInfo,
    promoterCode?: string,
    coupon?: Coupon | null
): any {
    const config = getMPConfig();

    const pricing = calculatePricing(
        ticketTypes,
        items,
        extras,
        extraItems,
        coupon,
        marketplaceInfo.serviceFeePercent,
        marketplaceInfo.minimumServiceFee
    );

    const commissionPercent = marketplaceInfo.commissionPercent;
    const commissionAmount = Math.ceil((pricing.totalAmount * commissionPercent) / 100);

    const clientUrl = sanitizeUrl(config.clientUrl);
    const notificationUrl = sanitizeUrl(config.notificationUrl);

    const externalRef = buildExternalReference(userId, ticketTypes[0].event.user_id, promoterCode);

    const mpItems = items.map(item => {
        const tt = ticketTypes.find(t => t.id === item.ticketTypeId)!;
        const itemTotal = Number(tt.price) * item.quantity;
        const ticketBase = pricing.baseAmount - (extras.length > 0
            ? extraItems.reduce((sum, ei) => sum + (extras.find(e => e.id === ei.eventProductId)?.eventPrice || 0) * ei.quantity, 0)
            : 0);
        const itemShareOfDiscount = pricing.discountAmount > 0 && ticketBase > 0
            ? Math.round((itemTotal / ticketBase) * pricing.discountAmount)
            : 0;
        const itemNet = Math.max(itemTotal - itemShareOfDiscount, 0);
        const itemUnitPrice = item.quantity > 0 ? Number((itemNet / item.quantity).toFixed(2)) : 0;

        return {
            id: `tt_${tt.id}`,
            title: `${tt.event.title} - ${tt.name}`.substring(0, 255),
            description: `Entrada para ${tt.event.title}`,
            quantity: item.quantity,
            unit_price: itemUnitPrice,
            currency_id: 'ARS',
        };
    });

    const mpExtraItems = extraItems.map(item => {
        const ep = extras.find(e => e.id === item.eventProductId)!;
        return {
            id: `ep_${ep.id}`,
            title: `${ep.event.title} - ${ep.product.name}`.substring(0, 255),
            description: `Extra para ${ep.event.title}`,
            quantity: item.quantity,
            unit_price: Number(ep.eventPrice),
            currency_id: 'ARS',
        };
    });

    const metadataItems = [
        ...items.map(i => ({ type: 'ticket' as const, referenceId: i.ticketTypeId, quantity: i.quantity })),
        ...extraItems.map(i => ({ type: 'extra' as const, referenceId: i.eventProductId, quantity: i.quantity }))
    ];

    const mpItemsWithFee = [...mpItems, ...mpExtraItems];
    if (pricing.serviceFeeAmount > 0) {
        mpItemsWithFee.push({
            id: 'service_fee',
            title: 'Cargo de servicio',
            description: `Cargo de servicio (${pricing.serviceFeePercent}%)`,
            quantity: 1,
            unit_price: pricing.serviceFeeAmount,
            currency_id: 'ARS',
        });
    }

    const body: any = {
        items: mpItemsWithFee,
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
        auto_return: clientUrl.startsWith('https') ? 'approved' : undefined,
        notification_url: notificationUrl || undefined,
        external_reference: externalRef,

        marketplace_fee: commissionAmount,

        metadata: {
            user_id: Number(userId),
            event_id: Number(ticketTypes[0].event.id),
            organizer_id: ticketTypes[0].event.user_id,
            organizer_plan: marketplaceInfo.planName,
            base_amount: pricing.baseAmount,
            discount_amount: pricing.discountAmount,
            total_amount: pricing.totalAmount,
            service_fee_percent: pricing.serviceFeePercent,
            service_fee_amount: pricing.serviceFeeAmount,
            buyer_total_amount: pricing.buyerTotalAmount,
            commission_percent: commissionPercent,
            commission_amount: commissionAmount,
            payment_model: 'marketplace',
            promoter_code: promoterCode || null,
            coupon_id: pricing.couponId || null,
            coupon_discount_percent: pricing.discountPercent || null,
            items: JSON.stringify(metadataItems)
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
interface PreparedPreference {
    purchasePayer: PurchasePayer;
    ticketTypes: TicketType[];
    extras: EventProduct[];
    extraItems: ExtraCartItem[];
    pricing: PreferencePricing;
    body: any;
    externalReference: string;
    marketplaceInfo: MarketPlaceInfo;
    coupon: Coupon | null;
}

async function preparePreference(
    input: PreferenceInput,
    options: { requireOrganizerToken: boolean }
): Promise<PreparedPreference> {
    const { items, extraItems = [] } = input;

    const purchasePayer = await resolvePurchasePayer(null, input);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        const eventProductRepo = queryRunner.manager.getRepository(EventProduct);

        const ticketTypeIds = items.map(i => i.ticketTypeId).sort((a, b) => a - b);
        const ticketTypes = await ticketTypeRepo
            .createQueryBuilder('ticketType')
            .innerJoinAndSelect('ticketType.event', 'event')
            .where('ticketType.id IN (:...ids)', { ids: ticketTypeIds })
            .setLock('pessimistic_write')
            .getMany();

        if (ticketTypes.length !== ticketTypeIds.length) {
            throw new Error('TICKET_TYPE_NOT_FOUND');
        }

        for (const tt of ticketTypes) {
            if (tt.status !== TicketTypeStatus.ACTIVE) {
                throw new Error('TICKET_TYPE_INACTIVE');
            }
            const item = items.find(i => i.ticketTypeId === tt.id)!;
            const availableStock = tt.capacity - tt.soldCount;
            if (availableStock < item.quantity) {
                throw new Error('NO_STOCK');
            }
        }

        const eventId = ticketTypes[0].event.id;
        if (ticketTypes.some(tt => tt.event.id !== eventId)) {
            throw new Error('MULTIPLE_EVENTS');
        }

        let extras: EventProduct[] = [];
        if (extraItems.length > 0) {
            const extraIds = extraItems.map(i => i.eventProductId).sort((a, b) => a - b);
            extras = await eventProductRepo
                .createQueryBuilder('eventProduct')
                .innerJoinAndSelect('eventProduct.event', 'event')
                .innerJoinAndSelect('eventProduct.product', 'product')
                .where('eventProduct.id IN (:...ids)', { ids: extraIds })
                .setLock('pessimistic_write')
                .getMany();

            if (extras.length !== extraIds.length) {
                throw new Error('EXTRA_NOT_FOUND');
            }

            for (const ep of extras) {
                if (!ep.isActive) {
                    throw new Error('EXTRA_INACTIVE');
                }
                if (ep.event.id !== eventId) {
                    throw new Error('MULTIPLE_EVENTS');
                }
                const item = extraItems.find(i => i.eventProductId === ep.id)!;
                if (item.quantity > ep.maxPerOrder) {
                    throw new Error('EXTRA_MAX_PER_ORDER');
                }
                if (ep.hasStock) {
                    const availableStock = ep.stock - ep.soldCount;
                    if (availableStock < item.quantity) {
                        throw new Error('NO_EXTRA_STOCK');
                    }
                }
            }
        }

        const eventDateTime = new Date(`${ticketTypes[0].event.date}T${ticketTypes[0].event.time}`);
        if (new Date() > eventDateTime) {
            throw new Error('EVENT_STARTED');
        }

        const marketplaceInfo = await getMarketPlaceInfo(ticketTypes[0].event.user_id);

        if (options.requireOrganizerToken && !marketplaceInfo.organizerAccessToken) {
            logger.error('MARKETPLACE_NO_ORGANIZER_TOKEN', {
                organizerId: ticketTypes[0].event.user_id,
                eventId: ticketTypes[0].event.id
            });
            throw new Error('ORGANIZER_MP_NOT_LINKED');
        }

        const coupon = await resolveValidCoupon(input.couponId, input.couponCode, ticketTypes[0].event.id);
        const pricing = calculatePricing(
            ticketTypes,
            items,
            extras,
            extraItems,
            coupon,
            marketplaceInfo.serviceFeePercent,
            marketplaceInfo.minimumServiceFee
        );

        if (pricing.totalAmount <= 0) {
            throw new Error('ZERO_AMOUNT_NOT_SUPPORTED');
        }

        const body = buildPreferenceBody(
            purchasePayer.payer,
            purchasePayer.user.id,
            ticketTypes,
            items,
            extras,
            extraItems,
            marketplaceInfo,
            input.promoterCode,
            coupon
        );
        const externalReference = buildExternalReference(
            purchasePayer.user.id,
            ticketTypes[0].event.user_id,
            input.promoterCode
        );

        await queryRunner.commitTransaction();

        return {
            purchasePayer,
            ticketTypes,
            extras,
            extraItems,
            pricing,
            body,
            externalReference,
            marketplaceInfo,
            coupon
        };
    } catch (error) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        throw error;
    } finally {
        await queryRunner.release();
    }
}

export async function createMercadoPagoPreference(
    input: PreferenceInput
): Promise<PreferenceResult> {
    const prepared = await preparePreference(input, { requireOrganizerToken: true });
    const { purchasePayer, ticketTypes, extras, extraItems, pricing, body, externalReference, marketplaceInfo } = prepared;

    const mpClient = new MercadoPagoConfig({
        accessToken: marketplaceInfo.organizerAccessToken!
    });

    const preference = new Preference(mpClient);

    logger.info('PREFERENCE_CREATING', {
        userId: purchasePayer.user.id,
        items: input.items,
        extraItems: input.extraItems,
        organizerId: ticketTypes[0].event.user_id,
        marketplaceFee: body.marketplace_fee,
        promoterCode: input.promoterCode,
        guestCheckout: purchasePayer.guestCheckout
    });

    const result = await preference.create({ body });

    if (!result.id || !result.init_point) {
        throw new Error('MercadoPago did not return preference ID or init_point');
    }

    logger.info('PREFERENCE_CREATED', {
        preferenceId: result.id,
        userId: purchasePayer.user.id,
        organizerId: ticketTypes[0].event.user_id
    });

    return {
        id: result.id!,
        initPoint: result.init_point!,
        pricing,
        externalReference,
        buyerEmail: purchasePayer.payer.email,
        guestCheckout: purchasePayer.guestCheckout
    };
}

/**
 * Crea una preferencia usando el token de la PLATAFORMA
 * Útil como fallback si el organizador no tiene MP vinculado
 */
export async function createPlatformPreference(
    input: PreferenceInput
): Promise<PreferenceResult> {
    const prepared = await preparePreference(input, { requireOrganizerToken: false });
    const { purchasePayer, ticketTypes, extras, extraItems, pricing, body, externalReference } = prepared;

    const config = getMPConfig();

    delete body.marketplace_fee;

    const mpClient = new MercadoPagoConfig({ accessToken: config.accessToken });
    const preference = new Preference(mpClient);

    const result = await preference.create({ body });

    if (!result.id || !result.init_point) {
        throw new Error('MercadoPago did not return preference ID or init_point');
    }

    logger.info('PLATFORM_PREFERENCE_CREATED', {
        preferenceId: result.id,
        userId: purchasePayer.user.id,
        organizerId: ticketTypes[0].event.user_id
    });

    return {
        id: result.id!,
        initPoint: result.init_point!,
        pricing,
        externalReference,
        buyerEmail: purchasePayer.payer.email,
        guestCheckout: purchasePayer.guestCheckout
    };
}
