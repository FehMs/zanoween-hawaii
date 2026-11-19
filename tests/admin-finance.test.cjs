const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createAdmin}=require('../server/admin.cjs');

test('financial API requires admin authentication, validates expenses and never accepts client totals',async()=>{
  const env={ADMIN_PASSWORD:'a'.repeat(40),APP_URL:'https://example.com'},calls=[];
  const handler=createAdmin({env,db:{async request(...args){calls.push(args);return {revenueCents:4500,expenseCents:1000,profitCents:3500};}}});
  async function call(body,cookie='',url='/api/admin',origin=env.APP_URL){
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.data=JSON.parse(value);}};
    await handler({url,method:body?'POST':'GET',body,headers:{cookie,origin,'content-type':'application/json'}},res);return res;
  }
  const expense={action:'saveExpense',id:randomUUID(),description:' Aluguel ',category:'estrutura',expenseDate:'2026-11-19',amountCents:1001,profitCents:999999};
  assert.equal((await call(expense)).statusCode,401);assert.equal((await call(null,'','/api/admin?view=finance')).statusCode,401);assert.equal(calls.length,0);
  const login=await call({action:'login',password:env.ADMIN_PASSWORD}),cookie=login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call(expense,cookie)).statusCode,200);
  assert.deepEqual(calls[0],[ 'event_expenses?on_conflict=id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{id:expense.id,description:'Aluguel',category:'estrutura',amount_cents:1001,expense_date:'2026-11-19'}} ]);
  for(const invalid of [{amountCents:1.5},{amountCents:0},{amountCents:100000001},{amountCents:'10'},{expenseDate:'2026-02-30'},{expenseDate:'1999-12-31'},{category:'fake'},{description:'x'},{id:'bad'}])assert.equal((await call({...expense,...invalid},cookie)).statusCode,400);
  assert.equal((await call(expense,cookie,'/api/admin','https://evil.example')).statusCode,403);assert.equal(calls.length,1);
  const finance=await call(null,cookie,'/api/admin?view=finance&page=2');assert.equal(finance.data.profitCents,3500);assert.deepEqual(calls.at(-1),['rpc/admin_finance',{method:'POST',body:{p_page:2}}]);
  assert.equal((await call(null,cookie,'/api/admin?view=finance&page=-1')).statusCode,400);
  assert.equal((await call({action:'deleteExpense',id:expense.id},cookie)).statusCode,200);assert.deepEqual(calls.at(-1),[`event_expenses?id=eq.${expense.id}`,{method:'DELETE'}]);
});

test('finance database totals cover all expenses, frozen paid prices, refunds, edits, pagination and permissions',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    for(const file of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    await db.exec('set role service_role; update public.ticket_products set sales_enabled=true;');
    const summary=async(page=0)=>(await db.query('select public.admin_finance($1) as value',[page])).rows[0].value;
    assert.equal((await summary()).profitCents,0);assert.deepEqual((await summary()).expenses,[]);
    const reserve=async(isTest=false)=>{
      const id=randomUUID();return (await db.query('select public.reserve_checkout($1,$2,$3,$4,null,$5,$6,$7,1::smallint,null) as value',[id,'a'.repeat(64),'Pessoa Teste',`${id}@example.com`,'mulher',id.padEnd(64,'a'),isTest])).rows[0].value;
    };
    const paid=await reserve(),sandbox=await reserve(true);await reserve();
    await db.query("select public.apply_verified_payment($1,'ORDREAL','PAYREAL','paid','processed')",[paid.id]);
    await db.query("select public.apply_verified_payment($1,'ORDTEST','PAYTEST','paid','processed')",[sandbox.id]);
    await db.exec('update public.ticket_products set price_cents=9999;');
    const expense=randomUUID();
    await db.query("insert into public.event_expenses(id,description,category,amount_cents,expense_date) values($1,'Espaço','estrutura',1001,'2026-11-19')",[expense]);
    let data=await summary();assert.equal(data.revenueCents,4500);assert.equal(data.expenseCents,1001);assert.equal(data.profitCents,3499);
    await db.query('update public.event_expenses set amount_cents=5000 where id=$1',[expense]);assert.equal((await summary()).profitCents,-500);
    await db.exec("insert into public.event_expenses(id,description,category,amount_cents,expense_date) select gen_random_uuid(),'Taxa '||n,'taxas',1,'2026-11-18' from generate_series(1,50) n;");
    data=await summary();assert.equal(data.expenses.length,50);assert.equal(data.expenseCount,51);assert.equal(data.expenseCents,5050);assert.equal(data.hasMore,true);assert.equal(data.expenses[0].id,expense);
    const second=await summary(1);assert.equal(second.expenses.length,1);assert.equal(second.hasMore,false);assert.equal(second.expenseCents,5050);
    await db.query("select public.apply_verified_payment($1,'ORDREAL','PAYREAL','refunded','refunded')",[paid.id]);assert.equal((await summary()).revenueCents,0);
    await db.query('delete from public.event_expenses where id=$1',[expense]);assert.equal((await summary()).expenseCents,50);
    await assert.rejects(db.exec("insert into public.event_expenses(id,description,category,amount_cents,expense_date) values(gen_random_uuid(),'Inválido','outros',-1,'2026-11-19')"),/check constraint/);
    for(const role of ['anon','authenticated']){
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query('select * from public.event_expenses'),/permission denied/);
      await assert.rejects(summary(),/permission denied/);
      await assert.rejects(db.exec('delete from public.event_expenses'),/permission denied/);
    }
  }finally{await db.close();}
});

