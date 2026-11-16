const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {buyer}=require('../server/checkout-common.cjs');
const {paymentService}=require('../server/payment-service.cjs');
const {createAdmin}=require('../server/admin.cjs');
const person={fullName:'Pessoa Teste',email:'person@example.com',gender:'mulher',acknowledgement:true,requestId:randomUUID(),accessToken:'a'.repeat(64)};
test('partner input is optional, normalized and forwarded to the reservation',async()=>{
  assert.equal(buyer(person).partnerCode,undefined);
  assert.equal(buyer({...person,partnerCode:'   '}).partnerCode,undefined);
  assert.equal(buyer({...person,partnerCode:' maria10 '}).partnerCode,'MARIA10');
  for(const partnerCode of [null,{},'AB','<script>','A'.repeat(33)])assert.throws(()=>buyer({...person,partnerCode}));
  let payload;
  const service=paymentService({db:{async request(resource,options){payload=options.body;return {id:person.requestId,status:'cancelled',price_cents:4500};}},mp:{}});
  await service.create(buyer({...person,partnerCode:'maria10'}),'b'.repeat(64));assert.equal(payload.p_partner_code,'MARIA10');
});
test('only admins can create or pause partner codes',async()=>{
  const calls=[],password='p'.repeat(40);
  const handler=createAdmin({env:{ADMIN_PASSWORD:password},db:{async request(...args){calls.push(args);return [];}}});
  async function call(body,cookie=''){
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.data=JSON.parse(v);}};
    await handler({method:'POST',headers:{'content-type':'application/json',cookie},body},res);return res;
  }
  const partner={action:'savePartner',code:' maria10 ',name:'Maria',active:true};
  assert.equal((await call(partner)).statusCode,401);assert.equal(calls.length,0);
  const login=await call({action:'login',password}),cookie=login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call({...partner,code:'bad code'},cookie)).statusCode,400);
  assert.equal((await call({...partner,active:'false'},cookie)).statusCode,400);
  assert.equal((await call(partner,cookie)).statusCode,200);
  assert.deepEqual(calls[0][1].body,{code:'MARIA10',name:'Maria',active:true});
  assert.equal((await call({...partner,active:false},cookie)).statusCode,200);assert.equal(calls[1][1].body.active,false);
});
test('partner attribution persists atomically, validates active codes and counts paid orders only as revenue',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    for(const file of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    await db.exec("set role service_role; update public.ticket_products set sales_enabled=true; insert into public.partners(code,name) values('MARIA10','Maria'),('JOAO','João');");
    const reserve=async(code,id=randomUUID(),isTest=false)=>(await db.query('select public.reserve_checkout($1,$2,$3,$4,null,$5,$6,$7,2::smallint,$8) as value',[id,'a'.repeat(64),'Pessoa Teste',`${id}@example.com`,'mulher',id.padEnd(64,'a'),isTest,code])).rows[0].value;
    const order=await reserve(' maria10 ');assert.equal(order.partner_code,'MARIA10');assert.equal(order.price_cents,5000);
    assert.equal((await reserve('MARIA10',order.id)).id,order.id);
    await assert.rejects(reserve('JOAO',order.id),/request_conflict/);
    assert.equal((await reserve('')).partner_code,null);
    await assert.rejects(reserve('UNKNOWN'),/invalid_partner_code/);
    await db.exec("update public.partners set active=false where code='MARIA10'");
    await assert.rejects(reserve('MARIA10'),/invalid_partner_code/);
    assert.equal((await reserve('MARIA10',order.id)).partner_code,'MARIA10');
    await db.query("select public.apply_verified_payment($1,'ORDPARTNER','PAYPARTNER','paid','processed')",[order.id]);
    await reserve('JOAO');const sandbox=await reserve('JOAO',randomUUID(),true);
    await db.query("select public.apply_verified_payment($1,'ORDSANDBOX','PAYSANDBOX','paid','processed')",[sandbox.id]);
    let stats=(await db.query('select public.admin_partner_stats() as value')).rows[0].value;
    assert.equal(stats.find(p=>p.code==='MARIA10').paid,1);assert.equal(stats.find(p=>p.code==='MARIA10').revenue,5000);
    assert.equal(stats.find(p=>p.code==='JOAO').paid,0);assert.equal(stats.find(p=>p.code==='JOAO').pending,1);assert.equal(stats.find(p=>p.code==='JOAO').revenue,0);
    await db.query("select public.apply_verified_payment($1,'ORDPARTNER','PAYPARTNER','refunded','refunded')",[order.id]);
    stats=(await db.query('select public.admin_partner_stats() as value')).rows[0].value;assert.equal(stats.find(p=>p.code==='MARIA10').revenue,0);
    for(const role of ['anon','authenticated']){
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query('select * from public.partners'),/permission denied/);
      await assert.rejects(db.query('select public.admin_partner_stats()'),/permission denied/);
      await assert.rejects(reserve('JOAO'),/permission denied/);
    }
  }finally{await db.close();}
});
