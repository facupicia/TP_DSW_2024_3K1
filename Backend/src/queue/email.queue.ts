import { Queue, Worker, Job } from "bullmq";
import { getBullMQConnection } from "./queue.config";
import { logger } from "../common/services/logger";
import AppDataSource from "../db";
import { Ticket } from "../ticket/ticket.entity";
import { TicketType } from "../ticketType/ticketType.entity";
import { Event } from "../event/event.entity";
import { ExtraItem } from "../extra/extraItem.entity";
import enviarCorreoConQR, {
    enviarCorreoConExtras,
    sendAccountClaimEmail,
    ITicketQR,
    IExtraVoucher,
} from "../common/services/mailer";
import {
    SendTicketEmailJobData,
    SendExtraEmailJobData,
    SendGuestInvitationEmailJobData,
    SendAccountClaimEmailJobData,
    QueueJobData,
} from "./queue.types";

const QUEUE_NAME = "email-jobs";

let emailQueue: Queue | null = null;
let emailWorker: Worker | null = null;

export function getEmailQueue(): Queue {
    if (!emailQueue) {
        emailQueue = new Queue(QUEUE_NAME, {
            connection: getBullMQConnection(),
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000,
                },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
            },
        });
    }
    return emailQueue;
}

// ============================================================================
// JOB ADDERS
// ============================================================================

export async function addSendTicketEmailJob(data: SendTicketEmailJobData) {
    const queue = getEmailQueue();
    const jobData: QueueJobData = { type: "send-ticket-email", payload: data };
    const job = await queue.add("send-ticket-email", jobData, {
        jobId: `ticket-email-${data.paymentLogId || data.ticketIds.join("-")}`,
    });
    logger.info("QUEUE_TICKET_EMAIL_ENQUEUED", { jobId: job.id, userId: data.userId });
    return job;
}

export async function addSendExtraEmailJob(data: SendExtraEmailJobData) {
    const queue = getEmailQueue();
    const jobData: QueueJobData = { type: "send-extra-email", payload: data };
    const job = await queue.add("send-extra-email", jobData, {
        jobId: `extra-email-${data.paymentLogId || data.extraItemIds.join("-")}`,
    });
    logger.info("QUEUE_EXTRA_EMAIL_ENQUEUED", { jobId: job.id, userId: data.userId });
    return job;
}

export async function addSendGuestInvitationJob(data: SendGuestInvitationEmailJobData) {
    const queue = getEmailQueue();
    const jobData: QueueJobData = { type: "send-guest-invitation", payload: data };
    const job = await queue.add("send-guest-invitation", jobData, {
        jobId: `guest-invite-${data.email}-${data.ticketIds.join("-")}`,
    });
    logger.info("QUEUE_GUEST_INVITE_ENQUEUED", { jobId: job.id, email: data.email });
    return job;
}

export async function addSendAccountClaimJob(data: SendAccountClaimEmailJobData) {
    const queue = getEmailQueue();
    const jobData: QueueJobData = { type: "send-account-claim", payload: data };
    const job = await queue.add("send-account-claim", jobData, {
        jobId: `account-claim-${data.userEmail}`,
    });
    logger.info("QUEUE_ACCOUNT_CLAIM_ENQUEUED", { jobId: job.id, email: data.userEmail });
    return job;
}

// ============================================================================
// WORKER PROCESSOR
// ============================================================================

async function processSendTicketEmail(job: Job) {
    const payload = job.data.payload as SendTicketEmailJobData;

    if (!AppDataSource.isInitialized) {
        throw new Error("Database not initialized");
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    let tickets = await ticketRepo.find({
        where: { id: payload.ticketIds } as any,
        relations: ["ticketType", "ticketType.event"],
    });

    // Fallback: buscar por paymentLogId + userId si no se encuentran por ID directo
    if (tickets.length === 0 && payload.paymentLogId) {
        tickets = await ticketRepo.find({
            where: { paymentLogId: payload.paymentLogId, userId: payload.userId },
            relations: ["ticketType", "ticketType.event"],
            take: payload.ticketIds.length || 10,
        });
    }

    if (tickets.length === 0) {
        throw new Error(`No tickets found for job ${job.id}`);
    }

    const event = tickets[0].ticketType?.event;
    const ticketType = tickets[0].ticketType;

    if (!event || !ticketType) {
        throw new Error(`Missing event or ticketType for job ${job.id}`);
    }

    const dateValue = event.date instanceof Date ? event.date : new Date(event.date);
    const formattedDate = !isNaN(dateValue.getTime())
        ? dateValue.toLocaleDateString("es-AR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
          })
        : String(event.date);

    const buyerName = `${payload.userFirstname || ""} ${payload.userLastname || ""}`.trim();

    const emailData: ITicketQR[] = tickets.map((t) => ({
        qrCode: t.qrCode!,
        ticketId: t.id,
        eventTitle: event.title,
        eventDate: `${formattedDate} ${event.time}`,
        eventLocation: event.direccion || "",
        buyerName,
        ticketType: ticketType.name,
    }));

    await enviarCorreoConQR(payload.userEmail, emailData);
    logger.info("QUEUE_TICKET_EMAIL_SENT", { jobId: job.id, ticketsCount: tickets.length });
}

