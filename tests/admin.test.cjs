const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createAdmin}=require('../server/admin.cjs');
const {defaults,validateContent}=require('../server/site-content.cjs');
test('admin auth, session, CSRF, validation and login throttling',async()=>{
  let time=Date.now(),calls=[];
  const env={ADMIN_PASSWORD:'a'.repeat(40),APP_URL:'https://example.com',VERCEL:'1'};
  const handler=createAdmin({env,now:()=>time,db:{async request(...args){calls.push(args);return {lots:[],content:{}};}}});
  async function call(body,cookie='',extra={}){
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.data=JSON.parse(value);}};
    await handler({method:body?'POST':'GET',headers:{'content-type':'application/json',origin:env.APP_URL,cookie,...extra},body},res);return res;
  }
  assert.equal((await call()).statusCode,401);assert.equal(calls.length,0);
  assert.equal((await call({action:'saveLot'})).statusCode,401);
  const login=await call({action:'login',password:env.ADMIN_PASSWORD});assert.equal(login.statusCode,200);
  const cookie=login.headers['Set-Cookie'].split(';')[0];assert.match(login.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);assert.match(login.headers['Set-Cookie'],/Secure/);
  assert.equal((await call(null,cookie)).statusCode,200);
  assert.equal((await call(null,cookie+'bad')).statusCode,401);
  assert.equal((await call({action:'saveContent',content:defaults},cookie,{origin:'https://evil.example'})).statusCode,403);
  assert.equal((await call({action:'saveLot',lot:2,capacity:30,femalePrice:5000,malePrice:5500,enabled:true},cookie)).statusCode,200);
  assert.equal(calls.at(-1)[0],'rpc/admin_save_lot');
  assert.equal((await call({action:'saveLot',lot:4,capacity:30,femalePrice:1,malePrice:1,enabled:true},cookie)).statusCode,400);
  assert.equal((await call({action:'saveContent',content:{...defaults,whatsappUrl:'javascript:alert(1)'}},cookie)).statusCode,400);
  assert.equal((await call({action:'saveContent',content:defaults},cookie)).statusCode,200);
  const logout=await call({action:'logout'},cookie);assert.match(logout.headers['Set-Cookie'],/Max-Age=0/);
  time+=8*3600000+1;assert.equal((await call(null,cookie)).statusCode,401);
  for(let i=0;i<5;i++)assert.equal((await call({action:'login',password:'wrong'})).statusCode,401);
  assert.equal((await call({action:'login',password:env.ADMIN_PASSWORD})).statusCode,429);
  time+=900001;assert.equal((await call({action:'login',password:env.ADMIN_PASSWORD})).statusCode,200);
  assert.equal(validateContent({...defaults,eventDate:'2026-02-30'}),null);
});
test('admin migration: lots 2/3, frozen prices, inventory constraints and database permissions',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    for(const file of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    await db.exec('set role service_role');
    const reserve=async(lot,id=randomUUID())=>(await db.query('select public.reserve_checkout($1,$2,$3,$4,$5,$6,$7,false,$8) as value',[id,'a'.repeat(64),'Pessoa Teste',`${id}@example.com`,null,'mulher',id.padEnd(64,'a'),lot])).rows[0].value;
    const save=(lot,capacity,price,enabled)=>db.query('select public.admin_save_lot($1,$2,$3,6000,$4)',[lot,capacity,price,enabled]);
    await assert.rejects(reserve(2),/sales_closed/);
    await save(2,1,5200,true);const order=await reserve(2);assert.equal(order.price_cents,5200);
    await assert.rejects(reserve(2),/sold_out/);
    await save(2,2,5300,true);assert.equal((await reserve(2,order.id)).price_cents,5200);
    await reserve(2);await assert.rejects(save(2,1,5400,true),/capacity_below_reserved/);
    await save(2,2,5400,false);await assert.rejects(reserve(2),/sales_closed/);
    await save(3,20,5500,true);assert.equal((await reserve(3)).price_cents,5500);
    const overview=(await db.query('select public.admin_dashboard() as value')).rows[0].value;
    assert.equal(overview.lots[1].pending,2);assert.equal(overview.lots[2].pending,1);
    await assert.rejects(reserve(4),/sales_closed/);
    for(const role of ['anon','authenticated']){
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query('select * from public.site_settings'),/permission denied/);
      await assert.rejects(db.query('select public.admin_dashboard()'),/permission denied/);
      await assert.rejects(save(2,1,5000,true),/permission denied/);
    }
  }finally{await db.close();}
});
