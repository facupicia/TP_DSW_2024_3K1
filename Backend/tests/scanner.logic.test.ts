import { ScannerController } from '../src/scanner/scanner.controller';
import { CustomRequest } from '../src/middlewares/authToken';
import { Response } from 'express';
import { Ticket, TicketStatus } from '../src/ticket/ticket.entity';

// Mock Ticket
const mockTicket = {
    id: 1,
    codigo_unico: 'TEST-QR-123',
    status: TicketStatus.VALID,
    usedAt: null,
    scannedById: null,
    save: async function () {
        console.log('Ticket saved with status:', this.status);
        return this;
    }
};

// Override Ticket.findOne
Ticket.findOne = async (options: any) => {
    if (options.where.codigo_unico === 'TEST-QR-123') {
        return mockTicket as any;
    }
    return null;
};

Ticket.find = async (options: any) => {
    if (options.where.scannedById === 123) {
        return [mockTicket] as any;
    }
    return [];
}

const req = {
    body: { code: 'TEST-QR-123' },
    user: { id: 123 }
} as any as CustomRequest;

const res = {
    status: (code: number) => {
        console.log('Status:', code);
        return res;
    },
    json: (body: any) => {
        console.log('Response Body:', JSON.stringify(body, null, 2));
        return res;
    }
} as any as Response;

async function runTests() {
    console.log('--- Running Scanner Logic Tests ---');

    console.log('\nTest 1: Validate Valid Ticket');
    await ScannerController.validateTicket(req, res);

    console.log('\nTest 2: Validate Already Used Ticket');
    // Ticket should now be used from previous test (if object reference persists)
    // Or we manually set it since findOne returns the reference
    await ScannerController.validateTicket(req, res);

    console.log('\nTest 3: Get History');
    await ScannerController.getHistory(req, res);
}

runTests().catch(console.error);
