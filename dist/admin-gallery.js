(() => {
  const $=id=>document.getElementById(id),form=$('gallery-form');if(!form)return;
  let previewUrls=[],selected=[],photoCount=0,uploading=false;
  const admin=()=>window.zanoweenAdmin;
  const isVideo=file=>file.type.startsWith('video/'),pendingVideos=new WeakMap();
  const videoTypes=['video/mp4','video/webm','video/quicktime'];
  function videoMetadata(file){
    return new Promise((resolve,reject)=>{
      const video=document.createElement('video'),url=URL.createObjectURL(file);
      const timeout=setTimeout(()=>finish(Error('Não foi possível ler o vídeo. Use MP4, WebM ou MOV compatível com seu navegador.')),15000);
      function cleanup(){clearTimeout(timeout);video.onloadedmetadata=video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
      function finish(error){cleanup();reject(error);}
      video.preload='metadata';
      video.onloadedmetadata=()=>{
        const details={duration:video.duration,width:video.videoWidth,height:video.videoHeight};
        if(!Number.isFinite(details.duration)||details.duration<=0||details.duration>60||!details.width||!details.height){finish(Error('Escolha um vídeo de até 60 segundos.'));return;}
        cleanup();resolve(details);
      };
      video.onerror=()=>finish(Error('Não foi possível ler este vídeo. Use MP4, WebM ou MOV compatível com seu navegador.'));
      video.src=url;
    });
  }
  async function uploadVideo(file){
    let pending=pendingVideos.get(file);
    if(!pending||pending.expires<Date.now()){
      const details=await videoMetadata(file);
      pending=await admin().api({action:'prepareVideo',mime:file.type,size:file.size,...details});pendingVideos.set(file,pending);
    }
    if(!pending.uploaded){
      const response=await fetch(pending.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type,'Cache-Control':'max-age=31536000'},body:file,signal:AbortSignal.timeout(180000)});
      if(!response.ok)throw Error('Não foi possível enviar o vídeo. Tente novamente.');
      pending.uploaded=true;
    }
    await admin().api({action:'completeVideo',ticket:pending.ticket});pendingVideos.delete(file);
  }
  function preview(){
    previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];
    const container=$('gallery-preview');container.replaceChildren();container.hidden=!selected.length;
    selected.forEach(file=>{
      const item=document.createElement('figure'),image=document.createElement(isVideo(file)?'video':'img'),caption=document.createElement('figcaption');
      const url=URL.createObjectURL(file);previewUrls.push(url);image.src=url;image.alt=`Prévia: ${file.name}`;
      if(isVideo(file)){image.controls=true;image.muted=true;image.playsInline=true;image.preload='metadata';}
      caption.textContent=file.name;item.append(image,caption);container.append(item);
    });
    $('gallery-upload-status').textContent=selected.length?`${selected.length} arquivo${selected.length===1?'':'s'} selecionado${selected.length===1?'':'s'}.`:'';
  }
  form.elements.photo.addEventListener('change',()=>{
    if(uploading)return;
    const files=Array.from(form.elements.photo.files);
    if(files.some(file=>![...videoTypes,'image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)){
      form.elements.photo.value='';selected=[];preview();admin().notice('Selecione fotos JPG, PNG ou WebP e vídeos MP4, WebM ou MOV de até 20 MB cada.',true);return;
    }
    if(files.length>60-photoCount){
      form.elements.photo.value='';selected=[];preview();admin().notice(`A galeria aceita até 60 stories. Você pode adicionar mais ${Math.max(0,60-photoCount)}.`,true);return;
    }
    selected=files;preview();admin().notice('');
  });
  async function compress(file){
    const bitmap=await createImageBitmap(file);
    try{
      const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');context.fillStyle='#faf6ee';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      let quality=.87,data=canvas.toDataURL('image/jpeg',quality);
      while(data.length>2750000&&quality>.4){quality-=.12;data=canvas.toDataURL('image/jpeg',quality);}
      if(data.length>2750000)throw Error('Esta foto ficou muito grande. Escolha uma imagem menor.');
      return {image:data.split(',')[1],mime:'image/jpeg',fit:'contain'};
    }finally{bitmap.close();}
  }
  async function uploadPhoto(file){
    const data={action:'uploadPhoto',...await compress(file)};
    try{await admin().api(data);}
    catch(error){
      // Older deployments still require metadata, even though the form no longer does.
      if(!/Preencha o título e a descrição da foto/.test(error.message))throw error;
      await admin().api({...data,title:'Foto da festa',caption:'',alt:'Foto da festa',published:true});
    }
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(uploading)return;
    const files=[...selected],button=event.submitter||form.querySelector('button[type="submit"]');
    admin().action(button,async()=>{
      if(!files.length)throw Error('Selecione fotos ou vídeos antes de publicar.');
      if(files.length>60-photoCount)throw Error(`A galeria aceita até 60 stories. Você pode adicionar mais ${Math.max(0,60-photoCount)}.`);
      uploading=true;form.elements.photo.disabled=true;
      const label=button.textContent;let sent=0,failure=null;
      try{
        for(const file of files){
          button.textContent=`Publicando ${sent+1} de ${files.length}…`;
          $('gallery-upload-status').textContent=`Preparando e enviando arquivo ${sent+1} de ${files.length}.`;
          try{if(isVideo(file))await uploadVideo(file);else await uploadPhoto(file);}
          catch(error){throw Error(`${file.name}: ${error.message}`);}
          sent++;photoCount++;
        }
      }catch(error){failure=error;}
      finally{
        selected=files.slice(sent);preview();
        if(!selected.length)form.reset();
        form.elements.photo.required=!selected.length;
        button.textContent=label;form.elements.photo.disabled=false;uploading=false;
      }
      try{await admin().load(false);}catch(error){failure ||= error;}
      if(failure)throw Error(`${sent} de ${files.length} stories publicados. ${failure.message}${selected.length?' Os arquivos pendentes continuam selecionados. Clique em Publicar stories para tentar novamente.':''}`);
      admin().notice(`${sent} stor${sent===1?'y publicado':'ies publicados'}.`);
    });
  });
  function render(photos){
    photoCount=photos.length;
    $('gallery-list').replaceChildren();$('gallery-count').textContent=`${photos.length} / 60 stories`;
    if(!photos.length){const p=document.createElement('p');p.className='help';p.textContent='O álbum ainda está vazio. Selecione suas fotos acima para começar.';$('gallery-list').append(p);return;}
    photos.forEach((photo,index)=>{
      const card=document.createElement('article');card.className='panel gallery-admin-card';
      card.innerHTML='<div class="gallery-admin-image"><img loading="lazy" alt=""><span class="gallery-photo-number"></span></div><form><div class="gallery-card-heading"><span class="state"></span><div class="gallery-move"><button type="button" class="secondary" data-direction="-1" aria-label="Mover foto para antes">↑</button><button type="button" class="secondary" data-direction="1" aria-label="Mover foto para depois">↓</button></div></div><label>Enquadramento<select name="fit"><option value="cover">Preencher o story</option><option value="contain">Mostrar a foto inteira</option></select></label><label class="toggle"><input type="checkbox" name="published">Publicar no site</label><button type="submit">Salvar foto</button></form>';
      let image=card.querySelector('img');
      if(photo.type==='video'){const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';image.replaceWith(video);image=video;}
      image.src=photo.url;image.alt=photo.alt||'Registro da festa';image.style.objectFit='contain';
      const fitImage=()=>{const width=image.naturalWidth||image.videoWidth,height=image.naturalHeight||image.videoHeight;image.style.objectFit=width>height?'contain':edit.elements.fit.value;};
      image.addEventListener(photo.type==='video'?'loadedmetadata':'load',fitImage);
      card.querySelector('.gallery-photo-number').textContent=String(index+1).padStart(2,'0');
      const state=card.querySelector('.state');state.textContent=photo.published?'Publicada':'Oculta';state.classList.toggle('open',photo.published);
      const edit=card.querySelector('form');edit.elements.fit.value=photo.fit||'contain';edit.elements.published.checked=photo.published;
      edit.elements.fit.addEventListener('change',fitImage);
      edit.addEventListener('submit',event=>{event.preventDefault();admin().action(event.submitter,async()=>{await admin().api({action:'savePhoto',id:photo.id,title:photo.title||'',caption:photo.caption||'',alt:photo.alt||'Foto da festa',fit:edit.elements.fit.value,published:edit.elements.published.checked});await admin().load(false);admin().notice('Foto atualizada.');});});
      for(const button of card.querySelectorAll('[data-direction]')){
        const direction=Number(button.dataset.direction);button.disabled=direction===-1?index===0:index===photos.length-1;
        button.addEventListener('click',()=>admin().action(button,async()=>{await admin().api({action:'movePhoto',id:photo.id,direction});await admin().load(false);admin().notice('Ordem das fotos atualizada.');}));
      }
      $('gallery-list').append(card);
    });
  }
  window.zanoweenGallery={render};
})();
