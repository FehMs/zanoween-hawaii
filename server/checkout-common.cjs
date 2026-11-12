'use strict';
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = text => createHash('sha256').update(text).digest('hex');
const equal = (a,b) => typeof a==='string' && typeof b==='string' && timingSafeEqual(Buffer.from(hash(a),'hex'),Buffer.from(hash(b),'hex'));
function fail(status, message) { const error=new Error(message); error.httpStatus=status; throw error; }
function settings(env=process.env) {
  let origin;
  try { const url=new URL(env.APP_URL); if(url.protocol==='https:' && url.pathname==='/' && !url.search && !url.hash && !url.username && !url.password) origin=url.origin; } catch {}
  const production=env.MERCADO_PAGO_ENVIRONMENT==='production';
  const ready=env.CHECKOUT_ENABLED==='true' && origin && production &&
    env.MERCADO_PAGO_ACCESS_TOKEN && env.MERCADO_PAGO_WEBHOOK_SECRET && env.SUPABASE_URL && (env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY) &&
    env.RESEND_API_KEY && env.RESEND_FROM && !env.RESEND_FROM.includes('onboarding@resend.dev') &&
    env.CHECKOUT_HASH_SECRET?.length>=32 && env.CRON_SECRET?.length>=32 && env.CHECKIN_TOKEN?.length>=32;
  return { ready:Boolean(ready), origin, production };
}
function body(req) {
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) fail(415,'Formato inválido.');
  let data=req.body;
  if(typeof data==='string') { try{data=JSON.parse(data);}catch{fail(400,'Dados inválidos.');} }
  if(!data||typeof data!=='object'||Array.isArray(data)||JSON.stringify(data).length>8192) fail(400,'Dados inválidos.');
  return data;
}
function buyer(data) {
  const fullName=typeof data.fullName==='string'?data.fullName.trim():'';
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  const phone=typeof data.phone==='string'?data.phone.trim():'';
  if(fullName.length<3||fullName.length>120||/[\x00-\x1f\x7f]/.test(fullName)||email.length>160||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||phone.length>25||!['mulher','homem'].includes(data.gender)||data.acknowledgement!==true) fail(400,'Confira os dados do participante e a ciência sobre o RG.');
  if(!uuid.test(data.requestId||'')||typeof data.accessToken!=='string'||!/^[a-f0-9]{64}$/.test(data.accessToken)) fail(400,'Identificação da compra inválida. Atualize a página.');
  return {fullName,email,phone:phone||null,gender:data.gender,requestId:data.requestId,accessHash:hash(data.accessToken)};
}
function guardOrigin(req,env=process.env) {
  const origin=req.headers.origin;
  const allowed=settings(env).origin;
  if(origin && origin!==allowed && !(env.VERCEL!=='1'&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) fail(403,'Origem não autorizada.');
}
function ipHash(req,env=process.env) {
  const ip=env.VERCEL==='1'?String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim():req.socket?.remoteAddress||'local';
  return createHmac('sha256',env.CHECKOUT_HASH_SECRET).update(ip).digest('hex');
}
function cents(value) {
  if(!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [whole,fraction='']=String(value).split('.'); const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(amount)?amount:null;
}
function json(res,status,data) {res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
function handleError(res,error) {
  const map={sold_out:[409,'Ingressos indisponíveis nesta categoria.'],sales_closed:[409,'As vendas ainda não estão abertas.'],capacity_missing:[503,'O lote ainda não está disponível.'],too_many_requests:[429,'Muitas tentativas. Aguarde 15 minutos.'],request_conflict:[409,'Esta tentativa já foi usada com outros dados. Inicie uma nova compra.'],ticket_already_used:[409,'Este ingresso já foi utilizado.'],invalid_ticket:[404,'Ingresso inválido ou cancelado.']};
  const [status,message]=map[error.reason]||[error.httpStatus||503,error.httpStatus?error.message:'Não foi possível concluir agora. Tente novamente com a mesma compra.'];
  json(res,status,{error:message});
}
module.exports={uuid,hash,equal,fail,settings,body,buyer,guardOrigin,ipHash,cents,json,handleError};
