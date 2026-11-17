// Explicit opt-in only. Never reads .env or selects the production database.
const { spawnSync } = require('node:child_process');
const url = process.env.EVENTLIFE_TEST_POSTGRES_URL;
if (!url || !/^eventlife_business_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) {
  throw Error('Set EVENTLIFE_TEST_POSTGRES_URL to an isolated eventlife_business_test_* database');
}
const files = ['scanner-business', 'extras-commerce', 'catalog-business', 'pricing-business', 'subscription-business',
  'operations-business', 'promoter-business', 'checkout-business', 'auth-business'].map(file => `tests/${file}.test.cjs`);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
