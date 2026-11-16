const {createSupabase}=require('../server/supabase.cjs');
const {json}=require('../server/checkout-common.cjs');
const {publicGallery}=require('../server/gallery.cjs');
module.exports=async(req,res)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{error:'Método não permitido.'});}
  try{
    const [row]=await createSupabase().request('site_settings?id=eq.1&select=content');
    json(res,200,{photos:publicGallery(row?.content)});
  }catch{json(res,503,{error:'Não foi possível carregar as fotos agora.'});}
};
