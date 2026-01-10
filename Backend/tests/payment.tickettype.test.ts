import { Payment } from 'mercadopago';
import { processPaymentTransaction } from '../src/payment/payment.service';
import AppDataSource from '../src/db';
import { TicketType } from '../src/ticketType/ticketType.entity';
import { User } from '../src/user/user.entity';
import { Ticket } from '../src/ticket/ticket.entity';
import { PaymentLog } from '../src/payment/payment.entity';

// --- MOCKS ---

// Mock MercadoPago Payment.get BEFORE running the service logic
// We need to patch the prototype.
(Payment.prototype as any).get = async () => ({
    status: 'approved',
    external_reference: '1|100|2',
    metadata: {}
});

const mockTicketTypes = [
    {
        id: 100,
        event: { id: 1, title: 'Concierto Test', date: new Date(), time: '20:00', location: 'Estadio' },
        name: 'General',
        capacity: 50,
        soldCount: 10,
        price: 5000,
        active: true
    }
];
const mockUsers = [{ id: 1, email: 'test@test.com', firstname: 'Juan', lastname: 'Perez' }];
const mockTickets: any[] = [];
const mockLogs: any[] = [];

// Mock AppDataSource
(AppDataSource as any).createQueryRunner = () => ({
    connect: async () => { console.log("DB Connected"); },
    startTransaction: async () => { console.log("Transaction Started"); },
    commitTransaction: async () => { console.log("Transaction Committed"); },
    rollbackTransaction: async () => { console.log("Transaction Rolled back"); },
    release: async () => { console.log("DB Released"); },
    manager: {
        findOne: async (entity: any, opts: any) => {
            if (entity === User) return mockUsers.find(u => u.id === opts.where.id) || null;
            if (entity === TicketType) {
                const tt = mockTicketTypes.find(t => t.id === opts.where.id);
                return tt || null;
            }
            return null;
        },
        create: (entity: any, data: any) => {
            if (entity === PaymentLog) return { ...data, id: Date.now() };
            return data;
        },
        save: async (arg1: any, arg2: any) => {
            // Handle save(entity, data) vs save(data)
            if (arg2) {
                // 2 args: save(Ticket, tickets)
                const data = arg2;
                if (arg1 === Ticket || (Array.isArray(data) && data[0] instanceof Ticket) || (Array.isArray(data) && data[0].ticketTypeId)) {
                    const arr = Array.isArray(data) ? data : [data];
                    arr.forEach(d => mockTickets.push(d));
                    return data;
                }
            } else {
                // 1 arg: save(log)
                const data = arg1;
                if (data.mpPaymentId) {
                    mockLogs.push(data);
                    return data;
                }
            }
            return arg1;
        },
        update: async (entity: any, id: any, data: any) => {
            if (entity === PaymentLog) {
                const log = mockLogs.find(l => l.id === id);
                if (log) Object.assign(log, data);
            }
        },
        createQueryBuilder: () => ({
            update: (entity: any) => ({
                set: (values: any) => ({
                    where: (condition: string, params: any) => ({
                        andWhere: (condition2: string, params2: any) => ({
                            execute: async () => {
                                // Simulate Atomic Update Logic
                                if (entity === TicketType) {
                                    const tt = mockTicketTypes.find(t => t.id === params.id);
                                    if (tt) {
                                        const amount = params.amount || params2.amount;
                                        if (tt.soldCount + amount <= tt.capacity) {
                                            tt.soldCount += amount;
                                            return { affected: 1 };
                                        }
                                    }
                                }
                                return { affected: 0 };
                            }
                        })
                    })
                })
            })
        })
    }
});

// Mock MercadoPago fetch removed as we patch Payment directly

async function runTest() {
    console.log("--- Starting Test: Payment with TicketType ---");

    // Simulate Webhook processing
    await processPaymentTransaction("PAY-12345");

    // Assertions
    console.log("--- Results ---");

    const log = mockLogs.find(l => l.mpPaymentId === "PAY-12345");
    if (!log) {
        console.error("FAIL: PaymentLog not created");
    } else {
        console.log("PASS: PaymentLog created", log);
        if (log.ticketTypeId === 100) console.log("PASS: Log has correct TicketTypeId");
        else console.error("FAIL: Log TicketTypeId mismatch", log.ticketTypeId);
    }

    const tickets = mockTickets.filter(t => t.ticketTypeId === 100);
    if (tickets.length === 2) {
        console.log("PASS: 2 Tickets created");
    } else {
        console.error(`FAIL: Expected 2 tickets, got ${tickets.length}`);
    }

    const tt = mockTicketTypes.find(t => t.id === 100);
    if (tt?.soldCount === 12) { // 10 initial + 2 sold
        console.log("PASS: TicketType soldCount updated correctly (12)");
    } else {
        console.error(`FAIL: TicketType soldCount mismatch, expected 12, got ${tt?.soldCount}`);
    }

}

runTest().catch(console.error);
