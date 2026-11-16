'use strict';
const {randomUUID}=require('node:crypto');
const {getConfig}=require('./supabase.cjs');
const {fail}=require('./checkout-common.cjs');
const BUCKET='event-gallery';
const MAX_PHOTOS=60,MAX_IMAGE=2*1024*1024,ADMIN_BODY_LIMIT=3*1024*1024;
async function updateSettings(db,change){
  // Compare-and-swap prevents an upload from overwriting a simultaneous text edit.
  for(let attempt=0;attempt<4;attempt++){
    const rows=await db.request('site_settings?id=eq.1&select=content');
    if(!Array.isArray(rows)||!rows[0])fail(503,'As configurações do site não estão disponíveis.');
    const before=rows[0].content||{};
    const revision=before._revision??0;
    if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)fail(503,'Não foi possível verificar a versão das configurações.');
    const content={...change(structuredClone(before)),_revision:revision+1};
    const condition=before._revision==null?'is.null':`eq.${revision}`;
    const updated=await db.request(`site_settings?id=eq.1&content->>_revision=${condition}`,{method:'PATCH',body:{content},prefer:'return=representation'});
    if(updated?.length)return content;
  }
  fail(409,'Outra alteração foi salva ao mesmo tempo. Tente novamente.');
}
function photoFields(data){
  const result={};
  for(const [key,min,max]of [['title',1,90],['caption',0,280],['alt',1,180]]){
    if(typeof data[key]!=='string')fail(400,'Preencha o título e a descrição da foto.');
    const text=data[key].trim();
    if(text.length<min||text.length>max||/[\x00-\x1f\x7f]/.test(text))fail(400,'Confira o tamanho dos textos da foto.');
    result[key]=text;
  }
  if(typeof data.published!=='boolean'||!['cover','contain'].includes(data.fit))fail(400,'Confira a publicação e o enquadramento da foto.');
  return {...result,published:data.published,fit:data.fit};
}
function decodeImage(data){
  if(!['image/jpeg','image/png','image/webp'].includes(data.mime)||typeof data.image!=='string'||data.image.length>Math.ceil(MAX_IMAGE/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.image))fail(400,'Envie uma imagem JPG, PNG ou WebP de até 2 MB.');
  const bytes=Buffer.from(data.image,'base64');
  const valid=bytes.length>=24&&bytes.length<=MAX_IMAGE&&(
    data.mime==='image/jpeg'&&bytes.subarray(0,3).equals(Buffer.from([255,216,255]))||
    data.mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
    data.mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
  );
  if(!valid)fail(400,'O arquivo não é uma imagem válida.');
  return bytes;
}
function createGalleryStorage({env=process.env,fetchImpl=globalThis.fetch}={}){
  const {url,key}=getConfig(env);
  const headers={apikey:key};if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
  async function request(path,options={}){
    return fetchImpl(`${url}/storage/v1/${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(20000),redirect:'error'});
  }
  return {
    async prepare(){
      const existing=await request(`bucket/${BUCKET}`);
      if(existing.ok){const bucket=await existing.json();if(bucket.public!==true)fail(503,'O bucket event-gallery precisa ser público para exibir as fotos.');return;}
      if(existing.status!==404&&existing.status!==400)fail(503,'Não foi possível acessar o armazenamento de fotos.');
      const created=await request('bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:BUCKET,name:BUCKET,public:true,file_size_limit:MAX_IMAGE,allowed_mime_types:['image/jpeg','image/png','image/webp']})});
      if(!created.ok){const retry=await request(`bucket/${BUCKET}`);if(!retry.ok||(await retry.json()).public!==true)fail(503,'Não foi possível preparar o armazenamento de fotos.');}
    },
    async upload(id,bytes,mime){
      const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
      const path=`photos/${id}.${extension}`;
      const response=await request(`object/${BUCKET}/${path}`,{method:'POST',headers:{'Content-Type':mime,'Cache-Control':'max-age=31536000','x-upsert':'false'},body:bytes});
      if(!response.ok)fail(503,'Não foi possível enviar a foto. Tente novamente.');
      return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
    },
    async discard(id,mime){
      const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
      await request(`object/${BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[`photos/${id}.${extension}`]})});
    }
  };
}
function publicGallery(content){
  return (Array.isArray(content?.gallery)?content.gallery:[]).filter(p=>p.published===true).map(({id,url,title,caption,alt,fit})=>({id,url,title,caption,alt,fit}));
}
async function manageGallery(data,{db,env=process.env,storage}){
  if(data.action==='uploadPhoto'){
    const fields=photoFields(data),bytes=decodeImage(data);
    const current=await db.request('site_settings?id=eq.1&select=content');
    if((current[0]?.content?.gallery||[]).length>=MAX_PHOTOS)fail(400,'A galeria aceita até 60 fotos.');
    storage ||= createGalleryStorage({env});await storage.prepare();
    const id=randomUUID(),url=await storage.upload(id,bytes,data.mime);
    try{await updateSettings(db,content=>{
      const gallery=content.gallery||[];if(gallery.length>=MAX_PHOTOS)fail(400,'A galeria aceita até 60 fotos.');
      return {...content,gallery:[...gallery,{id,url,...fields}]};
    });}catch(error){try{await storage.discard(id,data.mime);}catch{}throw error;}
    return {id};
  }
  await updateSettings(db,content=>{
    const gallery=content.gallery||[],index=gallery.findIndex(p=>p.id===data.id);
    if(index<0)fail(404,'Foto não encontrada. Recarregue a galeria.');
    if(data.action==='savePhoto')gallery[index]={...gallery[index],...photoFields(data)};
    else if(data.action==='movePhoto'){
      if(![-1,1].includes(data.direction))fail(400,'Ordem inválida.');
      const target=index+data.direction;
      if(target>=0&&target<gallery.length)[gallery[index],gallery[target]]=[gallery[target],gallery[index]];
    }else fail(400,'Ação inválida.');
    return {...content,gallery};
  });
  return {};
}
module.exports={updateSettings,photoFields,decodeImage,createGalleryStorage,publicGallery,manageGallery,ADMIN_BODY_LIMIT};
