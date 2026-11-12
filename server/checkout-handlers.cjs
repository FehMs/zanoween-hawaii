'use strict';
const {createSupabase}=require('./supabase.cjs');
const {createMercadoPago,validSignature}=require('./mercado-pago.cjs');
const {paymentService}=require('./payment-service.cjs');
const {deliverPurchaseEmail}=require('./fulfillment.cjs');
const common=require('./checkout-common.cjs');
function createHandlers({env=process.env,db,mp,fetchImpl=globalThis.fetch}={}) {
  const deps=()=>{db ||= createSupabase({env,fetchImpl});mp ||= createMercadoPago({env,fetchImpl});return {db,mp,env,fetchImpl};};
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){common.handleError(res,error);}};
  function method(req,res,allowed) {if(req.method!==allowed){res.setHeader('Allow',allowed);common.fail(405,'Método não permitido.');}}
  return {
    checkout:wrap(async(req,res)=>{
      method(req,res,'POST');common.guardOrigin(req,env);
      if(!common.settings(env).ready)common.fail(503,'As vendas ainda não estão disponíveis.');
      const participant=common.buyer(common.body(req));
      const service=paymentService(deps());
      common.json(res,200,await service.create(participant,common.ipHash(req,env)));
    }),
    status:wrap(async(req,res)=>{
      method(req,res,'POST');common.guardOrigin(req,env);
      const data=common.body(req),service=paymentService(deps());
      common.json(res,200,await service.status(data.id,data.accessToken));
    }),
    webhook:wrap(async(req,res)=>{
      method(req,res,'POST');
      if(!validSignature(req,env.MERCADO_PAGO_WEBHOOK_SECRET))common.fail(401,'Assinatura inválida.');
      const url=new URL(req.url,'https://local.invalid');
      if(url.searchParams.get('type')!=='order')return common.json(res,200,{ignored:true});
      const {db,mp}=deps(),remote=await mp.get(url.searchParams.get('data.id'));
      if(!common.uuid.test(remote.external_reference||''))return common.json(res,200,{ignored:true});
      const service=paymentService(deps());const local=await service.lookup(remote.external_reference);
      if(!local||local.is_test)return common.json(res,200,{ignored:true});
      // The notification body is not used as proof of payment.
      local.provider_order_id ||= remote.id;
      await service.sync(local,remote);
      await db.request('payment_events?on_conflict=provider_event_id',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:{provider_event_id:`${remote.id}:${req.headers['x-request-id']}`,order_id:local.id,status:'processed',processed_at:new Date().toISOString()}});
      common.json(res,200,{received:true});
    }),
    jobs:wrap(async(req,res)=>{
      method(req,res,'GET');
      if(!env.CRON_SECRET||env.CRON_SECRET.length<32||!common.equal(req.headers.authorization,`Bearer ${env.CRON_SECRET}`))common.fail(401,'Acesso não autorizado.');
      const start=Date.now(),{db}=deps(),service=paymentService(deps());let processed=0;
      const pending=await db.request('orders?status=eq.pending&is_test=eq.false&order=created_at.asc&limit=3');
      for(const local of pending) {
        if(Date.now()-start>35000)break;
        try{await service.reconcile(local);processed++;}catch{}
      }
      const now=encodeURIComponent(new Date().toISOString());
      const emails=await db.request(`email_outbox?status=neq.sent&attempts=lt.10&next_attempt_at=lte.${now}&or=(locked_until.is.null,locked_until.lt.${now})&orders.is_test=eq.false&order=created_at.asc&limit=5&select=order_id,orders!inner(is_test)`);
      for(const item of emails) {
        if(Date.now()-start>45000)break;
        try{await deliverPurchaseEmail(item.order_id,deps());}catch{}
      }
      common.json(res,200,{processed});
    }),
    checkin:wrap(async(req,res)=>{
      method(req,res,'POST');common.guardOrigin(req,env);
      if(!env.CHECKIN_TOKEN||env.CHECKIN_TOKEN.length<32||!common.equal(req.headers['x-checkin-token'],env.CHECKIN_TOKEN))common.fail(401,'Código da equipe inválido.');
      const data=common.body(req);
      if(!common.uuid.test(data.ticketCode||''))common.fail(400,'Código de ingresso inválido.');
      const {db}=deps();
      if(data.confirm===true) {
        if(data.rgChecked!==true)common.fail(400,'Confira o nome no RG antes de liberar a entrada.');
        const admitted=await db.request('rpc/admit_ticket',{method:'POST',body:{p_token:data.ticketCode}});
        return common.json(res,200,admitted);
      }
      const ticket=(await db.request(`tickets?entry_token=eq.${data.ticketCode}&select=order_id,checked_in_at,revoked_at`))[0];
      if(!ticket||ticket.revoked_at)common.fail(404,'Ingresso inválido ou cancelado.');
      const order=(await db.request(`orders?id=eq.${ticket.order_id}&status=eq.paid&is_test=eq.false&select=full_name`))[0];
      if(!order)common.fail(404,'Ingresso inválido ou cancelado.');
      common.json(res,200,{name:order.full_name,used:Boolean(ticket.checked_in_at)});
    })
  };
}
module.exports={createHandlers};
