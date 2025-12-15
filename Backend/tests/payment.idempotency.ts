import { paymentWebhook } from '../src/payment/payment.controller';
import AppDataSource from '../src/db';
import { CustomRequest } from '../src/middlewares/authToken';

function mockRes() {
  const res: any = {};
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
}

const users = [{ id: 1, email: 'test@example.com', firstname: 'T', lastname: 'U' } as any];
const events = [{ id: 23, capacity: 100, price: 12000, title: 'Evento' } as any];
const tickets: any[] = [];
const payments: any[] = [];

(AppDataSource as any).createQueryRunner = () => ({
  connect: async () => { },
  startTransaction: async () => { },
  commitTransaction: async () => { },
  rollbackTransaction: async () => { },
  release: async () => { },
  manager: {
    findOne: async (entity: any, opts: any) => {
      if ((entity as any).name === 'User') return users.find(u => u.id === opts.where.id) || null;
      if ((entity as any).name === 'Event') return events.find(e => e.id === opts.where.id) || null;
      return null;
    },
    count: async (_entity: any, _opts: any) => tickets.length,
    create: (_entity: any, data: any) => ({ ...data }),
    save: async (entity: any, data: any) => {
      if ((entity as any).name === 'PaymentLog') {
        const exists = payments.find(p => p.mpPaymentId === data.mpPaymentId);
        if (exists) {
          const err: any = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
        payments.push({ ...data });
        return;
      }
      if ((entity as any).name === 'Ticket') {
        const arr = Array.isArray(data) ? data : [data];
        arr.forEach(d => tickets.push({ ...d }));
        return;
      }
    }
  }
});

(global as any).fetch = async () => ({
  json: async () => ({
    status: 'approved',
    external_reference: '1|23|2',
    metadata: { user_id: 1, event_id: 23, amount_tickets: 2 }
  })
});

async function run() {
  const req: any = { body: { type: 'payment', data: { id: 'PAY-XYZ' } }, query: {}, header: () => undefined } as any as CustomRequest;
  const resA: any = mockRes();
  await paymentWebhook(req, resA);
  console.log('A', resA.statusCode, resA.body);

  const resB: any = mockRes();
  await paymentWebhook(req, resB);
  console.log('B', resB.statusCode, resB.body);

  console.log('tickets:', tickets.length);
}

run().catch(err => { console.error(err); process.exit(1); });
