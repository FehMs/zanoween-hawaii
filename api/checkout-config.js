const {settings,json}=require('../server/checkout-common.cjs');
const {createSupabase}=require('../server/supabase.cjs');
module.exports = async (req,res) => {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{error:'Método não permitido.'});}
  let lots=[],products=[];const ready=settings().ready;
  try {
    const db=createSupabase();
    const [pools,items]=await Promise.all([db.request('ticket_lots?select=lot,capacity&order=lot.asc'),db.request('ticket_products?select=lot,gender,price_cents,sales_enabled')]);
    lots=pools.map(pool=>({lot:pool.lot,products:items.filter(p=>p.lot===pool.lot).map(p=>({gender:p.gender,priceCents:p.price_cents,enabled:Boolean(ready&&pool.capacity&&p.sales_enabled)}))}));
    products=(lots.find(l=>l.products.some(p=>p.enabled))?.products||[]).filter(p=>p.enabled);
  }catch{}
  json(res,200,{checkoutEnabled:products.length>0,products,lots});
};
