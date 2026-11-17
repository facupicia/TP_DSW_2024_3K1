import { EntityManager } from 'typeorm';
import AppDataSource from '../db';
import { PaymentLog, PaymentStatus } from './payment.entity';
import { CheckoutOrder } from './checkout-order.entity';
import { RefundRequest } from './refund-request.entity';
import { Ticket, TicketStatus } from '../ticket/ticket.entity';
import { ExtraItem, ExtraItemStatus } from '../extra/extraItem.entity';
import { enqueueOutbox } from '../queue/outbox.service';
import { refreshOrganizerToken } from './mp-oauth.controller';
import { getMPConfig } from './mp.config';

export interface RefundResult { success: boolean; pending?: boolean; refundId?: string; amountRefunded?: number; message: string; }

// Caller holds the payment lock. Commit local cancellation BEFORE contacting MP.
export async function stageRefund(manager: EntityManager, log: PaymentLog, reason: string, requestedBy?: number, compensation = false) {
    let request = await manager.findOne(RefundRequest, { where: { paymentLogId: log.id } });
    if (request) return request;
    if (!compensation) {
        const tickets = await manager.getRepository(Ticket).createQueryBuilder('t').where('t.paymentLogId=:id', { id: log.id }).setLock('pessimistic_write').getMany();
        const extras = await manager.getRepository(ExtraItem).createQueryBuilder('e').where('e.paymentLogId=:id', { id: log.id }).setLock('pessimistic_write').getMany();
        if (!tickets.length && !extras.length) throw new Error('REFUND_LINK_REQUIRED');
        if (tickets.some(t => t.status === TicketStatus.USED) || extras.some(e => e.status === ExtraItemStatus.USED)) throw new Error('REFUND_ALREADY_USED');
        const [cancelled] = await manager.query(`UPDATE ticket SET status='cancelled' WHERE "paymentLogId"=$1 AND status='active' RETURNING "ticketTypeId"`, [log.id]);
        const [cancelledExtras] = await manager.query(`UPDATE extra_item SET status='cancelled' WHERE "paymentLogId"=$1 AND status='active' RETURNING "eventProductId", quantity`, [log.id]);
        const counts = new Map<number, number>();
        for (const row of cancelled) counts.set(row.ticketTypeId, (counts.get(row.ticketTypeId) || 0) + 1);
        for (const [id, count] of [...counts].sort((a,b) => a[0]-b[0])) await manager.query(`UPDATE ticket_type SET "soldCount"=GREATEST("soldCount"-$2,0) WHERE id=$1`, [id, count]);
        counts.clear();
        for (const row of cancelledExtras) counts.set(row.eventProductId, (counts.get(row.eventProductId) || 0) + row.quantity);
        for (const [id, count] of [...counts].sort((a,b) => a[0]-b[0])) await manager.query(`UPDATE event_product SET "soldCount"=GREATEST("soldCount"-$2,0) WHERE id=$1`, [id, count]);
    }
    request = manager.create(RefundRequest, { paymentLogId: log.id, amount: Number(log.buyerTotalAmount || log.totalAmount), reason, requestedBy: requestedBy || null });
    await manager.save(request);
    await enqueueOutbox(manager, `refund-${log.id}`, 'refund', { refundRequestId: request.id });
    return request;
}

