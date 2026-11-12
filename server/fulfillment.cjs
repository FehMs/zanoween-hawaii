'use strict';
const {renderPurchaseEmail}=require('./purchase-email.cjs');
async function deliverPurchaseEmail(orderId,{db,env=process.env,fetchImpl=globalThis.fetch}) {
  const queued=await db.request('rpc/claim_purchase_email',{method:'POST',body:{p_order_id:orderId}});
  if(!queued)return;
  let messageId=null;
  try {
    const template=renderPurchaseEmail({fullName:queued.name,gender:queued.gender,priceCents:queued.price_cents,lot:queued.lot,entryToken:queued.entry_token,orderId:queued.order_id});
    const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`purchase/${queued.outbox_id}`},body:JSON.stringify({from:env.RESEND_FROM,to:[queued.email],...template}),signal:AbortSignal.timeout(15000),redirect:'error'});
    if(response.ok)messageId=(await response.json()).id||null;
  } catch { /* The outbox preserves the purchase and schedules a retry. */ }
  await db.request('rpc/finish_purchase_email',{method:'POST',body:{p_id:queued.outbox_id,p_attempt:queued.attempt,p_message_id:messageId}});
}
module.exports={deliverPurchaseEmail};
