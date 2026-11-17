const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const entities=Object.fromEntries(['User','Ticket','TicketType','PaymentLog','ExtraItem','EventProduct','Coupon','PromoterGroup','PromoterEventAssignment','CheckoutOrder','RefundRequest','OutboxJob','RefreshToken','AccountClaimToken'].map(n=>[n,class {}]));
const statuses={PROCESSING:'processing',COMPLETED:'completed',FAILED:'failed',REFUNDED:'refunded',ACTIVE:'active',CANCELLED:'cancelled',USED:'used'};
const logger={info(){},warn(){},error(){}};
function load(file,deps={},globals={}) {
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const exports={};
  const base={
    '../common/services/logger':{logger},'./logger':{logger},'../services/logger':{logger},
    './mp.config':{getMPConfig:()=>({accessToken:'platform'})},
    '../common/utils/qr':{generarQRUrl:async()=> 'qr'},
    '../subscription/subscription.service':{getActiveSubscription:async()=>({plan:{name:'FREE',commissionPercent:8}})},
    '../../config/env':{env:{JWT_REFRESH_DAYS:30,NODE_ENV:'test',CLIENT_URL:'https://app.example',CLIENT_URLS:'https://app.example'}},
    '../config/env':{env:{ACCOUNT_CLAIM_TOKEN_HOURS:24,CLIENT_URL:'https://app.example'}},
    './generateToken':{tokenSing:async()=> 'access'},
    ...deps
  };
  vm.runInNewContext(code,{exports,Buffer,URL,AbortSignal,Date,console,setInterval,clearInterval,setTimeout,clearTimeout,require:id=>{
    if(id==='crypto')return require('node:crypto');
    if(id==='luxon')return require('luxon');
    if(id.endsWith('/http-error'))return load('common/errors/http-error.ts');
    if(id.endsWith('/money'))return load('common/utils/money.ts');
    if(id==='typeorm')return base[id] || {In:x=>x,IsNull:()=>null};
    if(Object.hasOwn(base,id))return base[id];
    if(id.endsWith('.entity'))return {...entities,PaymentStatus:statuses,TicketStatus:statuses,ExtraItemStatus:statuses,TicketTypeStatus:statuses};
    return {};
  },...globals},{filename:file});return exports;
}
// Matches TypeORM's PostgreSQL raw UPDATE/DELETE result, not pg's Result object.
function queryAdapter(db) {return async(sql,params=[])=>{const r=await db.query(sql,params);return /^\s*(UPDATE|DELETE)\b/i.test(sql)?[r.rows,r.affectedRows]:r.rows;};}
module.exports={load,entities,statuses,queryAdapter};