async function processSendExtraEmail(job: Job) {
    const payload = job.data.payload as SendExtraEmailJobData;

    if (!AppDataSource.isInitialized) {
        throw new Error("Database not initialized");
    }

    const extraRepo = AppDataSource.getRepository(ExtraItem);
    let extras = await extraRepo.find({
        where: { id: payload.extraItemIds } as any,
        relations: ["eventProduct", "eventProduct.event", "eventProduct.product"],
    });

    if (extras.length === 0 && payload.paymentLogId) {
        extras = await extraRepo.find({
            where: { paymentLogId: payload.paymentLogId, userId: payload.userId },
            relations: ["eventProduct", "eventProduct.event", "eventProduct.product"],
            take: payload.extraItemIds.length || 10,
        });
    }

    if (extras.length === 0) {
        throw new Error(`No extras found for job ${job.id}`);
    }

    const event = extras[0].eventProduct?.event;
    if (!event) {
        throw new Error(`Missing event for extras job ${job.id}`);
    }

    const buyerName = `${payload.userFirstname || ""} ${payload.userLastname || ""}`.trim();

    const emailData: IExtraVoucher[] = extras.map((e) => ({
        qrCode: e.qrCode!,
        productName: e.eventProduct.product?.name || "Extra",
        quantity: e.quantity,
        eventTitle: event.title,
        eventDate: `${event.date} ${event.time}`,
        eventLocation: event.direccion || "",
        buyerName,
    }));

    await enviarCorreoConExtras(payload.userEmail, emailData);
    logger.info("QUEUE_EXTRA_EMAIL_SENT", { jobId: job.id, extrasCount: extras.length });
}

async function processSendGuestInvitation(job: Job) {
    const payload = job.data.payload as SendGuestInvitationEmailJobData;

    if (!AppDataSource.isInitialized) {
        throw new Error("Database not initialized");
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticketTypeRepo = AppDataSource.getRepository(TicketType);
    const eventRepo = AppDataSource.getRepository(Event);

    const tickets = await ticketRepo.find({
        where: { id: payload.ticketIds } as any,
        relations: ["ticketType", "ticketType.event"],
    });

    if (tickets.length === 0) {
        throw new Error(`No guest tickets found for job ${job.id}`);
    }

    const ticketType = tickets[0].ticketType;
    const event = ticketType?.event;

    if (!event || !ticketType) {
        throw new Error(`Missing event or ticketType for guest job ${job.id}`);
    }

    const dateValue = event.date instanceof Date ? event.date : new Date(event.date);
    const formattedDate = !isNaN(dateValue.getTime())
        ? dateValue.toLocaleDateString("es-AR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
          })
        : String(event.date);

    const emailData: ITicketQR[] = tickets.map((t) => ({
        qrCode: t.qrCode!,
        ticketId: t.id,
        eventTitle: event.title,
        eventDate: `${formattedDate} ${event.time}`,
        eventLocation: event.direccion || "",
        buyerName: "Invitado",
        ticketType: ticketType.name,
    }));

    await enviarCorreoConQR(payload.email, emailData);
    logger.info("QUEUE_GUEST_INVITE_SENT", { jobId: job.id, ticketsCount: tickets.length });
}

async function processSendAccountClaim(job: Job) {
    const payload = job.data.payload as SendAccountClaimEmailJobData;
    await sendAccountClaimEmail(payload.userEmail, payload.userName, payload.claimUrl);
    logger.info("QUEUE_ACCOUNT_CLAIM_SENT", { jobId: job.id, email: payload.userEmail });
}

// ============================================================================
// WORKER START / STOP
// ============================================================================

export function startEmailWorker(): Worker {
    if (emailWorker) {
        return emailWorker;
    }

    emailWorker = new Worker(
        QUEUE_NAME,
        async (job: Job) => {
            const data = job.data as QueueJobData;

            logger.info("QUEUE_JOB_STARTED", {
                jobId: job.id,
                type: data.type,
                attempt: job.attemptsMade + 1,
            });

            switch (data.type) {
                case "send-ticket-email":
                    await processSendTicketEmail(job);
                    break;
                case "send-extra-email":
                    await processSendExtraEmail(job);
                    break;
                case "send-guest-invitation":
                    await processSendGuestInvitation(job);
                    break;
                case "send-account-claim":
                    await processSendAccountClaim(job);
                    break;
                default:
                    throw new Error(`Unknown job type: ${(data as any).type}`);
            }

            logger.info("QUEUE_JOB_COMPLETED", { jobId: job.id, type: data.type });
        },
        {
            connection: getBullMQConnection(),
            concurrency: 3,
            lockDuration: 30000,
        }
    );

    emailWorker.on("failed", (job, err) => {
        logger.error("QUEUE_JOB_FAILED", {
            jobId: job?.id,
            type: job?.data?.type,
            error: err.message,
            attemptsMade: job?.attemptsMade,
        });
    });

    emailWorker.on("completed", (job) => {
        logger.info("QUEUE_JOB_COMPLETED_EVENT", { jobId: job.id, type: job.data.type });
    });

    logger.info("QUEUE_WORKER_STARTED", { queue: QUEUE_NAME, concurrency: 3 });
    return emailWorker;
}

export async function closeEmailWorker(): Promise<void> {
    if (emailWorker) {
        await emailWorker.close();
        emailWorker = null;
        logger.info("QUEUE_WORKER_CLOSED", { queue: QUEUE_NAME });
    }
    if (emailQueue) {
        await emailQueue.close();
        emailQueue = null;
        logger.info("QUEUE_CLOSED", { queue: QUEUE_NAME });
    }
}
