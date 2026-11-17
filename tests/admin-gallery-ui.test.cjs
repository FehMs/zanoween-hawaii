const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function app(failAt=0,options={}){
  const node=()=>({children:[],handlers:{},hidden:false,textContent:'',addEventListener(type,fn){this.handlers[type]=fn;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
  const ids=Object.fromEntries(['gallery-form','gallery-preview','gallery-upload-status','gallery-list','gallery-count'].map(id=>[id,node()]));
  const input={files:[],value:'',required:true,disabled:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  ids['gallery-form'].elements={photo:input};ids['gallery-form'].reset=()=>{input.value='';input.files=[];};
  const button={textContent:'Publicar stories →'},sent=[],attempts=[],notices=[],revoked=[],uploads=[];let running;
  const admin={notice(message,error){notices.push({message,error});},async api(data){attempts.push(data);if(attempts.length===failAt)throw Error('Falha no envio');if(options.legacy&&data.action==='uploadPhoto'&&(!data.title||!data.alt||typeof data.caption!=='string'))throw Error('Preencha o título e a descrição da foto.');sent.push(data);if(data.action==='prepareVideo')return {uploadUrl:'https://project.supabase.co/upload?token=test',ticket:'test-ticket',expires:Date.now()+100000};},async load(){},action(btn,fn){running=fn().catch(error=>admin.notice(error.message,true));}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/admin-gallery.js'),'utf8'),{
    document:{getElementById:id=>ids[id],createElement(tag){if(tag==='canvas')return {getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,photo'};if(tag==='video'){const video=node();Object.assign(video,{duration:options.duration||15,videoWidth:1920,videoHeight:1080,load(){},removeAttribute(){}});Object.defineProperty(video,'src',{set(){queueMicrotask(()=>video.onloadedmetadata?.());}});return video;}return node();}},
    window:{zanoweenAdmin:admin},URL:{createObjectURL:file=>file.name,revokeObjectURL:url=>revoked.push(url)},
    createImageBitmap:async()=>({width:100,height:100,close(){}}),setTimeout,clearTimeout,AbortSignal,
    fetch:async(url,config)=>{uploads.push({url,config});return {ok:true};}
  });
  return {ids,input,button,sent,attempts,notices,revoked,uploads,
    select(files){input.files=files;input.handlers.change();},
    async submit(){ids['gallery-form'].handlers.submit({preventDefault(){},submitter:button});await running;}
  };
}
const files=Array.from({length:3},(_,i)=>({name:`foto-${i}.jpg`,type:'image/jpeg',size:100}));
test('admin uploads multiple photos without metadata and clears the selection',async()=>{
  const ui=app();ui.select(files);assert.equal(ui.ids['gallery-preview'].children.length,3);
  await ui.submit();assert.equal(ui.sent.length,3);assert.ok(ui.sent.every(data=>data.action==='uploadPhoto'&&data.title===undefined));
  assert.equal(ui.ids['gallery-preview'].hidden,true);assert.equal(ui.input.disabled,false);
  assert.match(ui.notices.at(-1).message,/3 stories publicados/);assert.equal(ui.revoked.length,3);
});
test('admin retries only pending photos after a partial failure',async()=>{
  const ui=app(2);ui.select(files);await ui.submit();
  assert.equal(ui.sent.length,1);assert.equal(ui.ids['gallery-preview'].children.length,2);
  assert.match(ui.notices.at(-1).message,/1 de 3 stories publicados/);assert.equal(ui.notices.at(-1).error,true);
  await ui.submit();assert.equal(ui.sent.length,3);assert.equal(ui.ids['gallery-preview'].hidden,true);
});
test('admin rejects invalid, oversized and excess selections before upload',async()=>{
  const ui=app();
  for(const selection of [[{...files[0],type:'image/svg+xml'}],[{...files[0],size:21*1024*1024}],Array(61).fill(files[0])]){
    ui.select(selection);assert.equal(ui.ids['gallery-preview'].hidden,true);assert.equal(ui.notices.at(-1).error,true);
  }
  assert.equal(ui.attempts.length,0);
});

const clip={name:'clip.mp4',type:'video/mp4',size:1024};
test('admin uploads mixed media directly and resumes video confirmation without uploading twice',async()=>{
  const ui=app(2);ui.select([clip,files[0]]);await ui.submit();
  assert.equal(ui.attempts[0].action,'prepareVideo');assert.equal(ui.uploads.length,1);
  assert.equal(ui.uploads[0].config.body,clip);assert.equal(ui.attempts[1].action,'completeVideo');
  assert.equal(ui.ids['gallery-preview'].children.length,2);
  await ui.submit();assert.equal(ui.uploads.length,1);
  assert.equal(ui.attempts[2].action,'completeVideo');assert.equal(ui.attempts[3].action,'uploadPhoto');
  assert.equal(ui.attempts[3].fit,'contain');assert.equal(ui.ids['gallery-preview'].hidden,true);
});
test('admin rejects videos longer than 60 seconds before requesting an upload',async()=>{
  const ui=app(0,{duration:61});ui.select([clip]);await ui.submit();
  assert.equal(ui.attempts.length,0);assert.equal(ui.uploads.length,0);
  assert.match(ui.notices.at(-1).message,/60 segundos/);assert.equal(ui.notices.at(-1).error,true);
});

test('bulk photos also work with the older API that requires metadata',async()=>{
  const ui=app(0,{legacy:true});ui.select(files);await ui.submit();
  assert.equal(ui.sent.length,3);assert.equal(ui.attempts.length,6);
  for(const data of ui.sent){assert.equal(data.title,'Foto da festa');assert.equal(data.caption,'');assert.equal(data.alt,'Foto da festa');assert.equal(data.published,true);assert.equal(data.fit,'contain');}
  assert.equal(ui.ids['gallery-preview'].hidden,true);assert.match(ui.notices.at(-1).message,/3 stories publicados/);
});
