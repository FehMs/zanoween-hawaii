(() => {
  const $=id=>document.getElementById(id),album=$('memory-album');if(!album)return;
  const image=$('story-image'),video=$('story-video'),duration=6000;
  const isVideo=photo=>photo?.type==='video';
  function stopVideo(target){
    if(!target?.getAttribute('src'))return;
    target.pause();target.removeAttribute('src');target.load();
  }
  function fitMedia(target,photo){const width=target.naturalWidth||target.videoWidth,height=target.naturalHeight||target.videoHeight;target.style.objectFit=width>height?'contain':photo.fit;}
  let photos=[],index=0,playing=false,timer,deadline=0,remaining=duration,visible=false,hovering=false,loaded=false,pointerX=null;
  function clearTimer(){if(timer){remaining=Math.max(0,deadline-performance.now());clearTimeout(timer);timer=null;}}
  function syncPlayback(){
    const currentVideo=isVideo(photos[index]);
    const suspended=document.hidden||!visible||(!currentVideo&&hovering)||!loaded;
    album.classList.toggle('is-playing',playing);album.classList.toggle('is-video',currentVideo);album.classList.toggle('is-suspended',suspended);
    if(currentVideo){
      clearTimer();
      if(!playing||suspended){video.pause();return;}
      if(video.paused)video.play().catch(()=>{});
      return;
    }
    if(!playing||suspended){clearTimer();return;}
    if(!timer&&photos.length>1){deadline=performance.now()+remaining;timer=setTimeout(()=>{timer=null;select(index+1,false);},remaining);}
  }
  function select(next,announce=true){
    if(!photos.length)return;
    clearTimer();remaining=duration;index=(next+photos.length)%photos.length;loaded=false;
    const photo=photos[index];stopVideo(video);image.hidden=isVideo(photo);video.hidden=!isVideo(photo);
    image.classList.add('is-loading');$('story-error').hidden=true;
    if(isVideo(photo)){video.muted=true;video.style.objectFit='contain';video.src=photo.url;}
    else{image.style.objectFit='contain';image.alt=photo.alt;image.src=photo.url;}
    $('story-title').textContent=photo.title;$('story-description').textContent=photo.caption;
    $('story-title').hidden=!photo.title;$('story-description').hidden=!photo.caption;
    $('story-caption').hidden=$('story-gradient').hidden=!photo.title&&!photo.caption;
    $('story-position').textContent=`${String(index+1).padStart(2,'0')} / ${String(photos.length).padStart(2,'0')} MEMÓRIAS`;
    $('story-card').setAttribute('aria-label',`${isVideo(photo)?'Vídeo':'Foto'} ${index+1} de ${photos.length}${photo.title?`: ${photo.title}`:''}`);
    for(const side of ['left','right']){const peek=$(`story-peek-${side}`),neighbor=photos[(index+(side==='left'?-1:1)+photos.length)%photos.length];peek.hidden=photos.length<2||isVideo(neighbor);if(!isVideo(neighbor))peek.src=neighbor.url;}
    const bars=$('story-bars');bars.replaceChildren();
    photos.forEach((p,i)=>{const bar=document.createElement('span');bar.className=i<index?'is-complete':i===index?'is-current':'';bar.append(document.createElement('i'));bars.append(bar);});
    [...$('story-thumbnails').children].forEach((thumb,i)=>{thumb.setAttribute('aria-current',String(i===index));});
    const thumb=$('story-thumbnails').children[index];
    if(thumb)$('story-thumbnails').scrollLeft=thumb.offsetLeft-$('story-thumbnails').offsetLeft-$('story-thumbnails').clientWidth/2+thumb.offsetWidth/2;
    if(announce)$('story-status').textContent=`Foto ${index+1} de ${photos.length}. ${photo.title}. ${photo.caption}`;
    syncPlayback();
  }
  image.addEventListener('load',()=>{if(isVideo(photos[index]))return;fitMedia(image,photos[index]);loaded=true;image.classList.remove('is-loading');syncPlayback();});
  image.addEventListener('error',()=>{if(isVideo(photos[index]))return;loaded=false;image.classList.remove('is-loading');$('story-error').hidden=false;clearTimer();});
  video.addEventListener('loadedmetadata',()=>{if(isVideo(photos[index]))fitMedia(video,photos[index]);});
  video.addEventListener('canplay',()=>{if(!isVideo(photos[index]))return;loaded=true;syncPlayback();});
  video.addEventListener('play',()=>{if(document.hidden||!visible){video.pause();return;}playing=true;syncPlayback();});
  video.addEventListener('pause',()=>{if(playing&&loaded&&visible&&!document.hidden&&!video.ended){playing=false;syncPlayback();}});
  video.addEventListener('ended',()=>{if(playing&&photos.length>1)select(index+1,false);else{playing=false;syncPlayback();}});
  video.addEventListener('timeupdate',()=>{const bar=$('story-bars').children[index]?.children[0];if(bar&&video.duration)bar.style.transform=`scaleX(${Math.min(1,video.currentTime/video.duration)})`;});
  video.addEventListener('error',()=>{if(!isVideo(photos[index]))return;loaded=false;$('story-error').hidden=false;syncPlayback();});
  function navigate(step){pointerX=null;select(index+step);}
  for(const [id,step]of [['story-prev',-1],['story-next',1]]){
    $(id).addEventListener('click',event=>{event.preventDefault();event.stopPropagation();navigate(step);});
  }
  function keys(event){if(event.target.matches('input,textarea'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();navigate(event.key==='ArrowLeft'?-1:1);}}
  album.addEventListener('keydown',keys);
  function swipe(target){
    target.addEventListener('pointerdown',event=>{if(event.target.closest('button,video'))return;pointerX=event.clientX;});
    target.addEventListener('pointerup',event=>{if(pointerX===null)return;const change=event.clientX-pointerX;pointerX=null;if(Math.abs(change)>45)navigate(change<0?1:-1);});
    target.addEventListener('pointercancel',()=>{pointerX=null;});
  }
  swipe($('story-card'));
  $('story-card').addEventListener('mouseenter',()=>{hovering=true;syncPlayback();});$('story-card').addEventListener('mouseleave',()=>{hovering=false;syncPlayback();});
  document.addEventListener('visibilitychange',syncPlayback);
  if('IntersectionObserver'in window)new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncPlayback();},{threshold:.2}).observe(album);else visible=true;
  async function load(){
    album.setAttribute('aria-busy','true');$('story-retry').hidden=true;
    try{
      const response=await fetch('/api/gallery',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();
      const data=await response.json();
      photos=(Array.isArray(data.photos)?data.photos:[]).filter(p=>{try{const url=new URL(p.url);return url.protocol==='https:'&&!url.username&&!url.password&&typeof p.title==='string'&&typeof p.alt==='string';}catch{return false;}}).map(p=>({...p,title:p.title==='Foto da festa'&&!p.caption?'':p.title,caption:p.caption||'',fit:p.fit==='contain'?'contain':'cover'}));
      const hasPhotos=photos.length>0;
      for(const id of ['story-chrome','story-gradient','story-caption','story-thumbnails'])$(id).hidden=!hasPhotos;
      $('story-empty').hidden=hasPhotos;$('story-prev').disabled=$('story-next').disabled=photos.length<2;
      if(!hasPhotos){$('story-empty-message').textContent='Em breve, as fotos das edições anteriores estarão por aqui.';return;}
      $('story-thumbnails').replaceChildren();photos.forEach((photo,i)=>{
        const button=document.createElement('button');button.type='button';button.className='story-thumb';button.setAttribute('aria-label',`Ver ${isVideo(photo)?'vídeo':'foto'} ${i+1}${photo.title?`: ${photo.title}`:''}`);
        const thumb=document.createElement(isVideo(photo)?'span':'img');if(isVideo(photo)){thumb.className='story-video-thumb';thumb.textContent='▶';thumb.setAttribute('aria-hidden','true');}else{thumb.src=photo.url;thumb.alt='';thumb.loading='lazy';}button.append(thumb);button.addEventListener('click',()=>select(i));$('story-thumbnails').append(button);
      });select(0,false);
    }catch{$('story-empty-message').textContent='As fotos não carregaram agora. Tente novamente em instantes.';$('story-retry').hidden=false;}
    finally{album.setAttribute('aria-busy','false');}
  }
  $('story-retry').addEventListener('click',load);load();
})();
