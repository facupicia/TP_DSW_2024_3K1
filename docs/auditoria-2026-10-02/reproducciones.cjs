// Ejecuta código real con dependencias simuladas. No conecta DB, Redis ni MercadoPago.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'Backend/node_modules/typescript'));
const logger = { info() {}, warn() {}, error() {} };
const entities = Object.fromEntries(['User', 'Ticket', 'TicketType', 'PaymentLog', 'ExtraItem', 'EventProduct', 'PromoterGroup', 'Coupon', 'RefreshToken'].map(name => [name, class {}]));
const statuses = { PROCESSING: 'processing', COMPLETED: 'completed', FAILED: 'failed', REFUNDED: 'refunded' };
function load(file, overrides = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const exports = {};
  const deps = {
    '../user/user.entity': { User: entities.User },
    '../../user/user.entity': { User: entities.User },
    '../../user/refreshToken.entity': { RefreshToken: entities.RefreshToken },
    '../ticket/ticket.entity': { Ticket: entities.Ticket, TicketStatus: { ACTIVE: 'active', CANCELLED: 'cancelled' } },
    '../ticketType/ticketType.entity': { TicketType: entities.TicketType },
    './payment.entity': { PaymentLog: entities.PaymentLog, PaymentStatus: statuses },
    '../extra/extraItem.entity': { ExtraItem: entities.ExtraItem, ExtraItemStatus: { ACTIVE: 'active', CANCELLED: 'cancelled' } },
    '../extra/eventProduct.entity': { EventProduct: entities.EventProduct },
    '../promoter/promoter.entity': { PromoterGroup: entities.PromoterGroup },
    '../coupon/coupon.entity': { Coupon: entities.Coupon },
    '../common/services/logger': { logger }, '../services/logger': { logger }, './logger': { logger },
    './mp.config': { getMPConfig: () => ({ accessToken: 'fake-token' }) },
    '../common/services/encryption': { decryptFromString: () => 'fake-token' },
    '../common/utils/qr': { generarQRUrl: async () => 'fake-qr' },
    '../subscription/subscription.service': { getActiveSubscription: async () => ({ plan: { name: 'FREE', commissionPercent: 8 } }) },
    '../../config/env': { env: { JWT_REFRESH_DAYS: 30, NODE_ENV: 'test' } },
    './generateToken': { tokenSing: async () => 'fake-access-token' },
    ...overrides
  };
  vm.runInNewContext(output, {
    exports, Buffer, console, URL, AbortSignal,
    require: id => {
      if (id === 'crypto') return require('node:crypto');
      if (id === 'typeorm') return { In: x => x, Between: (...x) => x, IsNull: () => null };
      return deps[id] || {};
    }, ...globals
  }, { filename: file });
  return exports;
}
async function stockAndTransient() {
  const state = { sold: 0, commits: 0, rollback: 0, mode: 'stock', logStatus: null };
  const logRepo = { create: data => ({ ...data, id: 1 }), save: async () => {}, update: async (_, data) => { state.logStatus = data.status; } };
  const types = [1, 2].map(id => ({ id, price: 100, event: { id: 1, user_id: 7 } }));
  const manager = {
    getRepository: entity => entity === entities.User
      ? { findOne: async () => { if (state.mode === 'transient') throw Object.assign(new Error('connection timeout'), { code: 'ECONNRESET' }); return { id: 3 }; } }
      : entity === entities.TicketType ? { find: async () => types } : logRepo,
    createQueryBuilder: () => {
      let id;
      const q = { update() { return q; }, set() { return q; }, where(_, data) { id = data.id; return q; }, andWhere() { return q; },
        async execute() { if (id === 1) { state.sold++; return { affected: 1 }; } return { affected: 0 }; } };
      return q;
    }
  };
  const db = { createQueryRunner: () => ({ manager, connect: async () => {}, startTransaction: async () => {}, release: async () => {},
    commitTransaction: async () => { state.commits++; }, rollbackTransaction: async () => { state.rollback++; state.sold = 0; } }) };
  const core = load('Backend/src/payment/payment.core.ts', { '../db': db });
  const payment = { id: 'fake', status: 'approved', transaction_amount: 200,
    metadata: { user_id: 3, organizer_id: 7, promoter_code: 'RRPP-DEMO', items: [{ type: 'ticket', referenceId: 1, quantity: 1 }, { type: 'ticket', referenceId: 2, quantity: 1 }] } };
  const extracted = core.extractPaymentInfo(payment);
  assert.equal(extracted.promoterCode, undefined);
  const result = await core.processApprovedPayment('fake', payment);
  assert.equal(result.success, false);
  assert.equal(state.sold, 1);
  assert.equal(state.commits, 1);
  console.log('CONFIRMADO: compra fallida confirma soldCount +1 del primer ítem; no crea tickets.');
  console.log('CONFIRMADO: extractPaymentInfo pierde metadata.promoter_code.');
  state.mode = 'transient';
  const failure = await core.processApprovedPayment('fake', payment);
  assert.equal(failure.success, false);
  assert.equal(failure.error, 'connection timeout');
  assert.equal(failure.code, undefined);
  console.log('CONFIRMADO: ECONNRESET queda convertido en success:false sin código transitorio.');
}
async function refreshRace() {
  let issued = 0;
  const repo = { findOne: async () => ({ id: 1, userId: 3, expiresAt: new Date(Date.now() + 100000), user: { id: 3, active: true } }), save: async () => { issued++; } };
  const db = { getRepository: () => repo, createQueryRunner: () => ({ manager: { getRepository: () => repo }, connect: async () => {}, startTransaction: async () => {}, commitTransaction: async () => {}, rollbackTransaction: async () => {}, release: async () => {} }) };
  const module = load('Backend/src/common/services/sessionTokens.ts', { '../../db': db });
  const res = { cookie() {}, clearCookie() {} };
  const results = await Promise.all([1, 2].map(() => module.rotateRefreshToken({ headers: { cookie: 'eventlife_refresh=fake' } }, res)));
  assert.equal(results.filter(Boolean).length, 2);
  assert.equal(issued, 4);
  console.log('CONFIRMADO: dos refresh concurrentes con una cookie generan dos sesiones válidas.');
}
async function refundRace() {
  let restored = 0, remoteCalls = 0;
  const payment = { id: 1, mpPaymentId: 'fake', userId: 3, organizerId: null, status: 'completed', totalAmount: 200, createdAt: new Date() };
  const builder = rows => { const q = { select() { return q; }, where() { return q; }, andWhere() { return q; }, getMany: async () => rows }; return q; };
  const db = {
    getRepository: entity => entity === entities.PaymentLog ? { findOne: async () => ({ ...payment }) }
      : { createQueryBuilder: () => builder(entity === entities.Ticket ? [{ id: 1, ticketTypeId: 1 }] : []) },
    createQueryRunner: () => ({ connect: async () => {}, startTransaction: async () => {}, commitTransaction: async () => {}, release: async () => {},
      manager: { update: async () => {}, getRepository: () => ({ update: async () => {}, createQueryBuilder: () => {
        const q = { update() { return q; }, set() { return q; }, where() { return q; }, execute: async () => { restored++; } }; return q;
      } }) } })
  };
  const module = load('Backend/src/payment/refund.service.ts', { '../db': db }, { fetch: async () => { remoteCalls++; return { ok: true, json: async () => ({ id: 'fake' }) }; } });
  const results = await Promise.all([1, 2].map(() => module.processRefund('fake', { requestedBy: 7, requesterRoles: ['admin'] })));
  assert.equal(results.filter(x => x.success).length, 2);
  assert.equal(restored, 2);
  assert.equal(remoteCalls, 2);
  console.log('CONFIRMADO: dos reembolsos concurrentes restauran el mismo stock dos veces y llaman dos veces a MP.');
}
async function oldClaim() {
  const alreadyClaimedUser = { id: 3, active: true, isGuestAccount: false, deletedAt: null };
  const db = { getRepository: () => ({ findOne: async () => ({ user: alreadyClaimedUser, expiresAt: new Date(Date.now() + 100000), usedAt: null }) }) };
  const module = load('Backend/src/user/accountClaim.service.ts', { '../db': db, '../config/env': { env: { ACCOUNT_CLAIM_TOKEN_HOURS: 24 } } });
  const result = await module.findValidAccountClaimToken('old-unused-token');
  assert.ok(result);
  assert.equal(result.user.isGuestAccount, false);
  console.log('CONFIRMADO: un token de reclamo previo sigue válido aunque la cuenta ya fue reclamada.');
}
(async () => { await stockAndTransient(); await refreshRace(); await refundRace(); await oldClaim(); })().catch(error => { console.error(error); process.exitCode = 1; });
