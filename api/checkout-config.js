const {settings,json}=require('../server/checkout-common.cjs');
const {createSupabase}=require('../server/supabase.cjs');
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Método não permitido.' }); }
  let checkoutEnabled=false,products=[];
  if(settings().ready) {
    try{
      const db=createSupabase();
      const lots=await db.request('ticket_lots?lot=eq.1&select=capacity');
      const available=await db.request('ticket_products?lot=eq.1&sales_enabled=eq.true&select=gender,price_cents,capacity');
      products=available.filter(p=>lots[0]?.capacity||p.capacity).map(p=>({gender:p.gender,priceCents:p.price_cents}));
      checkoutEnabled=products.length>0;
    }catch{}
  }
  json(res, 200, { checkoutEnabled, products });
};
