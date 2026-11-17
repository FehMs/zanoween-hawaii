'use strict';
const { createHmac, randomBytes } = require('node:crypto');
const { createSupabase } = require('./supabase.cjs');
const common = require('./checkout-common.cjs');
const { defaults, validateContent } = require('./site-content.cjs');
const {updateSettings,manageGallery,ADMIN_BODY_LIMIT}=require('./gallery.cjs');
const COOKIE = 'zanoween_admin';
function createAdmin({ env = process.env, db, storage, now = Date.now } = {}) {
  const attempts = new Map();
  const sign = text => createHmac('sha256', env.ADMIN_PASSWORD).update('admin-session:' + text).digest('hex');
  const database = () => db ||= createSupabase({ env });
  function authorized(req) {
    const token = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
    const [expiry, nonce, signature] = token.split('.');
    return /^\d{13}$/.test(expiry || '') && /^[a-f0-9]{32}$/.test(nonce || '') && Number(expiry) > now() && Number(expiry) <= now() + 8 * 3600000 && common.equal(signature, sign(`${expiry}.${nonce}`));
  }
  function cookie(res, token, age) {
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${age}${env.VERCEL === '1' || env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  }
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); common.fail(405,'Método não permitido.'); }
      if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 32) common.fail(503,'Configure ADMIN_PASSWORD com pelo menos 32 caracteres no servidor.');
      if (req.method === 'POST') {
        common.guardOrigin(req, env);
        if (req.headers['sec-fetch-site'] === 'cross-site') common.fail(403,'Origem não autorizada.');
        const data = common.body(req,authorized(req)?ADMIN_BODY_LIMIT:8192);
        if (data.action === 'login') {
          const ip = env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] || 'unknown' : req.socket?.remoteAddress || 'local';
          for (const [key, entry] of attempts) if (entry.until <= now()) attempts.delete(key);
          const entry = attempts.get(ip) || { count: 0, until: now() + 900000 };
          if (entry.count >= 5) common.fail(429,'Muitas tentativas. Aguarde 15 minutos.');
          if (!common.equal(data.password, env.ADMIN_PASSWORD)) {
            entry.count++; if (attempts.size < 10000 || attempts.has(ip)) attempts.set(ip, entry);
            common.fail(401,'Senha incorreta.');
          }
          attempts.delete(ip);
          const value = `${now() + 8 * 3600000}.${randomBytes(16).toString('hex')}`;
          cookie(res, `${value}.${sign(value)}`, 8 * 3600);
          return common.json(res,200,{ok:true});
        }
        if (!authorized(req)) common.fail(401,'Entre para acessar o painel.');
        if (data.action === 'logout') { cookie(res,'',0); return common.json(res,200,{ok:true}); }
        if (['uploadPhoto','savePhoto','movePhoto','prepareVideo','completeVideo'].includes(data.action)) {
          return common.json(res,200,{ok:true,...await manageGallery(data,{db:database(),env,storage})});
        }
        if (data.action === 'saveLot') {
          const {lot,capacity,femalePrice,malePrice,enabled} = data;
          if (![1,2,3].includes(lot) || !Number.isInteger(capacity) || capacity < 1 || capacity > 100000 || ![femalePrice,malePrice].every(x => Number.isInteger(x) && x > 0 && x <= 10000000) || typeof enabled !== 'boolean') common.fail(400,'Confira a quantidade e os preços do lote.');
          await database().request('rpc/admin_save_lot',{method:'POST',body:{p_lot:lot,p_capacity:capacity,p_female_price:femalePrice,p_male_price:malePrice,p_enabled:enabled}});
        } else if (data.action === 'savePartner') {
          const code=typeof data.code==='string'?data.code.trim().toUpperCase():'';
          const name=typeof data.name==='string'?data.name.trim():'';
          if(!/^[A-Z0-9_-]{3,32}$/.test(code) || name.length<2 || name.length>120 || /[\x00-\x1f\x7f]/.test(name) || typeof data.active!=='boolean') common.fail(400,'Confira o nome e o código do parceiro.');
          await database().request('partners?on_conflict=code',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{code,name,active:data.active}});
        } else if (data.action === 'saveContent') {
          const content = validateContent(data.content);
          if (!content) common.fail(400,'Confira os textos, a data e o link do WhatsApp.');
          await updateSettings(database(),before=>({...before,...content}));
        } else common.fail(400,'Ação inválida.');
        return common.json(res,200,{ok:true});
      }
      if (!authorized(req)) common.fail(401,'Entre para acessar o painel.');
      const snapshot = await database().request('rpc/admin_dashboard',{method:'POST',body:{}});
      const partners=await database().request('rpc/admin_partner_stats',{method:'POST',body:{}});
      common.json(res,200,{...snapshot,partners,content:{...defaults,...snapshot.content},checkoutReady:common.settings(env).ready});
    } catch (error) {
      if (error.reason === 'capacity_below_reserved') return common.json(res,409,{error:'A quantidade não pode ser menor que os ingressos pagos e reservados.'});
      if (error.httpStatus) return common.json(res,error.httpStatus,{error:error.message});
      common.json(res,503,{error:'Não foi possível acessar o painel. Confira a conexão e execute as migrações de administração e parceiros no Supabase.'});
    }
  };
}
module.exports = { createAdmin };
