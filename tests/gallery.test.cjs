const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {updateSettings,manageGallery,decodeImage,publicGallery,createGalleryStorage}=require('../server/gallery.cjs');
const {createAdmin}=require('../server/admin.cjs');
const {defaults}=require('../server/site-content.cjs');
const fields={title:'A pista inteira',caption:'Um registro da festa.',alt:'Pessoas na pista de dança',fit:'cover',published:true};
const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(35)]).toString('base64');
const videoDetails={mime:'video/mp4',size:1024,duration:15,width:1920,height:1080};
function database(initial={}){
  let content=structuredClone(initial),conflict=null;
  return {
    get value(){return content;},conflictOnce(value){conflict=value;},
    async request(path,options={}){
      if(!path.startsWith('site_settings'))return path.includes('admin_dashboard')?{lots:[],content}:[];
      if(options.method==='PATCH'){
        if(conflict){content={...content,...conflict};conflict=null;return [];}
        const condition=path.split('&content->>_revision=')[1];
        if(condition!==(content._revision==null?'is.null':`eq.${content._revision}`))return [];
        content=structuredClone(options.body.content);return [{content}];
      }
      return [{content:structuredClone(content)}];
    }
  };
}
test('gallery upload, metadata edits, ordering, visibility and text changes preserve other settings',async()=>{
  const db=database({...defaults}),uploaded=[],storage={async prepare(){},async upload(id,bytes,mime){uploaded.push({id,bytes,mime});return `https://project.supabase.co/storage/v1/object/public/event-gallery/photos/${id}.jpg`;},async discard(){}};
  const first=await manageGallery({action:'uploadPhoto',...fields,mime:'image/jpeg',image:jpeg},{db,storage});
  assert.equal(uploaded.length,1);assert.equal(db.value.gallery[0].id,first.id);assert.equal(db.value.tagline,defaults.tagline);
  const second=await manageGallery({action:'uploadPhoto',...fields,published:false,mime:'image/jpeg',image:jpeg},{db,storage});
  assert.equal(publicGallery(db.value).length,1);
  await manageGallery({action:'movePhoto',id:second.id,direction:-1},{db});assert.equal(db.value.gallery[0].id,second.id);
  await manageGallery({action:'savePhoto',id:second.id,...fields,title:'Outro registro',published:true,fit:'contain',url:'https://evil.example/inject'},{db});
  assert.equal(publicGallery(db.value).length,2);assert.equal(db.value.gallery[0].fit,'contain');assert.match(db.value.gallery[0].url,/project.supabase.co/);
  db.conflictOnce({venue:'Novo local'});
  await manageGallery({action:'savePhoto',id:first.id,...fields,published:false},{db});
  assert.equal(db.value.venue,'Novo local');assert.equal(publicGallery(db.value).length,1);
  await updateSettings(db,c=>({...c,...defaults}));assert.equal(db.value.gallery.length,2);
  await assert.rejects(manageGallery({action:'movePhoto',id:randomUUID(),direction:1},{db}),e=>e.httpStatus===404);
  await assert.rejects(manageGallery({action:'movePhoto',id:first.id,direction:9},{db}),e=>e.httpStatus===400);
});
test('gallery rejects invalid file types, oversize images and invalid metadata before upload',async()=>{
  for(const data of [{mime:'image/svg+xml',image:jpeg},{mime:'image/jpeg',image:'not base64'},{mime:'image/png',image:jpeg},{mime:'image/jpeg',image:Buffer.alloc(2100000).toString('base64')}])assert.throws(()=>decodeImage(data));
  const db=database(),storage={async prepare(){assert.fail('Storage must not be called');}};
  await assert.rejects(manageGallery({action:'uploadPhoto',...fields,title:'a'.repeat(91),mime:'image/jpeg',image:jpeg},{db,storage}),e=>e.httpStatus===400);
  const full=database({gallery:Array.from({length:60},()=>({id:randomUUID()}))});
  await assert.rejects(manageGallery({action:'uploadPhoto',...fields,mime:'image/jpeg',image:jpeg},{db:full,storage}),e=>e.httpStatus===400);
});
test('failed gallery metadata save removes only the new upload',async()=>{
  let removed=false,reads=0;
  const db={async request(){reads++;if(reads===1)return [{content:{}}];throw Error('offline');}};
  const storage={async prepare(){},async upload(){return 'https://project.supabase.co/image.jpg';},async discard(){removed=true;}};
  await assert.rejects(manageGallery({action:'uploadPhoto',...fields,mime:'image/jpeg',image:jpeg},{db,storage}),/offline/);assert.equal(removed,true);
});
test('gallery administration requires login and content edits do not delete gallery',async()=>{
  const password='a'.repeat(40),db=database({gallery:[{id:'photo',...fields,url:'https://project.supabase.co/a.jpg'}]});
  const handler=createAdmin({env:{ADMIN_PASSWORD:password},db});
  async function call(body,cookie=''){
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.data=JSON.parse(v);}};
    await handler({method:'POST',headers:{'content-type':'application/json',cookie},body},res);return res;
  }
  assert.equal((await call({action:'uploadPhoto',...fields,mime:'image/jpeg',image:jpeg})).statusCode,401);
  const login=await call({action:'login',password}),cookie=login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call({action:'saveContent',content:defaults},cookie)).statusCode,200);assert.equal(db.value.gallery.length,1);
  assert.equal((await call({action:'savePhoto',id:'photo',...fields,published:false},cookie)).statusCode,200);assert.equal(publicGallery(db.value).length,0);
});
test('storage upload stays within the configured project and rejects upload failure without exposing keys',async()=>{
  const calls=[],id=randomUUID(),storage=createGalleryStorage({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_server-only'},fetchImpl:async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>({public:true})};
  }});
  await storage.prepare();const url=await storage.upload(id,Buffer.from(jpeg,'base64'),'image/jpeg');
  assert.equal(url,`https://project.supabase.co/storage/v1/object/public/event-gallery/photos/${id}.jpg`);assert.equal(calls[1].options.headers['x-upsert'],'false');assert.equal(calls[1].options.headers.apikey,'sb_secret_server-only');assert.equal(url.includes('sb_secret'),false);
});

