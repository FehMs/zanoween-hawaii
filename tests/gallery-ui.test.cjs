const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function app(photos){
  const node=()=>({children:[],handlers:{},attributes:{},style:{},hidden:false,disabled:false,open:false,paused:true,offsetLeft:0,offsetWidth:44,clientWidth:300,textContent:'',classList:{toggle(){},add(){},remove(){}},pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},load(){},removeAttribute(key){delete this[key];},setAttribute(k,v){this.attributes[k]=v;},append(value){this.children.push(value);},replaceChildren(){this.children=[];},addEventListener(type,fn){this.handlers[type]=fn;},matches(){return false;},closest(){return null;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}});
  const ids={};for(const match of fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8').matchAll(/id="(story-[^"]+|memory-album)"/g))ids[match[1]]=node();
  const timers=new Map();let timerId=0;
  const document={hidden:false,getElementById:id=>ids[id],createElement:node,addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/gallery.js'),'utf8'),{document,window:{matchMedia:()=>({matches:false})},URL,AbortSignal,performance:{now:()=>0},fetch:async()=>({ok:true,json:async()=>({photos})}),setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  return {ids,timers,settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
const photos=Array.from({length:3},(_,i)=>({id:String(i),title:`Registro ${i+1}`,caption:`Legenda ${i+1}`,alt:`Descrição ${i+1}`,url:`https://project.supabase.co/photo-${i}.jpg`,fit:i===2?'contain':'cover'}));
test('stories load, navigate both ways, wrap, select thumbnails and swipe',async()=>{
  const {ids,settle}=app(photos);await settle();
  assert.equal(ids['story-title'].textContent,'Registro 1');assert.equal(ids['story-thumbnails'].children.length,3);assert.equal(ids['story-next'].disabled,false);
  ids['story-next'].handlers.click();assert.equal(ids['story-title'].textContent,'Registro 2');
  ids['story-thumbnails'].children[2].handlers.click();assert.equal(ids['story-image'].style.objectFit,'contain');
  ids['story-next'].handlers.click();assert.equal(ids['story-title'].textContent,'Registro 1');
  ids['story-prev'].handlers.click();assert.equal(ids['story-title'].textContent,'Registro 3');
  ids['story-card'].handlers.pointerdown({clientX:200,target:ids['story-image']});ids['story-card'].handlers.pointerup({clientX:100});assert.equal(ids['story-title'].textContent,'Registro 1');
});
test('stories handle empty and single-photo albums, keyboard navigation and image failures',async()=>{
  const empty=app([]);await empty.settle();assert.match(empty.ids['story-empty-message'].textContent,/Em breve/);assert.equal(empty.ids['story-next'].disabled,true);
  const single=app([photos[0]]);await single.settle();assert.equal(single.ids['story-next'].disabled,true);
  const multi=app(photos);await multi.settle();let prevented=false;
  multi.ids['memory-album'].handlers.keydown({target:multi.ids['memory-album'],key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(multi.ids['story-title'].textContent,'Registro 2');
  multi.ids['story-image'].handlers.error();assert.equal(multi.ids['story-error'].hidden,false);multi.ids['story-next'].handlers.click();assert.equal(multi.ids['story-error'].hidden,true);
});

test('stories display photos without title or caption overlays',async()=>{
  const {ids,settle}=app([{...photos[0],title:'',caption:''},photos[1]]);await settle();
  assert.equal(ids['story-image'].src,photos[0].url);
  assert.equal(ids['story-caption'].hidden,true);assert.equal(ids['story-gradient'].hidden,true);
  assert.equal(ids['story-card'].attributes['aria-label'],'Foto 1 de 2');
  ids['story-next'].handlers.click();assert.equal(ids['story-caption'].hidden,false);
});

test('horizontal photos are never cropped even when previously saved as cover',async()=>{
  const {ids,settle}=app([photos[0]]);await settle();
  ids['story-image'].naturalWidth=1920;ids['story-image'].naturalHeight=1080;
  ids['story-image'].handlers.load();assert.equal(ids['story-image'].style.objectFit,'contain');
});

test('legacy compatibility metadata does not add a title over the photo',async()=>{
  const {ids,settle}=app([{...photos[0],title:'Foto da festa',caption:''}]);await settle();
  assert.equal(ids['story-caption'].hidden,true);assert.equal(ids['story-title'].textContent,'');
});

test('video stories play to the end and navigate to photos',async()=>{
  const clip={...photos[0],type:'video',duration:15,url:'https://project.supabase.co/clip.mp4'};
  const {ids,timers,settle}=app([clip,photos[1]]);await settle();
  assert.equal(ids['story-image'].hidden,true);assert.equal(ids['story-video'].src,clip.url);
  ids['story-video'].videoWidth=1920;ids['story-video'].videoHeight=1080;
  ids['story-video'].handlers.loadedmetadata();assert.equal(ids['story-video'].style.objectFit,'contain');
  ids['story-video'].handlers.canplay();await ids['story-video'].play();ids['story-video'].handlers.play();
  assert.equal(ids['story-video'].paused,false);assert.equal(timers.size,0);
  ids['story-video'].handlers.ended();assert.equal(ids['story-video'].hidden,true);
  assert.equal(ids['story-image'].src,photos[1].url);
});
