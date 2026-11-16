const { createSupabase } = require('../server/supabase.cjs');
const { json } = require('../server/checkout-common.cjs');
const { defaults } = require('../server/site-content.cjs');
module.exports = async (req,res) => {
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return json(res,405,{error:'Método não permitido.'}); }
  try {
    const rows = await createSupabase().request('site_settings?id=eq.1&select=content');
    json(res,200,{...defaults,...rows[0]?.content});
  } catch { json(res,200,defaults); }
};
