// Explicit integration check on the configured PostgreSQL database.
// Creates and removes only a unique temporary audit schema; calls no external providers.
process.env.DB_SYNC='false';
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const db=require('../dist/config/database').default;
const schema='eventlife_audit_'+randomBytes(12).toString('hex');
const runners=[];
(async()=>{
  try {
    await db.initialize();
    assert.equal(await db.showMigrations(),false,'Pending migrations');
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`CREATE TABLE "${schema}".stock(id integer PRIMARY KEY, sold integer NOT NULL, capacity integer NOT NULL);
      INSERT INTO "${schema}".stock VALUES(1,0,1);
      CREATE TABLE "${schema}".outbox(id integer PRIMARY KEY, owner text);
      INSERT INTO "${schema}".outbox VALUES(1,NULL),(2,NULL),(3,NULL);`);
    for(let i=0;i<2;i++) {const runner=db.createQueryRunner();await runner.connect();runners.push(runner);}
    const [a,b]=runners;
    await a.startTransaction();await b.startTransaction();
    const first=await a.query(`UPDATE "${schema}".stock SET sold=sold+1 WHERE id=1 AND sold+1<=capacity RETURNING id`);
    assert.equal(first[1],1);assert.equal(first[0][0].id,1);
    const competing=b.query(`UPDATE "${schema}".stock SET sold=sold+1 WHERE id=1 AND sold+1<=capacity RETURNING id`);
    await a.commitTransaction();
    assert.equal((await competing)[1],0);await b.commitTransaction();
    assert.equal((await db.query(`SELECT sold FROM "${schema}".stock`))[0].sold,1);
    await a.startTransaction();await b.startTransaction();
    const claim=runner=>runner.query(`UPDATE "${schema}".outbox SET owner=$1 WHERE id IN
      (SELECT id FROM "${schema}".outbox WHERE owner IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`,[randomBytes(6).toString('hex')]);
    const claims=await Promise.all([claim(a),claim(b)]);
    assert.equal(claims[0][1],1);assert.equal(claims[1][1],1);assert.notEqual(claims[0][0][0].id,claims[1][0][0].id);
    await a.rollbackTransaction();await b.rollbackTransaction();
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM "${schema}".outbox WHERE owner IS NOT NULL`))[0].n,0);
    console.log('PostgreSQL integration passed: migration history, UPDATE result, concurrent stock, SKIP LOCKED, rollback.');
  } catch(error){console.error('PostgreSQL integration failed:',error.code || error.message);process.exitCode=1;}
  finally {
    for(const runner of runners){if(runner.isTransactionActive)await runner.rollbackTransaction();await runner.release();}
    if(db.isInitialized){
      if(!/^eventlife_audit_[a-f0-9]{24}$/.test(schema))throw Error('Invalid cleanup target');
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.destroy();
    }
  }
})();
