const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const smtpEnv = { MAIL_PROVIDER: 'smtp', MAIL_HOST: 'smtp.example.test', MAIL_PORT: '465',
  MAIL_USER: 'mailer@example.test', MAIL_PASSWORD: 'test-only-password', MAIL_FROM: 'mailer@example.test' };

function smtpModule(options = {}) {
  const observed = { logs: [] };
  const transport = load('common/services/mail.transport.ts', {
    '../../config/env': { env: { ...smtpEnv, ...options.env } },
    './logger': { logger: { info() {}, error(...args) { observed.logs.push(args); } } },
    nodemailer: { createTransport(config) {
      observed.config = config;
      return {
        verify: options.verify || (async () => true),
        sendMail: async message => {
          observed.message = message;
          if (options.error) throw options.error;
          return options.result || { messageId: 'smtp-message', accepted: ['buyer@example.test'], rejected: [] };
        }
      };
    } }
  }, { fetch() { throw new Error('SMTP must not call Brevo'); } });
  return { transport, observed };
}

const envelope = { sender: { name: 'Event Life', email: 'mailer@example.test' },
  to: [{ email: 'buyer@example.test' }], subject: 'Entradas', htmlContent: '<p>Confirmadas</p>',
  attachment: [{ name: 'Entradas.pdf', content: Buffer.from('%PDF-test').toString('base64') }] };

test('SMTP authenticates over TLS and sends the PDF bytes with the existing envelope', async () => {
  const { transport, observed } = smtpModule();
  assert.equal(await transport.verifyEmailTransport(), true);
  assert.equal(observed.message, undefined, 'verification must not send an email');
  assert.equal(observed.config.secure, true);
  assert.equal(observed.config.tls.minVersion, 'TLSv1.2');
  assert.equal(observed.config.disableFileAccess, true);
  assert.equal(observed.config.disableUrlAccess, true);
  assert.equal((await transport.sendTransactionalEmail(envelope)).messageId, 'smtp-message');
  assert.equal(observed.message.to[0].address, 'buyer@example.test');
  assert.equal(observed.message.attachments[0].content.toString(), '%PDF-test');
  assert.equal(observed.message.attachments[0].filename, 'Entradas.pdf');
});

test('SMTP on port 587 requires STARTTLS', async () => {
  const { transport, observed } = smtpModule({ env: { MAIL_PORT: '587' } });
  assert.equal(await transport.verifyEmailTransport(), true);
  assert.equal(observed.config.secure, false);
  assert.equal(observed.config.requireTLS, true);
});

test('invalid SMTP credentials mark the mailer down without logging provider secrets', async () => {
  const failure = Object.assign(new Error('test-only-password private-recipient@example.test'), { code: 'EAUTH', responseCode: 535 });
  const { transport, observed } = smtpModule({ verify: async () => { throw failure; }, error: failure });
  assert.equal(await transport.verifyEmailTransport(), false);
  assert.equal(await transport.sendTransactionalEmail(envelope), null);
  const logs = JSON.stringify(observed.logs);
  assert.match(logs, /EAUTH/);
  assert.doesNotMatch(logs, /test-only-password|private-recipient/);
});

test('SMTP rejected recipients never acknowledge a durable job as sent', async () => {
  for (const result of [
    { messageId: 'bad', accepted: [], rejected: ['buyer@example.test'] },
    { messageId: 'partial', accepted: ['buyer@example.test'], rejected: ['other@example.test'] }
  ]) {
    assert.equal(await smtpModule({ result }).transport.sendTransactionalEmail(envelope), null);
  }
});

test('incomplete SMTP configuration fails verification without using Brevo as a fallback', async () => {
  const { transport } = smtpModule({ env: { MAIL_PASSWORD: undefined } });
  assert.equal(await transport.verifyEmailTransport(), false);
  assert.equal(await transport.sendTransactionalEmail(envelope), null);
});

test('Brevo credentials are actually verified and unsuccessful delivery remains retryable', async () => {
  const calls = [];
  const transport = load('common/services/mail.transport.ts', {
    '../../config/env': { env: { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-key' } },
  }, { fetch: async (url, request) => {
    calls.push({ url, request });
    return { ok: false, status: 401 };
  } });
  assert.equal(await transport.verifyEmailTransport(), false);
  assert.equal(await transport.sendTransactionalEmail(envelope), null);
  assert.match(calls[0].url, /\/account$/);
  assert.match(calls[1].url, /\/smtp\/email$/);
});

test('Brevo remains compatible with existing templates and PDF attachments', async () => {
  let request;
  const transport = load('common/services/mail.transport.ts', {
    '../../config/env': { env: { BREVO_API_KEY: 'test-key' } },
  }, { fetch: async (_url, input) => {
    request = input;
    return { ok: true, json: async () => ({ messageId: 'brevo-message' }) };
  } });
  assert.equal((await transport.sendTransactionalEmail(envelope)).messageId, 'brevo-message');
  assert.deepEqual(JSON.parse(request.body), envelope);
});

test('every mail template uses the configured transport and verification reflects provider availability', async () => {
  const sent = [];
  let available = false;
  const mailer = load('common/services/mailer.ts', {
    '../../config/env': { env: { MAIL_FROM: smtpEnv.MAIL_FROM, CLIENT_URL: 'https://app.example.test' } },
    './pdfGenerator': { generateTicketsPDF: async () => 'JVBERg==' },
    './mail.transport': {
      verifyEmailTransport: async () => available,
      sendTransactionalEmail: async body => { sent.push(body); return { messageId: 'mail-' + sent.length }; }
    }
  });
  assert.equal(await mailer.verifyMailer(), false);
  assert.equal(mailer.getMailerStatus(), 'down');
  available = true;
  assert.equal(await mailer.verifyMailer(), true);
  assert.equal(mailer.getMailerStatus(), 'up');
  await mailer.default('buyer@example.test', [{ eventTitle: '<Evento>', qrCode: 'qr', ticketId: 1 }]);
  assert.equal((await mailer.sendPromoterInvitationEmail('buyer@example.test', '<Name>', 'Organizer', 'CODE', 5)).success, true);
  await mailer.sendAccountClaimEmail('buyer@example.test', '<Name>', 'https://app.example.test/reset-password', 'reset');
  await mailer.enviarCorreoConExtras('buyer@example.test', [{ productName: '<Extra>', quantity: 1, eventTitle: '<Evento>', buyerName: '<Name>', qrCode: 'qr' }]);
  assert.equal(sent.length, 4);
  assert.equal(sent[0].attachment[0].name, 'Entradas-EventLife.pdf');
  for (const message of sent) {
    assert.doesNotMatch(message.htmlContent, /<Evento>|<Name>|<Extra>/);
    assert.equal(message.sender.email, smtpEnv.MAIL_FROM);
  }
});
