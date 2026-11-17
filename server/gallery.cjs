'use strict';
const {randomUUID,createHmac,timingSafeEqual}=require('node:crypto');
const {getConfig}=require('./supabase.cjs');
const {fail}=require('./checkout-common.cjs');
const BUCKET='event-gallery';
const MAX_PHOTOS=60,MAX_IMAGE=2*1024*1024,ADMIN_BODY_LIMIT=3*1024*1024;
const MAX_VIDEO=20*1024*1024,VIDEO_MIMES=['video/mp4','video/webm','video/quicktime'];
const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
function videoDetails(data){
  if(!VIDEO_MIMES.includes(data.mime)||!Number.isInteger(data.size)||data.size<24||data.size>MAX_VIDEO||!Number.isFinite(data.duration)||data.duration<=0||data.duration>60||![data.width,data.height].every(n=>Number.isInteger(n)&&n>0&&n<=16384))fail(400,'Envie um vídeo MP4, WebM ou MOV de até 60 segundos e 20 MB.');
  return {mime:data.mime,size:data.size,duration:data.duration,width:data.width,height:data.height};
}
function videoSignature(payload,env){
  if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<32)fail(503,'Configure a senha de administração para enviar vídeos.');
  return createHmac('sha256',env.ADMIN_PASSWORD).update(`gallery-video:${payload}`).digest('hex');
}
function readVideoTicket(ticket,env){
  if(typeof ticket!=='string'||ticket.length>2048)fail(400,'Envio de vídeo inválido.');
  const [payload,signature,...rest]=ticket.split('.'),expected=videoSignature(payload,env);
  if(rest.length||!/^[a-f0-9]{64}$/.test(signature||'')||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail(400,'Envio de vídeo inválido.');
  let value;try{value=JSON.parse(Buffer.from(payload,'base64url'));}catch{fail(400,'Envio de vídeo inválido.');}
  if(!/^[a-f0-9-]{36}$/.test(value.id)||!Number.isFinite(value.expires)||value.expires<Date.now())fail(400,'O envio expirou. Selecione o vídeo novamente.');
  videoDetails(value);return value;
}
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
  for(const [key,min,max]of [['title',0,90],['caption',0,280],['alt',1,180]]){
    const value=data[key]===undefined?(key==='alt'?'Foto da festa':''):data[key];
    if(typeof value!=='string')fail(400,'Confira os textos da foto.');
    const text=value.trim();
    if(text.length<min||text.length>max||/[\x00-\x1f\x7f]/.test(text))fail(400,'Confira o tamanho dos textos da foto.');
    result[key]=text;
  }
  const published=data.published??true,fit=data.fit??'cover';
  if(typeof published!=='boolean'||!['cover','contain'].includes(fit))fail(400,'Confira a publicação e o enquadramento da foto.');
  return {...result,published,fit};
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
    async prepare({video=false}={}){
      const existing=await request(`bucket/${BUCKET}`);
      if(existing.ok){
        const bucket=await existing.json();if(bucket.public!==true)fail(503,'O bucket event-gallery precisa ser público para exibir as fotos.');
        if(video&&(Number(bucket.file_size_limit)<MAX_VIDEO||!VIDEO_MIMES.every(mime=>bucket.allowed_mime_types?.includes(mime)))){
          const updated=await request(`bucket/${BUCKET}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({public:true,file_size_limit:MAX_VIDEO,allowed_mime_types:Object.keys(extensions)})});
          if(!updated.ok)fail(503,'Não foi possível habilitar vídeos no armazenamento.');
        }
        return;
      }
      if(existing.status!==404&&existing.status!==400)fail(503,'Não foi possível acessar o armazenamento de fotos.');
      const created=await request('bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:BUCKET,name:BUCKET,public:true,file_size_limit:MAX_VIDEO,allowed_mime_types:Object.keys(extensions)})});
      if(!created.ok){const retry=await request(`bucket/${BUCKET}`);if(!retry.ok||(await retry.json()).public!==true)fail(503,'Não foi possível preparar o armazenamento de fotos.');}
    },
    async signVideo(id,mime){
      const path=`photos/${id}.${extensions[mime]}`;
      const response=await request(`object/upload/sign/${BUCKET}/${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'false'},body:'{}'});
      if(!response.ok)fail(503,'Não foi possível preparar o envio do vídeo.');
      const data=await response.json(),signedUrl=new URL(`${url}/storage/v1${data.url}`);
      if(signedUrl.origin!==new URL(url).origin||!signedUrl.searchParams.has('token'))fail(503,'O armazenamento retornou um envio inválido.');
      return signedUrl.href;
    },
    async verifyVideo(id,mime,size){
      const path=`photos/${id}.${extensions[mime]}`;
      const response=await request(`object/${BUCKET}/${path}`,{method:'HEAD'});
      if(!response.ok||Number(response.headers.get('content-length'))!==size||response.headers.get('content-type')?.split(';')[0]!==mime)fail(400,'O vídeo não foi enviado por completo. Tente novamente.');
      return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
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
  return (Array.isArray(content?.gallery)?content.gallery:[]).filter(p=>p.published===true).map(({id,url,title,caption,alt,fit,type,duration,width,height})=>({id,url,title,caption,alt,fit,type:type==='video'?'video':'image',duration,width,height}));
}
async function manageGallery(data,{db,env=process.env,storage}){
  if(data.action==='prepareVideo'){
    const details=videoDetails(data),rows=await db.request('site_settings?id=eq.1&select=content');
    if((rows[0]?.content?.gallery||[]).length>=MAX_PHOTOS)fail(400,'A galeria aceita até 60 stories.');
    const value={id:randomUUID(),...details,expires:Date.now()+2*3600000};
    const payload=Buffer.from(JSON.stringify(value)).toString('base64url'),ticket=`${payload}.${videoSignature(payload,env)}`;
    storage ||= createGalleryStorage({env});await storage.prepare({video:true});
    return {ticket,uploadUrl:await storage.signVideo(value.id,details.mime),expires:value.expires};
  }
  if(data.action==='completeVideo'){
    const value=readVideoTicket(data.ticket,env);
    storage ||= createGalleryStorage({env});
    const url=await storage.verifyVideo(value.id,value.mime,value.size);
    await updateSettings(db,content=>{
      const gallery=content.gallery||[];
      if(gallery.some(item=>item.id===value.id))return content;
      if(gallery.length>=MAX_PHOTOS)fail(400,'A galeria aceita até 60 stories.');
      return {...content,gallery:[...gallery,{id:value.id,url,...photoFields({alt:'Vídeo da festa',fit:'contain'}),type:'video',duration:value.duration,width:value.width,height:value.height}]};
    });
    return {id:value.id};
  }
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