function financeUI(){
  const node=()=>({hidden:false,disabled:false,value:'',textContent:'',style:{},children:[],handlers:{},classList:{toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){},focus(){},scrollIntoView(){}});
  const ids={},get=id=>ids[id]||=node(),form=get('expense-form'),names=['expenseId','description','category','expenseDate','amount'];
  form.elements=names.map(()=>node());names.forEach((name,i)=>form.elements[name]=form.elements[i]);form.reset=()=>{form.elements.forEach(field=>field.value='');form.elements.category.value='estrutura';};form.reportValidity=()=>true;
  const data={revenueCents:10000,expenseCents:2500,profitCents:7500,expenseCount:1,page:0,hasMore:false,expenses:[{id:randomUUID(),description:'<img src=x>',category:'taxas',amount_cents:2500,expense_date:'2026-11-19'}]};
  const requests=[];let failSave=false;const win={zanoweenAdmin:{async api(body,url){requests.push({body,url});if(body&&failSave)throw Error('Conexão indisponível');return data;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/admin-finance.js'),'utf8'),{document:{getElementById:get,createElement:node,querySelectorAll:()=>[]},window:win,Intl,crypto:{randomUUID}});
  return {ids,get,form,win,data,requests,fail:value=>{failSave=value;}};
}

test('financial UI computes margin, renders loss and saves exact cents with a stable ID on retry',async()=>{
  const ui=financeUI();await ui.get('finance-toggle').handlers.click();
  assert.match(ui.get('finance-profit').textContent,/75,00/);assert.match(ui.get('finance-margin').textContent,/75%/);assert.equal(ui.get('expense-list').children[0].children[0].textContent,'<img src=x>');
  const fields=ui.form.elements;fields.description.value='Aluguel';fields.amount.value='10,01';
  ui.fail(true);await ui.form.handlers.submit({preventDefault(){}});const first=ui.requests.at(-1).body;
  assert.equal(first.amountCents,1001);assert.match(ui.get('finance-notice').textContent,/Conexão/);assert.equal(ui.get('expense-submit').disabled,false);
  ui.fail(false);await ui.form.handlers.submit({preventDefault(){}});assert.equal(ui.requests.at(-2).body.id,first.id);assert.equal(fields.expenseId.value,'');
  fields.amount.value='1.234,56';const count=ui.requests.length;await ui.form.handlers.submit({preventDefault(){}});assert.equal(ui.requests.length,count);assert.match(ui.get('finance-notice').textContent,/sem separador/);
  ui.data.revenueCents=0;ui.data.profitCents=-2500;await ui.win.zanoweenFinance.load();assert.equal(ui.get('finance-result-label').textContent,'Prejuízo parcial');assert.match(ui.get('finance-margin').textContent,/sem receita/);assert.equal(ui.get('finance-revenue-bar').style.width,'0%');
});

test('financial UI edits, deletes and paginates expenses with global totals',async()=>{
  const ui=financeUI();ui.data.hasMore=true;await ui.get('finance-toggle').handlers.click();
  const buttons=ui.get('expense-list').children[0].children[4].children;buttons[0].handlers.click();assert.equal(ui.form.elements.expenseId.value,ui.data.expenses[0].id);assert.equal(ui.form.elements.amount.value,'25,00');assert.equal(ui.get('expense-cancel').hidden,false);
  ui.data.page=1;await ui.get('expense-next').handlers.click();assert.equal(ui.requests.at(-1).url,'/api/admin?view=finance&page=1');assert.match(ui.get('finance-expenses').textContent,/25,00/);
  ui.data.page=0;ui.data.expenses=[];ui.data.expenseCount=0;ui.data.expenseCents=0;ui.data.hasMore=false;await buttons[1].handlers.click();
  assert.equal(ui.requests.at(-3).body.action,'deleteExpense');assert.equal(ui.get('expense-empty').hidden,false);assert.equal(ui.get('expense-table').hidden,true);assert.equal(ui.form.elements.expenseId.value,'');
});

test('financial dashboard starts hidden and only loads after an explicit button click',async()=>{
  const ui=financeUI();
  assert.equal(ui.get('finance-content').hidden,true);
  await ui.win.zanoweenFinance.load();assert.equal(ui.requests.length,0);
  await ui.get('finance-toggle').handlers.click();assert.equal(ui.get('finance-content').hidden,false);assert.equal(ui.requests.length,1);
  await ui.get('finance-toggle').handlers.click();assert.equal(ui.get('finance-content').hidden,true);
  await ui.win.zanoweenFinance.load();assert.equal(ui.requests.length,1);
  await ui.get('finance-toggle').handlers.click();assert.equal(ui.get('finance-content').hidden,false);
  ui.win.zanoweenFinance.hide();assert.equal(ui.get('finance-content').hidden,true);
  assert.equal(financeUI().get('finance-content').hidden,true);
});
