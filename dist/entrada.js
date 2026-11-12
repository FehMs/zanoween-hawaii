(() => {
  const form=document.getElementById('entry-form'),person=document.getElementById('entry-person'),result=document.getElementById('entry-result'),confirm=document.getElementById('confirm-entry');
  let verifiedCode,busy=false;
  async function request(admit){
    if(busy)return;
    if(admit&&(!verifiedCode||!document.getElementById('rg-checked').checked)){result.textContent='Confira o nome no RG e marque a confirmação.';return;}
    busy=true;confirm.disabled=true;form.querySelector('button').disabled=true;
    try{
      const response=await fetch('/api/check-in',{method:'POST',headers:{'Content-Type':'application/json','X-Checkin-Token':form.elements.staffCode.value},body:JSON.stringify({ticketCode:admit?verifiedCode:form.elements.ticketCode.value.trim(),confirm:admit,rgChecked:admit&&document.getElementById('rg-checked').checked}),signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Não foi possível consultar.');
      if(admit){person.hidden=true;verifiedCode=null;result.textContent='Entrada confirmada para '+data.name+'.';form.elements.ticketCode.value='';}
      else{verifiedCode=data.used?null:form.elements.ticketCode.value.trim();document.getElementById('entry-name').textContent=data.name;document.getElementById('rg-checked').checked=false;person.hidden=data.used;result.textContent=data.used?'Este ingresso já foi utilizado. Não libere outra entrada.':'Ingresso válido. Confira o nome no RG.';}
    }catch(error){person.hidden=true;verifiedCode=null;result.textContent=error.name==='TimeoutError'?'Não foi possível confirmar. Consulte o ingresso novamente antes de liberar a entrada.':error.message;}
    finally{busy=false;confirm.disabled=false;form.querySelector('button').disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())request(false);});
  form.addEventListener('input',()=>{person.hidden=true;verifiedCode=null;});
  confirm.addEventListener('click',()=>request(true));
})();