test('photos upload without titles or captions and are published in selection order',async()=>{
  const db=database(),storage={async prepare(){},async upload(id){return `https://project.supabase.co/${id}.jpg`;},async discard(){}};
  const first=await manageGallery({action:'uploadPhoto',mime:'image/jpeg',image:jpeg},{db,storage});
  const second=await manageGallery({action:'uploadPhoto',mime:'image/jpeg',image:jpeg},{db,storage});
  assert.deepEqual(publicGallery(db.value).map(photo=>photo.id),[first.id,second.id]);
  for(const photo of publicGallery(db.value)){
    assert.equal(photo.title,'');assert.equal(photo.caption,'');assert.equal(photo.alt,'Foto da festa');assert.equal(photo.fit,'cover');
  }
});

test('video upload tickets validate limits, prevent tampering and finalize only once',async()=>{
  const db=database(),env={ADMIN_PASSWORD:'v'.repeat(40)},calls=[];
  const storage={async prepare(options){assert.equal(options.video,true);},async signVideo(id,mime){calls.push({id,mime});return 'https://project.supabase.co/signed?token=upload';},async verifyVideo(id,mime,size){assert.equal(size,1024);return `https://project.supabase.co/${id}.mp4`;}};
  for(const changed of [{duration:61},{size:21*1024*1024},{mime:'text/html'},{duration:NaN},{width:0}]){
    await assert.rejects(manageGallery({action:'prepareVideo',...videoDetails,...changed},{db,env,storage}),error=>error.httpStatus===400);
  }
  const prepared=await manageGallery({action:'prepareVideo',...videoDetails},{db,env,storage});
  assert.equal(db.value.gallery,undefined);assert.equal(calls.length,1);
  await assert.rejects(manageGallery({action:'completeVideo',ticket:prepared.ticket+'x'},{db,env,storage}),error=>error.httpStatus===400);
  const first=await manageGallery({action:'completeVideo',ticket:prepared.ticket},{db,env,storage});
  const second=await manageGallery({action:'completeVideo',ticket:prepared.ticket},{db,env,storage});
  assert.equal(first.id,second.id);assert.equal(db.value.gallery.length,1);
  assert.equal(publicGallery(db.value)[0].type,'video');assert.equal(publicGallery(db.value)[0].duration,15);
  assert.equal(publicGallery(db.value)[0].fit,'contain');
  const full=database({gallery:Array.from({length:60},()=>({id:randomUUID()}))});
  await assert.rejects(manageGallery({action:'prepareVideo',...videoDetails},{db:full,env,storage}),error=>error.httpStatus===400);
  await assert.rejects(manageGallery({action:'completeVideo',ticket:prepared.ticket},{db:full,env,storage}),error=>error.httpStatus===400);
});

test('video storage upgrades existing buckets, signs uploads and checks completed object size and type',async()=>{
  const calls=[],id=randomUUID();let actualSize=1024;
  const storage=createGalleryStorage({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_server-only'},fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(options.method==='HEAD')return {ok:true,headers:new Headers({'content-length':String(actualSize),'content-type':'video/mp4'})};
    return {ok:true,json:async()=>url.includes('/upload/sign/')?{url:`/object/upload/sign/event-gallery/photos/${id}.mp4?token=temporary`}:{public:true,file_size_limit:2097152,allowed_mime_types:['image/jpeg']}};
  }});
  await storage.prepare({video:true});
  assert.equal(calls[1].options.method,'PUT');assert.ok(JSON.parse(calls[1].options.body).allowed_mime_types.includes('video/mp4'));
  const uploadUrl=await storage.signVideo(id,'video/mp4');
  assert.match(uploadUrl,/storage\/v1\/object\/upload\/sign\/event-gallery/);assert.equal(uploadUrl.includes('sb_secret'),false);
  assert.match(await storage.verifyVideo(id,'video/mp4',1024),/object\/public\/event-gallery/);
  actualSize=12;await assert.rejects(storage.verifyVideo(id,'video/mp4',1024),error=>error.httpStatus===400);
});
