'use strict';
const {hash,equal,fail,uuid}=require('./checkout-common.cjs');
const {verifyOrder}=require('./mercado-pago.cjs');
const {deliverPurchaseEmail}=require('./fulfillment.cjs');
function paymentService({db,mp,env=process.env,fetchImpl=globalThis.fetch}) {
  async function lookup(id) {return (await db.request(`orders?id=eq.${id}&select=*`))[0];}
  async function sync(local,remote) {
    if(local.is_test)fail(404,'Compra não encontrada.');
    remote ||= await mp.get(local.provider_order_id);
    const verified=verifyOrder(remote,local,await mp.account(),env);
    const pix=remote.transactions?.payments?.[0]?.payment_method||{};
    await db.request(`orders?id=eq.${local.id}`,{method:'PATCH',body:{provider_order_id:remote.id,pix_code:pix.qr_code||local.pix_code||null,pix_image:pix.qr_code_base64||local.pix_image||null}});
    await db.request('rpc/apply_verified_payment',{method:'POST',body:{p_id:local.id,p_provider_order:remote.id,p_payment_id:verified.paymentId,p_status:verified.status,p_provider_status:verified.providerStatus}});
    if(verified.status==='paid'&&env.MERCADO_PAGO_ENVIRONMENT==='production') {
      // Email failure never rolls back an approved purchase or prevents displaying its code.
      try{await deliverPurchaseEmail(local.id,{db,env,fetchImpl});}catch{}
    }
    return lookup(local.id);
  }
  async function view(local) {
    const result={id:local.id,status:local.status,priceCents:local.price_cents,expiresAt:local.expires_at,pixCode:local.status==='pending'?local.pix_code:null,pixImage:local.status==='pending'?local.pix_image:null};
    if(local.status==='paid'&&!local.is_test) {
      const tickets=await db.request(`tickets?order_id=eq.${local.id}&revoked_at=is.null&select=entry_token`);
      result.ticketCode=tickets[0]?.entry_token;
      const mail=await db.request(`email_outbox?order_id=eq.${local.id}&select=status`);
      result.emailStatus=mail[0]?.status||'pending';
    }
    return result;
  }
  async function reconcile(local) {
    if(!local.provider_order_id && local.status==='pending') {
      // Keep the reservation on ambiguous API failures: an order may already exist.
      // Repeating this call uses the original provider idempotency key.
      const created=await mp.create(local);
      if(!/^ORD[A-Z0-9]+$/i.test(created.id||''))fail(502,'Não foi possível confirmar a criação do Pix. Tente novamente.');
      await db.request(`orders?id=eq.${local.id}`,{method:'PATCH',body:{provider_order_id:created.id}});
      local.provider_order_id=created.id;
    }
    return local.provider_order_id?sync(local):local;
  }
  return {
    lookup,sync,view,reconcile,
    async create(participant,ipHash) {
      let local=await db.request('rpc/reserve_checkout',{method:'POST',body:{p_id:participant.requestId,p_access_hash:participant.accessHash,p_name:participant.fullName,p_email:participant.email,p_phone:participant.phone,p_gender:participant.gender,p_ip_hash:ipHash,p_is_test:false}});
      if(local.status!=='pending')return view(local);
      local=await reconcile(local);
      return view(local);
    },
    async status(id,token) {
      if(!uuid.test(id||'')||! /^[a-f0-9]{64}$/.test(token||''))fail(404,'Compra não encontrada.');
      let local=await lookup(id);
      if(!local||local.is_test||!equal(local.access_token_hash,hash(token)))fail(404,'Compra não encontrada.');
      if(local.status==='pending')local=await reconcile(local);
      else if(local.provider_order_id)local=await sync(local);
      return view(local);
    }
  };
}
module.exports={paymentService};
