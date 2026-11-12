const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
function ui(config,storage=new Map()){
  const node=()=>({hidden:false,disabled:false,required:false,value:'',checked:false,textContent:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(){},removeAttribute(){},select(){}});
  const ids={};for(const id of ['ticket-checkout','checkout-form','checkout-result','checkout-payment','checkout-total','checkout-category','checkout-title','checkout-spinner','checkout-success-icon','checkout-preview','tickets-availability','pix-details','paid-ticket','paid-ticket-code','pix-code','pix-image','payment-message','ticket-email-status','new-purchase','refresh-payment','copy-pix'])ids[id]=node();
  const form=ids['checkout-form'],dialog=ids['ticket-checkout'],submit=node(),close=node(),footnote=node(),badge=node(),opener=node();
  const female={...node(),value:'mulher',nextElementSibling:{querySelector:()=>node()}},male={...node(),value:'homem',nextElementSibling:{querySelector:()=>node()}};
  const gender=[female,male];gender.value='mulher';
  const fullName={...node(),value:'Pessoa Teste'},email={...node(),value:'test@example.com'},phone=node(),ack={...node(),checked:true};
  form.elements=[female,male,fullName,email,phone,ack,submit];Object.assign(form.elements,{gender,fullName,email,phone,acknowledgement:ack});
  form.querySelector=()=>submit;form.reportValidity=()=>true;form.reset=()=>{};
  dialog.querySelector=selector=>selector==='.checkout-close'?close:footnote;dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.handlers.close();};
  const requests=[],timers=new Map();let state='pending',emailStatus='sent',timerId=0;
  const fetch=async(url,options)=>{
    if(url==='/api/checkout-config')return {ok:true,json:async()=>config};
    const data=JSON.parse(options.body);requests.push({url,data,headers:options.headers});
    return {ok:true,json:async()=>({id:data.requestId||data.id,status:state,priceCents:4500,pixCode:state==='pending'?'PIX-CODE':null,pixImage:null,ticketCode:state==='paid'?'TICKET-UNIQUE':null,emailStatus})};
  };
  const document={hidden:false,getElementById:id=>ids[id],querySelector:()=>badge,querySelectorAll:()=>[opener],addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/tickets.js'),'utf8'),{document,fetch,Intl,AbortSignal,crypto:{randomUUID},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),navigator:{clipboard:{writeText:async()=>{}}}});
  return {ids,submit,opener,form,requests,storage,footnote,timers,complete:()=>{state='paid';},emailStatus:value=>{emailStatus=value;},settle:()=>new Promise(resolve=>setImmediate(resolve)),async tick(){const [id,fn]=[...timers][0]||[];assert.ok(fn);timers.delete(id);await fn();}};
}
test('checkout UI generates Pix, resumes a saved order and displays paid ticket',async()=>{
  const app=ui({checkoutEnabled:true,products:[{gender:'mulher',priceCents:4500},{gender:'homem',priceCents:5000}]});
  await app.settle();assert.equal(app.submit.textContent,'Gerar Pix');
  await app.opener.handlers.click();await app.form.handlers.submit({preventDefault(){}});
  assert.equal(app.requests[0].url,'/api/checkout');assert.equal(app.requests[0].data.priceCents,undefined);assert.equal(app.requests[0].data.status,undefined);assert.equal(app.requests[0].data.accessToken.length,64);
  assert.equal(app.ids['pix-code'].value,'PIX-CODE');assert.equal(app.form.hidden,true);assert.ok(app.storage.get('zanoween-checkout'));
  app.complete();await app.ids['refresh-payment'].handlers.click();
  assert.equal(app.ids['paid-ticket-code'].textContent,'TICKET-UNIQUE');assert.equal(app.ids['paid-ticket'].hidden,false);assert.equal(app.ids['pix-details'].hidden,true);
  const resumed=ui({checkoutEnabled:true,products:[{gender:'mulher',priceCents:4500}]},app.storage);await resumed.settle();resumed.complete();await resumed.opener.handlers.click();
  assert.equal(resumed.requests[0].url,'/api/order-status');assert.equal(resumed.ids['paid-ticket-code'].textContent,'TICKET-UNIQUE');
  resumed.ids['new-purchase'].handlers.click();assert.equal(app.storage.size,0);
});
test('closed sales cannot submit a purchase or invoke a mail bypass',async()=>{
  const closed=ui({checkoutEnabled:false});await closed.settle();assert.equal(closed.submit.disabled,true);assert.equal(closed.submit.textContent,'Vendas em breve');
  await closed.form.handlers.submit({preventDefault(){}});assert.equal(closed.requests.length,0);
});

test('production loading continues automatically until the email is accepted',async()=>{
  const app=ui({checkoutEnabled:true,products:[{gender:'mulher',priceCents:4500}]});await app.settle();await app.opener.handlers.click();
  const creating=app.form.handlers.submit({preventDefault(){}});await creating;
  app.complete();app.emailStatus('pending');await app.tick();
  assert.equal(app.ids['checkout-spinner'].hidden,false);assert.equal(app.ids['checkout-success-icon'].hidden,true);assert.equal(app.ids['refresh-payment'].hidden,true);assert.equal(app.timers.size,1);assert.ok(!app.ids['ticket-email-status'].textContent.includes('E-mail enviado'));
  app.emailStatus('sent');await app.tick();assert.equal(app.ids['checkout-spinner'].hidden,true);assert.equal(app.ids['checkout-success-icon'].hidden,false);assert.match(app.ids['checkout-preview'].textContent,/Enviamos/);assert.equal(app.timers.size,0);
});