export async function processRefund(paymentId: string, options: { amount?: number; reason?: string; requestedBy: number; requesterRoles?: string[] }): Promise<RefundResult> {
    try {
        return await AppDataSource.transaction(async manager => {
            const log = await manager.findOne(PaymentLog, { where: { mpPaymentId: paymentId }, lock: { mode: 'pessimistic_write' } });
            if (!log || (!options.requesterRoles?.includes('admin') && log.organizerId !== options.requestedBy)) return { success: false, message: 'Pago no encontrado o no autorizado' };
            if (log.status === PaymentStatus.REFUNDED) return { success: true, message: 'El pago ya fue reembolsado' };
            if (log.status !== PaymentStatus.COMPLETED) return { success: false, message: 'Solo se pueden reembolsar pagos completados' };
            const total = Number(log.buyerTotalAmount || log.totalAmount);
            if (options.amount !== undefined && (!Number.isFinite(Number(options.amount)) || Math.abs(Number(options.amount)-total)>0.01)) return { success: false, message: 'Solo se admite la devolución total, incluido el cargo de servicio' };
            const request = await stageRefund(manager, log, String(options.reason || '').slice(0, 500), options.requestedBy);
            return { success: request.status !== 'failed', pending: request.status === 'pending', refundId: request.refundId || undefined,
                message: request.status === 'pending' ? 'Devolución solicitada; confirmación de MercadoPago pendiente.' : request.status === 'failed' ? 'Devolución rechazada; requiere revisión administrativa.' : 'Devolución confirmada' };
        });
    } catch (error) {
        if (['REFUND_LINK_REQUIRED','REFUND_ALREADY_USED'].includes((error as Error).message)) return { success: false, message: 'La compra requiere revisión: vínculo al pago incompleto o entradas utilizadas' };
        throw error;
    }
}

export async function executeRefund(requestId: string): Promise<void> {
    const repo = AppDataSource.getRepository(RefundRequest);
    const request = await repo.findOneByOrFail({ id: requestId });
    if (request.status !== 'pending') return;
    const log = await AppDataSource.getRepository(PaymentLog).findOneByOrFail({ id: request.paymentLogId });
    const order = log.externalReference ? await AppDataSource.getRepository(CheckoutOrder).findOneBy({externalReference:log.externalReference}) : null;
    const token = order?.snapshot.paymentAccount === 'platform' || !log.organizerId ? getMPConfig().accessToken : await refreshOrganizerToken(log.organizerId);
    if (!token) throw new Error('Refund credentials unavailable');
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(log.mpPaymentId)}/refunds`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': request.id },
        body: '{}', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 1000);
        if (response.status >= 500 || [408,409,429,401].includes(response.status)) throw new Error(`Refund provider temporary error (${response.status})`);
        await repo.update(request.id, { status: 'failed', lastError: detail });
        return;
    }
    const result = await response.json() as { id?: string | number; amount?: number; status?: string };
    if (!result.id || ['rejected','pending'].includes(result.status) || !Number.isFinite(Number(result.amount)) || Math.abs(Number(result.amount)-Number(request.amount))>0.01) throw new Error('Refund confirmation incomplete');
    await AppDataSource.transaction(async manager => {
        await manager.update(RefundRequest, request.id, { status: 'confirmed', refundId: String(result.id), lastError: null });
        await manager.update(PaymentLog, log.id, { status: PaymentStatus.REFUNDED, refundedAt: new Date(), refundedBy: request.requestedBy,
            refundReason: request.reason, refundAmount: request.amount });
        if (order && (order.snapshot.fulfilledPaymentId === log.mpPaymentId ||
            (!order.snapshot.fulfilledPaymentId && log.status === PaymentStatus.COMPLETED))) {
            await manager.update(CheckoutOrder, order.externalReference, { status: 'refunded' });
        }
    });
}

export async function getRefundStatus(paymentId: string, requestedBy?: number, roles: string[] = []) {
    const log = await AppDataSource.getRepository(PaymentLog).findOneBy({ mpPaymentId: paymentId });
    if (!log || (!roles.includes('admin') && log.organizerId !== requestedBy)) return { canRefund: false, alreadyRefunded: false, message: 'Pago no encontrado o no autorizado' };
    const request = await AppDataSource.getRepository(RefundRequest).findOneBy({ paymentLogId: log.id });
    return { canRefund: log.status === PaymentStatus.COMPLETED && !request, alreadyRefunded: log.status === PaymentStatus.REFUNDED,
        pending: request?.status === 'pending', refundStatus: request?.status, refundAmount: log.refundAmount,
        maxRefundAmount: Number(log.buyerTotalAmount || log.totalAmount), message: request ? `Devolución: ${request.status}` : 'Estado consultado' };
}
