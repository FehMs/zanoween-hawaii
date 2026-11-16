(() => {
  const $=id=>document.getElementById(id),form=$('gallery-form');if(!form)return;
  let previewUrl=null,selected=null;
  const admin=()=>window.zanoweenAdmin;
  const fields=form=>({title:form.elements.title.value,caption:form.elements.caption.value,alt:form.elements.alt.value,fit:form.elements.fit.value,published:form.elements.published.checked});
  function resetPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;selected=null;$('gallery-preview').hidden=true;}
  form.elements.photo.addEventListener('change',()=>{
    resetPreview();selected=form.elements.photo.files[0];if(!selected)return;
    if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>20*1024*1024){form.elements.photo.value='';selected=null;admin().notice('Selecione uma foto JPG, PNG ou WebP de até 20 MB.',true);return;}
    previewUrl=URL.createObjectURL(selected);$('gallery-preview').src=previewUrl;$('gallery-preview').hidden=false;
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
      return {image:data.split(',')[1],mime:'image/jpeg'};
    }finally{bitmap.close();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();const file=selected,button=event.submitter;
    admin().action(button,async()=>{
      if(!file)throw Error('Selecione uma foto antes de cadastrar.');
      const values=fields(form),label=button.textContent;button.textContent='Preparando e enviando…';
      try{const data=await compress(file);await admin().api({action:'uploadPhoto',...values,...data});form.reset();resetPreview();await admin().load(false);admin().notice(values.published?'Foto publicada na galeria.':'Foto salva como oculta. Você pode publicá-la na lista abaixo.');}
      finally{button.textContent=label;}
    });
  });
  function render(photos){
    $('gallery-list').replaceChildren();$('gallery-count').textContent=`${photos.length} / 60 fotos`;
    if(!photos.length){const p=document.createElement('p');p.className='help';p.textContent='O álbum ainda está vazio. Envie a primeira foto acima para começar.';$('gallery-list').append(p);return;}
    photos.forEach((photo,index)=>{
      const card=document.createElement('article');card.className='panel gallery-admin-card';
      card.innerHTML='<div class="gallery-admin-image"><img loading="lazy" alt=""><span class="gallery-photo-number"></span></div><form><div class="gallery-card-heading"><span class="state"></span><div class="gallery-move"><button type="button" class="secondary" data-direction="-1" aria-label="Mover foto para antes">↑</button><button type="button" class="secondary" data-direction="1" aria-label="Mover foto para depois">↓</button></div></div><label>Título<input name="title" maxlength="90" required></label><label>Legenda<textarea name="caption" maxlength="280" rows="2"></textarea></label><label>Descrição da imagem<input name="alt" maxlength="180" required></label><label>Enquadramento<select name="fit"><option value="cover">Preencher o story</option><option value="contain">Mostrar a foto inteira</option></select></label><label class="toggle"><input type="checkbox" name="published">Publicar no site</label><button type="submit">Salvar foto</button></form>';
      const image=card.querySelector('img');image.src=photo.url;image.alt=photo.alt;image.style.objectFit=photo.fit;
      card.querySelector('.gallery-photo-number').textContent=String(index+1).padStart(2,'0');
      const state=card.querySelector('.state');state.textContent=photo.published?'Publicada':'Oculta';state.classList.toggle('open',photo.published);
      const edit=card.querySelector('form');for(const key of ['title','caption','alt','fit'])edit.elements[key].value=photo[key]||'';edit.elements.published.checked=photo.published;
      edit.elements.fit.addEventListener('change',()=>{image.style.objectFit=edit.elements.fit.value;});
      edit.addEventListener('submit',event=>{event.preventDefault();admin().action(event.submitter,async()=>{await admin().api({action:'savePhoto',id:photo.id,...fields(edit)});await admin().load(false);admin().notice('Foto atualizada.');});});
      for(const button of card.querySelectorAll('[data-direction]')){
        const direction=Number(button.dataset.direction);button.disabled=direction===-1?index===0:index===photos.length-1;
        button.addEventListener('click',()=>admin().action(button,async()=>{await admin().api({action:'movePhoto',id:photo.id,direction});await admin().load(false);admin().notice('Ordem das fotos atualizada.');}));
      }
      $('gallery-list').append(card);
    });
  }
  window.zanoweenGallery={render};
})();
