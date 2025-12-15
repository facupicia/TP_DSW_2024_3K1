import { createPreference } from '../src/payment/payment.controller';
import { checkAuthToken, CustomRequest } from '../src/middlewares/authToken';
import { Response, NextFunction } from 'express';

function mockRes() {
    const res: Partial<Response> & { statusCode?: number; body?: any } = {};
    res.status = (code: number) => {
        res.statusCode = code;
        return res as Response;
    };
    res.json = (body: any) => {
        res.body = body;
        return res as Response;
    };
    return res as Response & { statusCode?: number; body?: any };
}

async function testAuthMiddleware() {
    const req = { header: () => undefined } as any as CustomRequest;
    const res = mockRes();
    const next: NextFunction = () => { };
    await checkAuthToken(req, res, next);
    console.log('Auth without token →', res.statusCode, res.body);
}

async function testCreatePreferenceMissingConfig() {
    const originalToken = process.env.MP_ACCESS_TOKEN;
    process.env.MP_ACCESS_TOKEN = '';
    const req = {
        body: { ticketQuantity: '1', eventId: 1 },
        user: { id: 1, iat: Date.now() }
    } as any as CustomRequest;
    const res = mockRes();
    await createPreference(req, res);
    console.log('CreatePreference missing config →', res.statusCode, res.body);
    process.env.MP_ACCESS_TOKEN = originalToken;
}

async function testCreatePreferenceInvalidQuantity() {
    const req = {
        body: { ticketQuantity: '0', eventId: 1 },
        user: { id: 1, iat: Date.now() }
    } as any as CustomRequest;
    const res = mockRes();
    await createPreference(req, res);
    console.log('CreatePreference invalid quantity →', res.statusCode, res.body);
}

async function main() {
    await testAuthMiddleware();
    await testCreatePreferenceMissingConfig();
    await testCreatePreferenceInvalidQuantity();
}

main().catch(err => {
    console.error('TEST_RUN_ERROR', err);
    process.exit(1);
});

