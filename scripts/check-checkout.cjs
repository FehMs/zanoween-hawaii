'use strict';
const {createSupabase}=require('../server/supabase.cjs');
const {createMercadoPago}=require('../server/mercado-pago.cjs');
const {settings}=require('../server/checkout-common.cjs');
(async()=>{
  const env=process.env,config=settings(env),issues=[];
  if(env.CHECKOUT_ENABLED!=='true')issues.push('CHECKOUT_ENABLED=false: vendas fechadas.');
  if(!config.origin)issues.push('Configure APP_URL com a URL HTTPS do site.');
  if(env.MERCADO_PAGO_ENVIRONMENT!=='production')issues.push('Defina MERCADO_PAGO_ENVIRONMENT=production.');
  if(config.production&&env.RESEND_FROM?.includes('onboarding@resend.dev'))issues.push('Verifique seu dominio no Resend e configure RESEND_FROM com seu remetente proprio.');
  const paymentKeys=['MERCADO_PAGO_ACCESS_TOKEN','MERCADO_PAGO_WEBHOOK_SECRET'];
  for(const key of [...paymentKeys,'RESEND_API_KEY','RESEND_FROM'])if(!env[key])issues.push(`Falta ${key}.`);
  for(const key of ['CHECKOUT_HASH_SECRET','CHECKIN_TOKEN','CRON_SECRET'])if((env[key]?.length||0)<32)issues.push(`Configure ${key} com pelo menos 32 caracteres.`);
  try{
    const account=await createMercadoPago().account();
    console.log('Credencial Mercado Pago: consulta autenticada OK.');
    if(config.production&&account.tags?.includes('test_user'))issues.push('Conta de teste nao pode abrir vendas de producao.');
  }catch{issues.push('Nao foi possivel validar o Access Token do Mercado Pago.');}
  try{
    const db=createSupabase();
    const lots=await db.request('ticket_lots?lot=eq.1&select=capacity');
    const products=await db.request('ticket_products?lot=eq.1&select=gender,price_cents,capacity,sales_enabled');
    await db.request('orders?select=id,access_token_hash,is_test,provider_order_id&limit=0');
    await db.request('email_outbox?select=locked_until,next_attempt_at&limit=0');
    if(!lots[0]?.capacity&&products.some(p=>!p.capacity))issues.push('Defina a quantidade total do 1o lote ou a quantidade de cada categoria no Supabase.');
    if(!products.some(p=>p.sales_enabled))issues.push('Os produtos do 1o lote estao com vendas desativadas no banco.');
    console.log('Estrutura Supabase do checkout: OK.');
  }catch(error){issues.push(error.message);}
  if(issues.length){console.log('Pendencias:\n'+issues.map(issue=>'- '+issue).join('\n'));process.exitCode=1;}
  else console.log('Configuracao pronta. Falta validar um pagamento completo no ambiente escolhido e confirmar o webhook no painel.');
  console.log('Nenhum pagamento ou registro foi criado por esta verificacao.');
})().catch(()=>{console.error('Nao foi possivel concluir a verificacao.');process.exitCode=1;});
