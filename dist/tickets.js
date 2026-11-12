(() => {
  const dialog=document.getElementById('ticket-checkout'),form=document.getElementById('checkout-form');
  if(!dialog||!form)return;
  const byId=id=>document.getElementById(id);
  const submit=form.querySelector('[type="submit"]'),close=dialog.querySelector('.checkout-close');
  const result=byId('checkout-result'),payment=byId('checkout-payment');
  const prices={mulher:45,homem:50},money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  let config={},busy=false,timer,session;
  try{session=JSON.parse(sessionStorage.getItem('zanoween-checkout')||'null');}catch{}
  if(session&&(!/^[a-f0-9-]{36}$/i.test(session.id||'')||!/^[a-f0-9]{64}$/.test(session.accessToken||'')))session=null;
  const saveSession=value=>{session=value;try{if(value)sessionStorage.setItem('zanoween-checkout',JSON.stringify(value));else sessionStorage.removeItem('zanoween-checkout');}catch{}};
  const message=text=>{result.textContent=text;result.hidden=false;};
  function setBusy(value,blocking=false){busy=value;submit.disabled=value||!config.checkoutEnabled;close.disabled=value&&blocking;form.setAttribute('aria-busy',String(value));submit.textContent=value?'Aguarde…':config.checkoutEnabled?'Gerar Pix':'Vendas em breve';}
  function heading(title,copy){byId('checkout-title').textContent=title;byId('checkout-preview').textContent=copy;}
  function loading(){form.hidden=true;payment.hidden=false;byId('pix-details').hidden=true;byId('paid-ticket').hidden=true;byId('refresh-payment').hidden=true;byId('new-purchase').hidden=true;byId('checkout-spinner').hidden=false;byId('checkout-success-icon').hidden=true;byId('payment-message').textContent='';heading('Preparando seu Pix','Só um instante. Estamos deixando tudo pronto.');}
  async function api(path,data){
    let response;
    try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(55000)});}catch{throw new Error('A conexão oscilou. Estamos conferindo sua compra; não gere outro pagamento.');}
    const payload=await response.json();
    if(!response.ok){const error=new Error(payload.error||'Não foi possível concluir.');error.status=response.status;throw error;}return payload;
  }
  function summary(){const gender=form.elements.gender.value;byId('checkout-total').textContent=prices[gender]?money.format(prices[gender]):'—';byId('checkout-category').textContent=gender==='mulher'?'Mulher':gender==='homem'?'Homem':'Selecione o gênero';result.hidden=true;}
  function showForm(){form.hidden=false;payment.hidden=true;heading('Seu lugar na festa.',config.checkoutEnabled?'Preencha os dados do participante para gerar o Pix.':'As vendas ainda não estão abertas. Entre no grupo para acompanhar as novidades.');summary();}
  const ready=fetch('/api/checkout-config',{cache:'no-store',signal:AbortSignal.timeout(15000)})
    .then(r=>r.ok?r.json():{}).then(value=>{
      config=value;
      if(config.checkoutEnabled){
        for(const product of config.products||[])prices[product.gender]=product.priceCents/100;
        for(const radio of form.elements.gender){radio.disabled=!(config.products||[]).some(p=>p.gender===radio.value);radio.nextElementSibling.querySelector('strong').textContent=money.format(prices[radio.value]);}
        byId('tickets-availability').textContent='1º lote disponível. Pagamento via Pix.';
        document.querySelector('.ticket-badge').textContent='Lote atual';
      }
      showForm();
    }).catch(()=>{heading('Seu lugar na festa.','Não foi possível carregar a disponibilidade. Atualize a página para tentar novamente.');})
    .finally(()=>setBusy(false));
  function schedule(){clearTimeout(timer);if(session&&dialog.open&&!document.hidden)timer=setTimeout(refresh,15000);}
  function renderPayment(order){
    form.hidden=true;payment.hidden=false;
    const pending=order.status==='pending',paid=order.status==='paid',emailed=paid&&order.emailStatus==='sent';
    byId('checkout-spinner').hidden=emailed||(!pending&&!paid);byId('checkout-success-icon').hidden=!emailed;
    byId('payment-message').textContent='';byId('refresh-payment').hidden=true;
    byId('pix-details').hidden=!pending||!order.pixCode;byId('paid-ticket').hidden=!paid||!order.ticketCode;
    byId('paid-ticket-code').textContent=order.ticketCode||'';byId('pix-code').value=order.pixCode||'';
    const image=byId('pix-image');image.hidden=!pending||!order.pixImage;
    if(pending&&order.pixImage&&/^[A-Za-z0-9+/=\r\n]+$/.test(order.pixImage))image.src=`data:image/png;base64,${order.pixImage}`;
    if(paid)heading('Pagamento confirmado!',emailed?'Enviamos as informações e seu ingresso para o seu e-mail.':'Estamos finalizando o envio das informações para seu e-mail.');
    else if(pending)heading(order.pixCode?'Pague com Pix':'Preparando seu Pix',order.pixCode?'Pague '+money.format(order.priceCents/100)+'. A confirmação aparece aqui automaticamente.':'Seu Pix está sendo preparado. Só mais um instante.');
    else heading(order.status==='refunded'?'Pagamento estornado':'Pix encerrado',order.status==='refunded'?'Este ingresso não é válido.':'Você pode iniciar uma nova compra.');
    byId('ticket-email-status').textContent=emailed?'E-mail enviado. Confira sua caixa de entrada e a pasta de spam.':'Seu ingresso está disponível acima. Estamos cuidando do envio por e-mail.';
    byId('new-purchase').hidden=pending;
    clearTimeout(timer);if(pending||(paid&&!emailed))schedule();
  }
  async function refresh(){
    if(!session||busy)return;setBusy(true);byId('refresh-payment').disabled=true;
    try{renderPayment(await api('/api/order-status',{id:session.id,accessToken:session.accessToken}));}
    catch(error){
      if(error.status===404){saveSession(null);showForm();message('A compra anterior não foi encontrada. Preencha os dados para iniciar.');}
      else{form.hidden=true;payment.hidden=false;byId('payment-message').textContent=error.message;byId('refresh-payment').hidden=false;schedule();}
    }finally{setBusy(false);byId('refresh-payment').disabled=false;}
  }
  document.querySelectorAll('[data-open-checkout]').forEach(button=>button.addEventListener('click',async()=>{dialog.showModal();await ready;if(session){loading();await refresh();}else showForm();}));
  close.addEventListener('click',()=>{if(!close.disabled)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(close.disabled)event.preventDefault();});
  dialog.addEventListener('close',()=>{clearTimeout(timer);form.reset();summary();});
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden&&dialog.open&&session)refresh();});
  byId('refresh-payment').addEventListener('click',refresh);
  byId('copy-pix').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(byId('pix-code').value);byId('copy-pix').textContent='Pix copiado';}catch{byId('pix-code').select();byId('payment-message').textContent='Selecione e copie o código Pix acima.';}});
  byId('new-purchase').addEventListener('click',()=>{clearTimeout(timer);saveSession(null);form.reset();showForm();});
  form.addEventListener('input',summary);
  form.addEventListener('submit',async event=>{
    event.preventDefault();await ready;if(busy||!config.checkoutEnabled||!form.reportValidity())return;
    if(session){loading();await refresh();return;}
    const data={fullName:form.elements.fullName.value.trim(),email:form.elements.email.value.trim(),phone:form.elements.phone.value.trim(),gender:form.elements.gender.value,acknowledgement:form.elements.acknowledgement.checked};
    if(!Object.hasOwn(prices,data.gender))return;setBusy(true,true);loading();
    const controls=Array.from(form.elements).filter(control=>!control.disabled);controls.forEach(control=>{control.disabled=true;});
    const pointer={id:crypto.randomUUID(),accessToken:(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-','')};saveSession(pointer);
    try{renderPayment(await api('/api/checkout',{...data,requestId:pointer.id,accessToken:pointer.accessToken}));}
    catch(error){
      if(error.status&&error.status<500){saveSession(null);showForm();message(error.message);}
      else{byId('payment-message').textContent=error.message;byId('refresh-payment').hidden=false;schedule();}
    }finally{controls.forEach(control=>{control.disabled=false;});setBusy(false);}
  });
})();
