// Local development must not inherit production/schema-sync settings from a shell.
process.env.NODE_ENV = 'development';
process.env.DB_SYNC = 'false';
const entry = require.resolve('ts-node-dev/lib/bin');
process.argv = [process.execPath, entry, '--respawn', 'src/index.ts'];
require(entry);
