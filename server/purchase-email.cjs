'use strict';
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {uuid}=require('./checkout-common.cjs');
const bannerContentId='zanoween-email-banner';
let bannerBase64;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function renderPurchaseEmail({fullName,gender,priceCents,lot=1,entryToken,orderId}){
  if(!uuid.test(entryToken||'')||!uuid.test(orderId||'')||!['mulher','homem'].includes(gender)||!Number.isSafeInteger(priceCents)||priceCents<=0||!Number.isInteger(lot)||lot<1||lot>3)throw new Error('Invalid ticket information');
  bannerBase64 ||= readFileSync(join(__dirname,'assets','email-banner.png')).toString('base64');
  const name=escapeHtml(fullName),category=gender==='mulher'?'Mulher':'Homem';
  const price=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(priceCents/100);
  return {
    subject:'Seu ingresso Zanoween · Hawaii Edition está confirmado!',
    attachments:[{filename:'zanoween-banner.png',content:bannerBase64,content_id:bannerContentId}],
    html:`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4eee7;font-family:Arial,sans-serif;color:#201a16;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdfa;border-radius:20px;overflow:hidden;">
<tr><td style="padding:0;background:#71300c;font-size:0;line-height:0;"><img src="cid:${bannerContentId}" width="640" height="240" alt="Zanoween 2K26 — Hawaii Edition" style="display:block;width:100%;max-width:640px;height:auto;border:0;border-radius:20px 20px 0 0;"></td></tr>
<tr><td style="padding:28px;"><p style="margin:0 0 20px;padding:12px;background:#fff0df;border:1px solid #edc89e;border-radius:8px;font-size:12px;line-height:1.6;"><strong>PAGAMENTO CONFIRMADO · INGRESSO NOMINAL</strong><br>Seu Pix foi confirmado. Guarde este e-mail para apresentar na entrada.</p>
<h1 style="margin:0 0 16px;font-size:25px;">A vibe começa aqui, ${name}.</h1><p style="font-size:15px;line-height:1.7;">Seu lugar no Hawaii Edition está garantido. Confira os dados do seu ingresso.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2ec;border-radius:12px;font-size:14px;">
<tr><td style="padding:18px 18px 8px;">Participante</td><td style="padding:18px 18px 8px;text-align:right;overflow-wrap:anywhere;"><strong>${name}</strong></td></tr>
<tr><td style="padding:8px 18px;">Ingresso</td><td style="padding:8px 18px;text-align:right;">${lot}º lote · ${category}</td></tr>
<tr><td style="padding:8px 18px;">Valor pago</td><td style="padding:8px 18px;text-align:right;"><strong>${price}</strong></td></tr>
<tr><td style="padding:8px 18px 18px;">Pagamento</td><td style="padding:8px 18px 18px;text-align:right;">Pix confirmado</td></tr></table>
<p style="margin:24px 0 8px;font-size:13px;"><strong>Código único do ingresso</strong></p><p style="padding:18px;border:1px dashed #ff5a17;border-radius:10px;font-family:monospace;font-size:16px;word-break:break-all;">${entryToken}</p><p style="color:#6c5d50;font-size:11px;line-height:1.7;">Uso único. Não compartilhe este código. Pedido: ${orderId}</p>
<p style="margin:24px 0 8px;font-size:15px;"><strong>12.12.26 · Espaço Limão</strong></p><p style="margin:0 0 24px;color:#6c5d50;font-size:13px;line-height:1.7;">O endereço completo será enviado pela organização antes do evento.</p>
<p style="padding:16px;border-left:3px solid #ff5a17;background:#fff4e9;font-size:13px;line-height:1.7;"><strong>Seu nome, seu ingresso.</strong><br>A entrada só será liberada mediante apresentação do RG, com nome correspondente ao do ingresso.</p>
<p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:#6c5d50;">Apresente o código deste ingresso e seu RG à equipe de entrada. O código será validado uma única vez.</p></td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #eee4d8;color:#8a7765;font-size:11px;">Zanoween · Hawaii Edition</td></tr></table></td></tr></table></body></html>`,
    text:`ZANOWEEN — HAWAII EDITION\nPAGAMENTO CONFIRMADO\n\nOlá, ${fullName}.\n1 ingresso · ${lot}º lote · ${category}\nValor pago: ${price} via Pix\nCódigo único: ${entryToken}\nPedido: ${orderId}\n12.12.26 · Espaço Limão\nApresente este código e seu RG com nome correspondente ao ingresso. Uso único. O endereço completo será enviado pela organização antes do evento.`
  };
}
module.exports={renderPurchaseEmail};
