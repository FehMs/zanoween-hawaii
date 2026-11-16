(() => {
  const $=id=>document.getElementById(id);
  const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  function notice(text,error=false){$('notice').textContent=text;$('notice').hidden=!text;$('notice').classList.toggle('error',error);}
  function showLogin(){ $('login-panel').hidden=false;$('dashboard').hidden=true;$('logout').hidden=true;$('loading').hidden=true; }
  async function api(data){
    const response=await fetch('/api/admin',{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
    const payload=await response.json();
    if(!response.ok){if(response.status===401)showLogin();throw new Error(payload.error||'Não foi possível concluir.');}return payload;
  }
  async function action(button,fn){button.disabled=true;notice('');try{await fn();}catch(error){notice(error.message||'Confira sua conexão e tente novamente.',true);}finally{button.disabled=false;}}
  function renderLots(lots){
    $('lot-list').replaceChildren();
    for(const lot of lots){
      const female=lot.products.find(p=>p.gender==='mulher'),male=lot.products.find(p=>p.gender==='homem');
      const occupied=Number(lot.paid)+Number(lot.pending),enabled=lot.products.some(p=>p.sales_enabled),remaining=Math.max(0,(lot.capacity||0)-occupied);
      const card=document.createElement('article');card.className='lot-card';
      card.innerHTML=`<div class="lot-top"><span class="lot-number">LOTE 0${Number(lot.lot)}</span><span class="state ${enabled?'open':''}">${enabled?'Liberado':'Pausado'}</span></div><h3>${Number(lot.lot)}º lote</h3><p class="inventory">${remaining} livres · ${Number(lot.paid)} pagos · ${Number(lot.pending)} pendentes</p><progress max="${Number(lot.capacity)||1}" value="${occupied}" aria-label="Vagas ocupadas"></progress><form><label>Quantidade total<input name="capacity" type="number" min="${Math.max(1,occupied)}" max="100000" step="1" required></label><div class="prices"><label>Mulher · R$<input name="femalePrice" type="number" min="0.01" max="100000" step="0.01" required></label><label>Homem · R$<input name="malePrice" type="number" min="0.01" max="100000" step="0.01" required></label></div><label class="toggle"><input type="checkbox" name="enabled">Liberar vendas deste lote</label><button type="submit">Salvar ${Number(lot.lot)}º lote →</button></form>`;
      const form=card.querySelector('form');form.elements.capacity.value=lot.capacity||'';form.elements.femalePrice.value=(female.price_cents/100).toFixed(2);form.elements.malePrice.value=(male.price_cents/100).toFixed(2);form.elements.enabled.checked=enabled;
      form.addEventListener('submit',event=>{event.preventDefault();action(form.querySelector('button'),async()=>{
        await api({action:'saveLot',lot:Number(lot.lot),capacity:Number(form.elements.capacity.value),femalePrice:Math.round(Number(form.elements.femalePrice.value)*100),malePrice:Math.round(Number(form.elements.malePrice.value)*100),enabled:form.elements.enabled.checked});
        await load(false);notice(`${lot.lot}º lote salvo. As alterações já estão disponíveis no site.`);
      });});$('lot-list').append(card);
    }
  }
  async function load(fillContent=true){
    const snapshot=await api();$('loading').hidden=true;$('login-panel').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;
    $('total-paid').textContent=snapshot.lots.reduce((n,l)=>n+Number(l.paid),0);$('total-pending').textContent=snapshot.lots.reduce((n,l)=>n+Number(l.pending),0);$('total-revenue').textContent=money.format(snapshot.lots.reduce((n,l)=>n+Number(l.revenue),0)/100);
    $('checkout-warning').hidden=snapshot.checkoutReady;renderLots(snapshot.lots);
    renderPartners(snapshot.partners||[]);
    if(fillContent)for(const [key,value]of Object.entries(snapshot.content))if($('content-form').elements[key])$('content-form').elements[key].value=value;
  }
  let partners=[];
  function renderPartners(items){
    partners=items;$('partner-list').replaceChildren();
    if(!items.length){const empty=document.createElement('p');empty.className='help';empty.textContent='Nenhum parceiro cadastrado. Crie o primeiro código acima.';$('partner-list').append(empty);return;}
    for(const partner of items){
      const card=document.createElement('article');card.className='panel partner-card';
      card.innerHTML='<div class="partner-heading"><strong class="partner-code"></strong><span class="state"></span></div><form><label>Nome do parceiro<input name="name" minlength="2" maxlength="120" required></label><p class="partner-results"></p><label class="toggle"><input type="checkbox" name="active">Código ativo</label><button type="submit" class="secondary">Salvar parceiro</button></form>';
      card.querySelector('.partner-code').textContent=partner.code;
      const state=card.querySelector('.state');state.textContent=partner.active?'Ativo':'Pausado';state.classList.toggle('open',partner.active);
      card.querySelector('.partner-results').textContent=`${Number(partner.paid)} pagos · ${Number(partner.pending)} pendentes · ${money.format(Number(partner.revenue)/100)} confirmados`;
      const form=card.querySelector('form');form.elements.name.value=partner.name;form.elements.active.checked=partner.active;
      form.addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{await api({action:'savePartner',code:partner.code,name:form.elements.name.value,active:form.elements.active.checked});await load(false);notice('Parceiro atualizado.');});});
      $('partner-list').append(card);
    }
  }
  $('partner-form').addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{
    const form=$('partner-form'),code=form.elements.code.value.trim().toUpperCase();
    if(partners.some(p=>p.code===code))throw new Error('Este código já existe. Edite o parceiro na lista abaixo.');
    await api({action:'savePartner',code,name:form.elements.name.value,active:true});form.reset();await load(false);notice('Parceiro cadastrado. Compartilhe o código com o divulgador.');
  });});
  $('login-form').addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{await api({action:'login',password:$('password').value});$('password').value='';await load();});});
  $('logout').addEventListener('click',()=>action($('logout'),async()=>{await api({action:'logout'});showLogin();notice('Sessão encerrada.');}));
  $('refresh').addEventListener('click',()=>action($('refresh'),async()=>{await load(false);notice('Resumo atualizado.');}));
  $('content-form').addEventListener('submit',event=>{event.preventDefault();action(event.submitter,async()=>{const content=Object.fromEntries(new FormData($('content-form')));await api({action:'saveContent',content});notice('Conteúdo salvo. Recarregue o site para ver as alterações.');});});
  load().catch(error=>{if(!$('login-panel').hidden)return;$('loading').textContent='Painel indisponível.';notice(error.message,true);});
})();
