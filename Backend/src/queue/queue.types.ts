/**
 * Tipos de datos para los jobs de las colas de BullMQ.
 */

export interface SendTicketEmailJobData {
    userEmail: string;
    userId: number;
    userFirstname: string;
    userLastname: string;
    ticketIds: number[];
    ticketTypeId: number;
    eventId: number;
    paymentLogId?: number;
}

export interface SendExtraEmailJobData {
    userEmail: string;
    userId: number;
    userFirstname: string;
    userLastname: string;
    extraItemIds: number[];
    eventId?: number;
    paymentLogId?: number;
}

export interface SendGuestInvitationEmailJobData {
    email: string;
    ticketIds: number[];
    ticketTypeId: number;
    eventId: number;
}

export interface SendAccountClaimEmailJobData {
    userEmail: string;
    userName: string;
    claimUrl: string;
}

export type QueueJobData =
    | { type: "send-ticket-email"; payload: SendTicketEmailJobData }
    | { type: "send-extra-email"; payload: SendExtraEmailJobData }
    | { type: "send-guest-invitation"; payload: SendGuestInvitationEmailJobData }
    | { type: "send-account-claim"; payload: SendAccountClaimEmailJobData };
