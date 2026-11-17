// Explicit operational check; never invoked by npm test. Prints schema metadata only.
process.env.DB_SYNC='false';
const db=require('../dist/config/database').default;
(async()=>{
  try {
    await db.initialize();
    const tables=await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name`);
    const migrations=await db.query(`SELECT to_regclass('migrations') IS NOT NULL AS exists`);
    const applied=migrations[0].exists ? await db.query('SELECT name FROM migrations ORDER BY id') : [];
    const columns=await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND (table_name IN ('outbox_job','refund_request','checkout_order') OR (table_name='user' AND column_name='credentialsVersion') OR (table_name='account_claim_token' AND column_name IN ('purpose','credentialsVersion'))) ORDER BY table_name,column_name`);
    console.log(JSON.stringify({tables:tables.map(t=>t.table_name),applied:applied.map(m=>m.name),newColumns:columns},null,2));
  } catch(error){console.error('Schema check failed:',error.code || error.name);process.exitCode=1;}
  finally{if(db.isInitialized)await db.destroy();}
})();
