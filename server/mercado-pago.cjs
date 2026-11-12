'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const {fail,cents,settings}=require('./checkout-common.cjs');
function createMercadoPago({env=process.env,fetchImpl=globalThis.fetch}={}) {
  let identity;
  async function request(path,{method='GET',body,key}={}) {
    const token=env.MERCADO_PAGO_ACCESS_TOKEN;
    if(!token)fail(503,'Configure a credencial do ambiente de pagamento selecionado.');
    const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    if(key)headers['X-Idempotency-Key']=key;
    const response=await fetchImpl(`https://api.mercadopago.com${path}`,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok) {
      const error=new Error(response.status===429?'O Mercado Pago está ocupado. Aguarde e tente novamente.':'O Mercado Pago não concluiu a operação. Tente novamente com a mesma compra.');
      error.httpStatus=response.status===429?429:502;
      error.definitive=[400,401,403,422].includes(response.status);
      throw error;
    }
    return response.json();
  }
  return {
    async account() {
      if(!identity) {identity=await request('/users/me');if(identity.site_id!=='MLB')fail(503,'A conta de recebimento precisa ser brasileira.');}
      return identity;
    },
    async create(order) {
      assertAccountEnvironment(await this.account(),env);
      const amount=(order.price_cents/100).toFixed(2);
      return request('/v1/orders',{method:'POST',key:order.id,body:{type:'online',processing_mode:'automatic',external_reference:order.id,total_amount:amount,
        payer:{email:order.email},transactions:{payments:[{amount,payment_method:{id:'pix',type:'bank_transfer'},expiration_time:'PT30M'}]}}});
    },
    get(id) {if(!/^ORD[A-Z0-9]+$/i.test(id))fail(400,'Identificador de pagamento inválido.');return request(`/v1/orders/${id}`);}
  };
}
function assertAccountEnvironment(account,env) {
  const production=settings(env).production;
  if(!production)fail(503,'O checkout precisa estar configurado para produção.');
  const isTest=account.tags?.includes('test_user')===true;
  if(production&&isTest)fail(503,'A conta de teste não pode emitir ingressos de produção.');
}
function verifyOrder(remote,local,account,env=process.env) {
  const payment=remote.transactions?.payments?.[0];
  if(remote.id!==local.provider_order_id||remote.external_reference!==local.id||String(remote.user_id)!==String(account.id)||remote.country_code!=='BRA'||
    cents(remote.total_amount)!==local.price_cents||
    (remote.currency_id&&remote.currency_id!=='BRL')) fail(502,'O pagamento recebido não corresponde ao pedido.');
  assertAccountEnvironment(account,env);
  if(local.is_test)fail(404,'Este registro não é um ingresso de produção.');
  if(!payment&&['processing','created'].includes(remote.status))return {status:'pending',paymentId:null,providerStatus:remote.status};
  if(!payment||remote.transactions.payments.length!==1||cents(payment.amount)!==local.price_cents||payment.payment_method?.id!=='pix'||payment.payment_method.type!=='bank_transfer')fail(502,'A transação não corresponde ao Pix esperado.');
  let status='pending';
  if(remote.status==='processed'&&remote.status_detail==='accredited'&&payment.status==='processed'&&payment.status_detail==='accredited') {
    if(cents(payment.paid_amount??remote.total_paid_amount)!==local.price_cents)fail(502,'O valor pago não corresponde ao ingresso.');
    status='paid';
  } else if(['refunded','partially_refunded','charged_back'].includes(remote.status)||['refunded','partially_refunded','charged_back'].includes(payment.status)||remote.status_detail==='partially_refunded'||payment.status_detail==='partially_refunded') status='refunded';
  else if(remote.status==='expired'||payment.status==='expired'||(['failed','canceled','cancelled'].includes(remote.status)&&remote.status_detail==='expired'))status='expired';
  else if(['cancelled','canceled','failed'].includes(remote.status))status='cancelled';
  return {status,paymentId:payment.id,providerStatus:remote.status};
}
function validSignature(req,secret) {
  if(!secret)return false;
  const url=new URL(req.url,'https://local.invalid');
  const id=url.searchParams.get('data.id');const requestId=req.headers['x-request-id'];
  if(!id||!/^ORD[A-Z0-9]+$/i.test(id)||typeof requestId!=='string'||requestId.length>200)return false;
  const signature=String(req.headers['x-signature']||'');
  const parts=Object.fromEntries(signature.split(',').map(pair=>pair.trim().split('=')));
  if(!/^\d{10,16}$/.test(parts.ts||'')||! /^[a-f0-9]{64}$/i.test(parts.v1||''))return false;
  // Mercado Pago specifies lower-casing alphanumeric data.id in the manifest.
  const expected=createHmac('sha256',secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`).digest();
  return timingSafeEqual(expected,Buffer.from(parts.v1,'hex'));
}
module.exports={createMercadoPago,verifyOrder,validSignature};
