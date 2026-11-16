(() => {
  const $=id=>document.getElementById(id),album=$('memory-album');if(!album)return;
  const image=$('story-image'),dialog=$('story-dialog'),duration=6000;
  let photos=[],index=0,playing=false,timer,deadline=0,remaining=duration,visible=false,hovering=false,loaded=false,pointerX=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clearTimer(){if(timer){remaining=Math.max(0,deadline-performance.now());clearTimeout(timer);timer=null;}}
  function syncPlayback(){
    const suspended=document.hidden||!visible||hovering||dialog.open||!loaded;
    album.classList.toggle('is-playing',playing);album.classList.toggle('is-suspended',suspended);
    $('story-play').setAttribute('aria-pressed',String(playing));$('story-play').textContent=playing?'Ⅱ Pausar':'▷ Reproduzir';
    $('story-play').setAttribute('aria-label',playing?'Pausar reprodução automática':'Reproduzir fotos automaticamente');
    if(!playing||suspended){clearTimer();return;}
    if(!timer&&photos.length>1){deadline=performance.now()+remaining;timer=setTimeout(()=>{timer=null;select(index+1,false);},remaining);}
  }
  function updateDialog(){
    if(!photos.length)return;
    const photo=photos[index];$('story-large').src=photo.url;$('story-large').alt=photo.alt;
    $('story-large-title').textContent=photo.title;$('story-large-caption').textContent=photo.caption;
    $('story-large-position').textContent=`${String(index+1).padStart(2,'0')} / ${String(photos.length).padStart(2,'0')}`;
    $('story-large-prev').disabled=$('story-large-next').disabled=photos.length<2;
  }
  function select(next,announce=true){
    if(!photos.length)return;
    clearTimer();remaining=duration;index=(next+photos.length)%photos.length;loaded=false;
    const photo=photos[index];image.hidden=false;image.classList.add('is-loading');$('story-error').hidden=true;
    image.style.objectFit=photo.fit;image.alt=photo.alt;image.src=photo.url;
    $('story-title').textContent=photo.title;$('story-description').textContent=photo.caption;
    $('story-position').textContent=`${String(index+1).padStart(2,'0')} / ${String(photos.length).padStart(2,'0')} MEMÓRIAS`;
    $('story-card').setAttribute('aria-label',`Foto ${index+1} de ${photos.length}: ${photo.title}`);
    for(const side of ['left','right']){const peek=$(`story-peek-${side}`);peek.hidden=photos.length<2;peek.src=photos[(index+(side==='left'?-1:1)+photos.length)%photos.length].url;}
    const bars=$('story-bars');bars.replaceChildren();
    photos.forEach((p,i)=>{const bar=document.createElement('span');bar.className=i<index?'is-complete':i===index?'is-current':'';bar.append(document.createElement('i'));bars.append(bar);});
    [...$('story-thumbnails').children].forEach((thumb,i)=>{thumb.setAttribute('aria-current',String(i===index));});
    const thumb=$('story-thumbnails').children[index];
    if(thumb)$('story-thumbnails').scrollLeft=thumb.offsetLeft-$('story-thumbnails').offsetLeft-$('story-thumbnails').clientWidth/2+thumb.offsetWidth/2;
    if(announce)$('story-status').textContent=`Foto ${index+1} de ${photos.length}. ${photo.title}. ${photo.caption}`;
    if(dialog.open)updateDialog();
    syncPlayback();
  }
  image.addEventListener('load',()=>{loaded=true;image.classList.remove('is-loading');syncPlayback();});
  image.addEventListener('error',()=>{loaded=false;image.classList.remove('is-loading');$('story-error').hidden=false;clearTimer();});
  function navigate(step){select(index+step);}
  $('story-prev').addEventListener('click',()=>navigate(-1));$('story-next').addEventListener('click',()=>navigate(1));
  $('story-large-prev').addEventListener('click',()=>navigate(-1));$('story-large-next').addEventListener('click',()=>navigate(1));
  $('story-play').addEventListener('click',()=>{playing=!playing;remaining=duration;if(playing)select(index,false);syncPlayback();});
  $('story-expand').addEventListener('click',()=>{updateDialog();dialog.showModal();syncPlayback();});
  $('story-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',syncPlayback);
  $('story-large').addEventListener('error',()=>{$('story-large-caption').textContent='Não foi possível abrir esta foto. Use as setas para continuar.';});
  function keys(event){if(event.target.matches('input,textarea'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();navigate(event.key==='ArrowLeft'?-1:1);}}
  album.addEventListener('keydown',keys);dialog.addEventListener('keydown',keys);
  function swipe(target){
    target.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;pointerX=event.clientX;});
    target.addEventListener('pointerup',event=>{if(pointerX===null)return;const change=event.clientX-pointerX;pointerX=null;if(Math.abs(change)>45)navigate(change<0?1:-1);});
    target.addEventListener('pointercancel',()=>{pointerX=null;});
  }
  swipe($('story-card'));swipe($('story-large'));
  $('story-card').addEventListener('mouseenter',()=>{hovering=true;syncPlayback();});$('story-card').addEventListener('mouseleave',()=>{hovering=false;syncPlayback();});
  document.addEventListener('visibilitychange',syncPlayback);
  if('IntersectionObserver'in window)new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncPlayback();},{threshold:.2}).observe(album);else visible=true;
  async function load(){
    album.setAttribute('aria-busy','true');$('story-retry').hidden=true;
    try{
      const response=await fetch('/api/gallery',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();
      const data=await response.json();
      photos=(Array.isArray(data.photos)?data.photos:[]).filter(p=>{try{const url=new URL(p.url);return url.protocol==='https:'&&!url.username&&!url.password&&typeof p.title==='string'&&typeof p.alt==='string';}catch{return false;}}).map(p=>({...p,caption:p.caption||'',fit:p.fit==='contain'?'contain':'cover'}));
      const hasPhotos=photos.length>0;
      for(const id of ['story-chrome','story-gradient','story-caption','story-thumbnails'])$(id).hidden=!hasPhotos;
      $('story-empty').hidden=hasPhotos;$('story-prev').disabled=$('story-next').disabled=photos.length<2;$('story-play').hidden=photos.length<2||reduced;
      if(!hasPhotos){$('story-empty-message').textContent='Em breve, as fotos das edições anteriores estarão por aqui.';return;}
      $('story-thumbnails').replaceChildren();photos.forEach((photo,i)=>{
        const button=document.createElement('button');button.type='button';button.className='story-thumb';button.setAttribute('aria-label',`Ver foto ${i+1}: ${photo.title}`);
        const thumb=document.createElement('img');thumb.src=photo.url;thumb.alt='';thumb.loading='lazy';button.append(thumb);button.addEventListener('click',()=>select(i));$('story-thumbnails').append(button);
      });select(0,false);
    }catch{$('story-empty-message').textContent='As fotos não carregaram agora. Tente novamente em instantes.';$('story-retry').hidden=false;}
    finally{album.setAttribute('aria-busy','false');}
  }
  $('story-retry').addEventListener('click',load);load();
})();
