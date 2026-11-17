// Explicit read-only HTTP smoke check; never runs as part of the isolated unit suite.
process.env.DB_SYNC='false';
const {spawn}=require('node:child_process');
const net=require('node:net');
const assert=require('node:assert/strict');
const db=require('../dist/config/database').default;
(async()=>{
  let child;
  try {
    await db.initialize();
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM outbox_job WHERE "processedAt" IS NULL'))[0].n,0,'Pending jobs: smoke start could execute external actions');
    const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
    const stages=[];
    child=spawn(process.execPath,['dist/index.js'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,PORT:String(port),REDIS_URL:'',DB_SYNC:'false'},stdio:['ignore','pipe','pipe'],windowsHide:true});
    for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{stages.push(...(String(data).match(/STARTUP_[A-Z_]+/g)||[]));});
    let healthy=false;
    for(let attempt=0;attempt<150;attempt++){
      if(child.exitCode!==null)throw Error('Application stopped during startup; stages: '+stages.join(', '));
      try {const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(2000)});if(response.ok){assert.deepEqual(await response.json(),{status:'ok'});healthy=true;break;}} catch{}
      await new Promise(r=>setTimeout(r,200));
    }
    assert.equal(healthy,true,'Health check never became ready; stages: '+stages.join(', '));
    const denied=await fetch(`http://127.0.0.1:${port}/api/user/refresh`,{method:'POST'});
    assert.equal(denied.status,403);
    const status=await fetch(`http://127.0.0.1:${port}/api/payment/status?external_reference=unknown`);
    assert.equal(status.status,403);
    console.log('Runtime smoke passed: startup without Redis, health check, CSRF rejection, private checkout status.');
  } catch(error){console.error('Runtime smoke failed:',error.message);process.exitCode=1;}
  finally{if(child && child.exitCode===null)child.kill();if(db.isInitialized)await db.destroy();}
})();
