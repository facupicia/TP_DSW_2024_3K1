const {test}=require('node:test');const assert=require('node:assert/strict');const {load,entities:E}=require('./helpers.cjs');

test('a token issued from a partial user query retains the stored credentials version', async()=>{
  let signed;
  const fullUser={id:1,credentialsVersion:7,roles:[{name:'user'},{name:'organizer'}]};
  const generator=load('common/services/generateToken.ts',{
    'jsonwebtoken':{sign:payload=>{signed=payload;return 'token';}},
    '../../user/user.entity':{User:{findOne:async()=>fullUser}},
    '../../user/role.entity':{getRoleNames:user=>user.roles.map(role=>role.name)},
    '../../config/env':{env:{SECRET_KEY:'x'.repeat(32),CLIENT_URL:'http://localhost:4200',JWT_ACCESS_EXPIRES_IN:'15m'}}
  });
  assert.equal(await generator.tokenSing({id:1,roles:[{name:'organizer'}]}),'token');
  assert.equal(signed.credentialsVersion,7);
  assert.deepEqual(Array.from(signed.roles),['user','organizer']);
});

test('organizer promotion refreshes cached permissions without invalidating the current session', async()=>{
  let roles=[{name:'user'}];
  const query={leftJoinAndSelect(){return this;},select(){return this;},where(){return this;},async getOne(){return {id:1,active:true,deletedAt:null,credentialsVersion:0,roles};}};
  const middleware=load('common/middleware/authToken.ts',{
    'zod':require('zod'),
    '../services/generateToken':{verifyToken:async()=>({id:1,roles:['user'],credentialsVersion:0})},
    '../../user/user.entity':{User:{createQueryBuilder:()=>query}},
    '../../user/role.entity':{getRoleNames:user=>user.roles.map(role=>role.name)}
  });
  const request={header:()=> 'Bearer existing-token',path:'/has-events',method:'GET'};
  const res={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  let authenticated=0;
  await middleware.checkAuthToken(request,res,()=>authenticated++);
  const controller=load('promoter/promoter.controller.ts',{'./promoter.service':{checkOrganizerHasEvents:async()=>({hasEvents:true,eventCount:1})}});
  await controller.checkOrganizerHasEvents(request,res);
  assert.equal(res.code,403); // Authenticated, but not yet an organizer: never an expired session.
  roles=[{name:'user'},{name:'organizer'}];
  middleware.invalidateUserAuthCache(1);
  await middleware.checkAuthToken(request,res,()=>authenticated++);
  await controller.checkOrganizerHasEvents(request,res);
  assert.equal(authenticated,2);
  assert.equal(res.code,200);
  assert.equal(res.body.hasEvents,true);
});

test('metadata preserves promoter_code and event dates use explicit IANA zones',()=>{
  const core=load('payment/payment.core.ts');assert.equal(core.extractPaymentInfo({metadata:{user_id:3,organizer_id:7,promoter_code:'RRPP',items:[{type:'ticket',referenceId:1,quantity:1}]}}).promoterCode,'RRPP');
  const {eventInstant}=load('common/utils/event-time.ts');assert.equal(eventInstant('2026-10-02','22:00').toISOString(),'2026-10-03T01:00:00.000Z');assert.throws(()=>eventInstant('2026-10-02','22:00','invalid'));
});
test('CSV escapes formulas even after whitespace and preserves quoting',()=>{
  const {csvText}=load('common/utils/csv.ts');assert.match(csvText(' =SUM(A1)'),/^"'/);assert.equal(csvText('a"b'),'"a""b"');
});
test('discount allocation preserves every cent across mixed ticket prices',()=>{
  const {allocateMoney}=load('common/utils/money.ts');
  const prices=allocateMoney(10,[100,200,300]);
  assert.equal(prices.reduce((sum,n)=>sum+Math.round(n*100),0),1000);
  assert.equal(prices[0],1.67);assert.equal(prices[1],3.33);assert.equal(prices[2],5);
  assert.throws(()=>allocateMoney(1,[0]));
});
test('cookie-auth mutations reject foreign and missing Origin',()=>{
  const {trustedOrigin}=load('common/middleware/trustedOrigin.ts');for(const origin of ['https://evil.example',undefined]){
    let status=0,passed=false;trustedOrigin({headers:{origin},header:()=>origin},{status:s=>{status=s;return {json(){}}}},()=>{passed=true;});assert.equal(status,403);assert.equal(passed,false);
  }
  let passed=false;trustedOrigin({headers:{origin:'https://app.example'},header:()=> 'https://app.example'},{},()=>{passed=true;});assert.equal(passed,true);
});
test('concurrent refreshes issue exactly one successor and reject duplicate without deleting new cookie',async()=>{
  const row={id:1,userId:3,expiresAt:new Date(Date.now()+100000),revokedAt:null};let successors=0;let mutex=Promise.resolve();
  const repo={findOne:async()=>row,save:async v=>{if(v!==row)successors++;},create:v=>v,update:async()=>{throw Error('unexpected revoke');}};
  const manager={getRepository:()=>repo,findOne:async()=>({id:3,active:true,credentialsVersion:0,roles:[]})};
  const db={transaction:fn=>{const pending=mutex.then(()=>fn(manager));mutex=pending.catch(()=>{});return pending;}};
  const sessions=load('common/services/sessionTokens.ts',{'../../db':db});let cookies=0;const res={cookie(){cookies++;},clearCookie(){throw Error('cookie cleared');}};
  const results=await Promise.all([1,2].map(()=>sessions.rotateRefreshToken({headers:{cookie:'eventlife_refresh=raw'}},res)));
  assert.equal(results.filter(Boolean).length,1);assert.equal(successors,1);assert.equal(cookies,1);
});
test('claim token cannot change password after guest converted to a registered account',async()=>{
  let mutated=false;const claim=load('user/accountClaim.service.ts');const manager={findOne:async entity=>entity===E.AccountClaimToken?{id:1,userId:3,expiresAt:new Date(Date.now()+100000)}:{id:3,active:true,isGuestAccount:false},update:async()=>{mutated=true;}};
  assert.equal(await claim.consumeAccountClaimToken('old-token',manager),null);assert.equal(mutated,false);
});
test('webhook acknowledgement depends on durable persistence',async()=>{
  let failing=false;const controller=load('payment/payment.controller.ts',{'../db':{manager:{}},'../queue/outbox.service':{enqueueOutbox:async()=>{if(failing)throw Error('database unavailable');}}});
  let status;const req={paymentId:'42',body:{type:'payment',data:{id:'42'}},query:{}};const res={status:s=>{status=s;return {json(){}}}};
  await controller.paymentWebhook(req,res);assert.equal(status,200);failing=true;await controller.paymentWebhook(req,res);assert.equal(status,503);
});
