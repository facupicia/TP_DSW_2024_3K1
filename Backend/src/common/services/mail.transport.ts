import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from './logger';

export interface TransactionalEmail {
    sender: { name: string; email: string };
    to: Array<{ email: string }>;
    subject: string;
    htmlContent: string;
    attachment?: Array<{ name: string; content: string }>;
}

let smtp: Transporter | undefined;

function smtpTransport(): Transporter {
    if (smtp) return smtp;
    const port = Number(env.MAIL_PORT || 465);
    if (!env.MAIL_HOST || !env.MAIL_USER || !env.MAIL_PASSWORD || !env.MAIL_FROM ||
        !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_CONFIGURATION_INCOMPLETE');
    }
    smtp = nodemailer.createTransport({
        host: env.MAIL_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        tls: { minVersion: 'TLSv1.2' },
        auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
    });
    return smtp;
}

function logFailure(event: string, error: unknown) {
    // Provider error messages can include recipients, URLs or credentials.
    // Record only bounded operational codes, never provider text or the envelope.
    const failure = error as { code?: unknown; responseCode?: unknown };
    logger.error(event, {
        provider: env.MAIL_PROVIDER || 'brevo',
        code: typeof failure?.code === 'string' ? failure.code.slice(0, 32) : 'MAIL_PROVIDER_ERROR',
        responseCode: typeof failure?.responseCode === 'number' ? failure.responseCode : undefined,
    });
}

export async function verifyEmailTransport(): Promise<boolean> {
    try {
        if (env.MAIL_PROVIDER === 'smtp') {
            await smtpTransport().verify();
            return true;
        }
        if (!env.BREVO_API_KEY) return false;
        const response = await fetch('https://api.brevo.com/v3/account', {
            headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            logger.error('MAILER_VERIFY_FAILED', { provider: 'brevo', status: response.status });
        }
        return response.ok;
    } catch (error) {
        logFailure('MAILER_VERIFY_FAILED', error);
        return false;
    }
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<{ messageId: string } | null> {
    try {
        if (env.MAIL_PROVIDER === 'smtp') {
            const result = await smtpTransport().sendMail({
                from: { name: message.sender.name, address: message.sender.email },
                to: message.to.map(recipient => ({ address: recipient.email })),
                subject: message.subject,
                html: message.htmlContent,
                attachments: message.attachment?.map(attachment => ({
                    filename: attachment.name,
                    content: Buffer.from(attachment.content, 'base64'),
                    contentType: 'application/pdf',
                })),
            });
            if (!result.accepted?.length || result.rejected?.length) {
                logger.error('MAILER_RECIPIENT_REJECTED', { provider: 'smtp' });
                return null;
            }
            logger.info('MAILER_SENT', { provider: 'smtp', messageId: result.messageId });
            return { messageId: result.messageId };
        }
        if (!env.BREVO_API_KEY) return null;
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { accept: 'application/json', 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify(message),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            logger.error('MAILER_BREVO_ERROR', { status: response.status });
            return null;
        }
        const data = await response.json() as { messageId?: string };
        if (!data.messageId) return null;
        logger.info('MAILER_SENT', { provider: 'brevo', messageId: data.messageId });
        return { messageId: data.messageId };
    } catch (error) {
        logFailure('MAILER_SEND_ERROR', error);
        return null;
    }
}
