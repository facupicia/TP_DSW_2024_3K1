import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import AppDataSource from '../db';
import { OutboxJob } from './outbox.entity';
import { QueueJobData } from './queue.types';
import { logger } from '../common/services/logger';

export async function enqueueOutbox(manager: EntityManager, key: string, kind: string, payload: Record<string, any>) {
    await manager.createQueryBuilder().insert().into(OutboxJob).values({ key, kind, payload }).orIgnore().execute();
}

export async function enqueueEmail(manager: EntityManager, key: string, job: QueueJobData) {
    await enqueueOutbox(manager, key, 'email', job);
}

let timer: ReturnType<typeof setInterval> | null = null;
let running: Promise<void> | null = null;
let stopping = false;

async function dispatch(kind: string, payload: any) {
    if (kind === 'email') {
        const { deliverEmailJob } = await import('./email.queue');
        await deliverEmailJob(payload);
    } else if (kind === 'refund') {
        const { executeRefund } = await import('../payment/refund.service');
        await executeRefund(payload.refundRequestId);
    } else if (kind === 'subscription-cancel') {
        const { cancelSupersededRenewal } = await import('../subscription/subscription.core');
        await cancelSupersededRenewal(payload.externalSubscriptionId);
    } else if (kind === 'subscription') {
        const { processSubscriptionWebhook } = await import('../subscription/subscription.core');
        await processSubscriptionWebhook(payload.type, payload.dataId);
    } else if (kind === 'payment') {
        const { resolveWebhookPayment, processApprovedPayment } = await import('../payment/payment.core');
        const lookup = await resolveWebhookPayment(payload.paymentId, { external_reference: payload.externalReference, mpUserId:payload.mpUserId } as any);
        if (!lookup) throw new Error('Payment lookup unavailable');
        if (lookup.payment.status === 'approved') await processApprovedPayment(payload.paymentId, lookup.payment);
        else if (['rejected','cancelled'].includes(lookup.payment.status)) {
            const {CheckoutOrder}=await import('../payment/checkout-order.entity');
            if (lookup.payment.external_reference) await AppDataSource.getRepository(CheckoutOrder).update({externalReference:lookup.payment.external_reference,status:'pending'},{status:'failure'});
        } else if (['refunded', 'charged_back'].includes(lookup.payment.status)) {
            const { reconcilePaymentReversal } = await import('../payment/refund.service');
            await reconcilePaymentReversal(payload.paymentId, lookup.payment.status as 'refunded' | 'charged_back', lookup.payment.external_reference);
        } else throw new Error('Payment approval pending');
    } else throw new Error('Unknown outbox kind');
}

export async function drainOutbox(): Promise<void> {
    const owner = randomUUID();
    // One short atomic claim; different processes never claim the same available row.
    const [jobs] = await AppDataSource.query(`UPDATE outbox_job SET owner=$1, "lockedUntil"=NOW()+INTERVAL '2 minutes'
        WHERE id IN (SELECT id FROM outbox_job WHERE "processedAt" IS NULL AND "availableAt"<=NOW()
        AND ("lockedUntil" IS NULL OR "lockedUntil"<NOW()) ORDER BY "availableAt" LIMIT 3 FOR UPDATE SKIP LOCKED)
        RETURNING id, kind, payload, attempts`, [owner]);
    // Keep this batch active until every handler finishes, even if recording a
    // retry fails. Otherwise the timer could start a batch while siblings run.
    const results = await Promise.allSettled(jobs.map(async job => {
        const heartbeat = setInterval(() => {
            AppDataSource.query(`UPDATE outbox_job SET "lockedUntil"=NOW()+INTERVAL '2 minutes' WHERE id=$1 AND owner=$2`, [job.id, owner])
                .catch(error => logger.error('OUTBOX_LEASE_ERROR', { error: error.message }));
        }, 20000);
        try {
            await dispatch(job.kind, job.payload);
            await AppDataSource.query(`UPDATE outbox_job SET "processedAt"=NOW(), "lockedUntil"=NULL, owner=NULL, "lastError"=NULL, payload='{}'::jsonb WHERE id=$1 AND owner=$2`, [job.id, owner]);
        } catch (error) {
            const attempts = job.attempts + 1;
            const delay = Math.min(3600, 5 * 2 ** Math.min(attempts, 10));
            await AppDataSource.query(`UPDATE outbox_job SET attempts=$3, "availableAt"=NOW()+($4 * INTERVAL '1 second'),
                "lockedUntil"=NULL, owner=NULL, "lastError"=$5 WHERE id=$1 AND owner=$2`,
                [job.id, owner, attempts, delay, String((error as Error).message).slice(0, 1000)]);
            logger.error('OUTBOX_RETRY', { id: job.id, kind: job.kind, attempts });
        } finally { clearInterval(heartbeat); }
    }));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;
}

export function startOutboxWorker() {
    if (timer) return;
    stopping = false;
    const tick = () => {
        if (running || stopping) return;
        running = drainOutbox().catch(error => logger.error('OUTBOX_ERROR', { error: error.message })).finally(() => { running = null; });
    };
    tick();
    timer = setInterval(tick, 1000);
}

export async function closeOutboxWorker() {
    stopping = true;
    if (timer) clearInterval(timer);
    timer = null;
    await running;
}
