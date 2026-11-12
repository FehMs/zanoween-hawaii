const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHmac}=require('node:crypto');
const {createHandlers}=require('../server/checkout-handlers.cjs');
test('checkout flow with real local PostgreSQL and simulated payment/email providers',async t=>{
  const pg=new PGlite();
  try{
    await pg.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    for(const file of ['202611120001_ticketing.sql','202611120002_checkout.sql'])await pg.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    await pg.exec('update public.ticket_lots set capacity=1 where lot=1; update public.ticket_products set sales_enabled=true where lot=1; set role service_role;');
    // Translate only our own repository calls to SQL, keeping transactions inside PostgreSQL.
    const db={async request(resource,{method='GET',body,prefer=''}={}){
      const [table,query='']=resource.split('?'),params=new URLSearchParams(query);
      if(table.startsWith('rpc/')){
        const names=Object.keys(body),args=names.map((name,i)=>`${name} => $${i+1}`).join(',');
        return (await pg.query(`select public.${table.slice(4)}(${args}) as value`,Object.values(body))).rows[0].value;
      }
      const values=[],conditions=[];
      for(const [key,filter]of params){
        if(['select','on_conflict','order','limit'].includes(key))continue;
        const dot=filter.indexOf('.'),op=filter.slice(0,dot),value=filter.slice(dot+1);
        if(op==='is'&&value==='null'){conditions.push(`${key} is null`);continue;}
        assert.ok(op==='eq');values.push(value);conditions.push(`${key}=$${values.length}`);
      }
      const where=conditions.length?' where '+conditions.join(' and '):'';
      if(method==='GET')return (await pg.query(`select ${params.get('select')||'*'} from public.${table}${where}`,values)).rows;
      if(method==='PATCH'){
        const updates=Object.keys(body).map(key=>{values.push(body[key]);return `${key}=$${values.length}`;});
        await pg.query(`update public.${table} set ${updates.join(',')}${where}`,values);return null;
      }
      const columns=Object.keys(body),positions=columns.map((_,i)=>'$'+(i+1));
      const conflict=params.get('on_conflict')?` on conflict (${params.get('on_conflict')}) do nothing`:'';
      return (await pg.query(`insert into public.${table}(${columns.join(',')}) values(${positions.join(',')})${conflict} returning *`,Object.values(body))).rows;
    }};
    const env={CHECKOUT_ENABLED:'true',APP_URL:'https://example.com',MERCADO_PAGO_ENVIRONMENT:'production',MERCADO_PAGO_ACCESS_TOKEN:'mock',MERCADO_PAGO_WEBHOOK_SECRET:'webhook-only',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'mock',RESEND_API_KEY:'mock',RESEND_FROM:'Zanoween <ingressos@example.com>',CHECKOUT_HASH_SECRET:'h'.repeat(32),CRON_SECRET:'c'.repeat(32),CHECKIN_TOKEN:'s'.repeat(32)};
    const id=randomUUID(),token='a'.repeat(64);let state='pending',sendAttempts=0,createCalls=0;
    const mp={async account(){return {id:123,tags:[]};},async create(){createCalls++;return {id:'ORDTEST1'};},async get(){return {id:'ORDTEST1',external_reference:id,user_id:'123',country_code:'BRA',total_amount:'45.00',total_paid_amount:state==='paid'?'45.00':'0.00',status:state==='paid'?'processed':state==='refunded'?'refunded':'action_required',status_detail:state==='paid'?'accredited':state==='refunded'?'refunded':'waiting_transfer',transactions:{payments:[{id:'PAYTEST1',amount:'45.00',paid_amount:state==='paid'?'45.00':'0.00',status:state==='paid'?'processed':state==='refunded'?'refunded':'action_required',status_detail:state==='paid'?'accredited':state==='refunded'?'refunded':'waiting_transfer',payment_method:{id:'pix',type:'bank_transfer',qr_code:'PIX-CODE-TEST',qr_code_base64:'cGl4'}}]}};}};
    const handlers=createHandlers({env,db,mp,fetchImpl:async()=>{sendAttempts++;return sendAttempts===1?{ok:false,status:500}:{ok:true,json:async()=>({id:'email-accepted'})};}});
    const databaseRequest=db.request.bind(db);
    db.request=async(...args)=>{try{return await databaseRequest(...args);}catch(error){
      // PostgREST maps these PostgreSQL messages to the repository's safe reason codes.
      if(['sold_out','ticket_already_used','request_conflict','invalid_ticket'].includes(error.message))error.reason=error.message;
      throw error;
    }};
    async function call(handler,body,{headers={},url='/api/test'}={}){
      const res={setHeader(){},end(value){this.data=JSON.parse(value);}};
      await handler({method:'POST',body,url,headers:{'content-type':'application/json',...headers},socket:{remoteAddress:'local-test'}},res);return res;
    }
    const participant={requestId:id,accessToken:token,fullName:'Pessoa Teste',email:'tester@example.com',phone:'',gender:'mulher',acknowledgement:true,priceCents:1,status:'paid'};
    await t.test('create Pix uses database price and duplicate requests reuse the order',async()=>{
      const first=await call(handlers.checkout,participant);assert.equal(first.statusCode,200);assert.equal(first.data.status,'pending');assert.equal(first.data.priceCents,4500);assert.equal(first.data.pixCode,'PIX-CODE-TEST');assert.equal(first.data.ticketCode,undefined);
      const repeat=await call(handlers.checkout,participant);assert.equal(repeat.statusCode,200);assert.equal(createCalls,1);
      const sold=await call(handlers.checkout,{...participant,requestId:randomUUID(),email:'second@example.com'});assert.equal(sold.statusCode,409);
    });
    const url='/api/mercado-pago-webhook?data.id=ORDTEST1&type=order',ts='1781009491000';
    const signature=createHmac('sha256',env.MERCADO_PAGO_WEBHOOK_SECRET).update(`id:ordtest1;request-id:request1;ts:${ts};`).digest('hex');
    const webhook=()=>call(handlers.webhook,{status:'paid'},{url,headers:{'x-request-id':'request1','x-signature':`ts=${ts},v1=${signature}`}});
    await t.test('forged body cannot approve an unpaid order even with a valid signed ID',async()=>{
      assert.equal((await webhook()).statusCode,200);
      assert.equal(Number((await pg.query('select count(*) from public.tickets')).rows[0].count),0);
    });
    await t.test('approval issues a ticket even when email fails; repeat webhook does not duplicate',async()=>{
      state='paid';assert.equal((await webhook()).statusCode,200);assert.equal((await webhook()).statusCode,200);
      assert.equal(sendAttempts,1);assert.equal(Number((await pg.query('select count(*) from public.tickets')).rows[0].count),1);
      const status=await call(handlers.status,{id,accessToken:token});assert.equal(status.data.status,'paid');assert.ok(status.data.ticketCode);assert.equal(status.data.emailStatus,'failed');
      const denied=await call(handlers.status,{id,accessToken:'f'.repeat(64)});assert.equal(denied.statusCode,404);
    });
    await t.test('failed mail can retry without issuing another ticket',async()=>{
      await pg.exec("update public.email_outbox set next_attempt_at=now()-interval '1 minute'");
      const status=await call(handlers.status,{id,accessToken:token});assert.equal(status.data.emailStatus,'sent');assert.equal(sendAttempts,2);
      await call(handlers.status,{id,accessToken:token});assert.equal(sendAttempts,2);
    });
    await t.test('staff access, RG acknowledgement and one-use admission are enforced',async()=>{
      const ticketCode=(await call(handlers.status,{id,accessToken:token})).data.ticketCode;
      assert.equal((await call(handlers.checkin,{ticketCode})).statusCode,401);
      const headers={'x-checkin-token':env.CHECKIN_TOKEN};
      const checked=await call(handlers.checkin,{ticketCode},{headers});assert.equal(checked.data.name,'Pessoa Teste');
      assert.equal((await call(handlers.checkin,{ticketCode,confirm:true},{headers})).statusCode,400);
      assert.equal((await call(handlers.checkin,{ticketCode,confirm:true,rgChecked:true},{headers})).data.admitted,true);
      assert.equal((await call(handlers.checkin,{ticketCode,confirm:true,rgChecked:true},{headers})).statusCode,409);
      state='refunded';await webhook();assert.equal((await call(handlers.checkin,{ticketCode},{headers})).statusCode,404);
    });
  }finally{await pg.close();}
});
