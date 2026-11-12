const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {settings,buyer,cents}=require('../server/checkout-common.cjs');
const {createMercadoPago,verifyOrder,validSignature}=require('../server/mercado-pago.cjs');
const {createHandlers}=require('../server/checkout-handlers.cjs');
const {renderPurchaseEmail}=require('../server/purchase-email.cjs');
const id='0ef6ce9a-10b9-4c38-a6dc-99c2b272234f';
const local={id,provider_order_id:'ORDABC123',price_cents:4500,is_test:false};
const account={id:123,site_id:'MLB',tags:[]};
const remote=()=>({id:'ORDABC123',external_reference:id,user_id:'123',country_code:'BRA',total_amount:'45.00',total_paid_amount:'45.00',status:'processed',status_detail:'accredited',transactions:{payments:[{id:'PAYABC123',amount:'45.00',paid_amount:'45.00',status:'processed',status_detail:'accredited',payment_method:{id:'pix',type:'bank_transfer'}}]}});
const env={MERCADO_PAGO_ENVIRONMENT:'production',MERCADO_PAGO_WEBHOOK_SECRET:'webhook-test-key'};
test('exact cents and participant validation reject manipulated client values',()=>{
  assert.equal(cents('45.00'),4500);assert.equal(cents('45.001'),null);assert.equal(cents('4.5e1'),null);
  const person=buyer({fullName:'Pessoa Teste',email:'test@example.com',gender:'mulher',acknowledgement:true,requestId:id,accessToken:'a'.repeat(64),priceCents:1,status:'paid'});
  assert.equal(person.priceCents,undefined);assert.equal(person.status,undefined);
  assert.equal(settings({}).ready,false);
});
test('approval requires matching amount, recipient, reference, Pix method and environment',()=>{
  assert.equal(verifyOrder(remote(),local,account,env).status,'paid');
  for(const patch of [{user_id:'other'},{external_reference:'other'},{total_amount:'1.00'},{country_code:'ARG'},{id:'ORDOTHER'}]){
    assert.throws(()=>verifyOrder({...remote(),...patch},local,account,env));
  }
  const altered=remote();altered.transactions.payments[0].paid_amount='1.00';assert.throws(()=>verifyOrder(altered,local,account,env));
  const card=remote();card.transactions.payments[0].payment_method.id='visa';assert.throws(()=>verifyOrder(card,local,account,env));
  const pending=remote();pending.status='action_required';assert.equal(verifyOrder(pending,local,account,env).status,'pending');
  const partial=remote();partial.status_detail='partially_refunded';assert.equal(verifyOrder(partial,local,account,env).status,'refunded');
  assert.throws(()=>verifyOrder(remote(),local,{...account,tags:['test_user']},env));
});
test('webhook signature uses the signed ID and rejects tampering',()=>{
  const req={url:'/api/mercado-pago-webhook?data.id=ORDABC123&type=order',headers:{'x-request-id':'request-123'}};
  const ts='1781009491000';const signature=createHmac('sha256',env.MERCADO_PAGO_WEBHOOK_SECRET).update(`id:ordabc123;request-id:request-123;ts:${ts};`).digest('hex');
  req.headers['x-signature']=`ts=${ts},v1=${signature}`;
  assert.equal(validSignature(req,env.MERCADO_PAGO_WEBHOOK_SECRET),true);
  assert.equal(validSignature({...req,url:req.url.replace('ORDABC123','ORDOTHER')},env.MERCADO_PAGO_WEBHOOK_SECRET),false);
  assert.equal(validSignature({...req,headers:{}},env.MERCADO_PAGO_WEBHOOK_SECRET),false);
});
test('Mercado Pago creation uses a fixed idempotency key and server price, without CPF',async()=>{
  let created;
  const mp=createMercadoPago({env:{...env,MERCADO_PAGO_ACCESS_TOKEN:'test-only'},fetchImpl:async(url,options)=>{
    if(url.endsWith('/users/me'))return {ok:true,json:async()=>account};
    created=options;return {ok:true,json:async()=>({id:'ORDABC123'})};
  }});
  await mp.create({...local,email:'test@example.com'});
  const data=JSON.parse(created.body);assert.equal(data.total_amount,'45.00');assert.equal(data.payer.identification,undefined);assert.equal(data.transactions.payments[0].expiration_time,'PT30M');assert.equal(created.headers['X-Idempotency-Key'],id);
});
test('closed checkout and forged webhook never reach the database',async()=>{
  const handlers=createHandlers({env:{},db:{request(){throw new Error('Unexpected database access');}}});
  const response=()=>({setHeader(){},end(value){this.value=JSON.parse(value);}});
  const checkout=response();await handlers.checkout({method:'POST',headers:{},body:{}},checkout);assert.equal(checkout.statusCode,503);
  const webhook=response();await handlers.webhook({method:'POST',url:'/',headers:{},body:{status:'paid'}},webhook);assert.equal(webhook.statusCode,401);
});

test('production checkout refuses sandbox accounts and historical test records',async()=>{
  let posts=0;
  const mp=createMercadoPago({env:{...env,MERCADO_PAGO_ACCESS_TOKEN:'fixture'},fetchImpl:async(url)=>{if(!url.endsWith('/users/me'))posts++;return {ok:true,json:async()=>({id:1,site_id:'MLB',tags:['test_user']})};}});
  await assert.rejects(mp.create({...local,email:'buyer@example.com'}),/conta de teste/);assert.equal(posts,0);
  assert.throws(()=>verifyOrder(remote(),{...local,is_test:true},account,env),/registro/);
  assert.equal(settings({...env,MERCADO_PAGO_ENVIRONMENT:'test'}).ready,false);
});
test('real confirmation includes the unique ticket and no test confirmation',()=>{
  const message=renderPurchaseEmail({fullName:'Pessoa Teste',gender:'homem',priceCents:5000,lot:1,entryToken:id,orderId:id});
  assert.ok(!message.subject.includes('[TESTE]'));assert.match(message.html,/PAGAMENTO CONFIRMADO/);assert.ok(message.html.includes(id));assert.ok(!message.html.includes('SEM VALIDADE PARA ENTRADA'));
});
