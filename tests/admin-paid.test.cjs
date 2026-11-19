const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createAdmin}=require('../server/admin.cjs');

test('paid attendee API requires admin login and returns bounded pages of real paid orders',async()=>{
  const env={ADMIN_PASSWORD:'a'.repeat(40),APP_URL:'https://example.com'},calls=[];
  const people=Array.from({length:51},(_,i)=>({full_name:`Pessoa ${i}`}));
  const handler=createAdmin({env,db:{async request(path){calls.push(path);return people;}}});
  async function call(url,cookie='',body){
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.data=JSON.parse(value);}};
    await handler({url,method:body?'POST':'GET',body,headers:{cookie,origin:env.APP_URL,'content-type':'application/json'}},res);return res;
  }
  assert.equal((await call('/api/admin?view=paid')).statusCode,401);assert.equal(calls.length,0);
  const login=await call('/api/admin','',{action:'login',password:env.ADMIN_PASSWORD});
  const cookie=login.headers['Set-Cookie'].split(';')[0];
  const result=await call('/api/admin?view=paid&page=1',cookie);
  assert.equal(result.statusCode,200);assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(result.data.people.length,50);assert.equal(result.data.hasMore,true);assert.equal(result.data.page,1);
  assert.match(calls[0],/status=eq.paid&is_test=eq.false/);assert.match(calls[0],/limit=51&offset=50$/);
  assert.ok(!calls[0].includes('access_token'));assert.ok(!calls[0].includes('entry_token'));
  assert.equal((await call('/api/admin?view=paid&page=-1',cookie)).statusCode,400);
  assert.equal((await call('/api/admin?view=paid&page=1.5',cookie)).statusCode,400);
  assert.equal(calls.length,1);
});

test('admin renders paid people as text, paginates, refreshes and shows an empty list',async()=>{
  const node=()=>({hidden:false,disabled:false,textContent:'',children:[],handlers:{},elements:{},classList:{toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
  const ids={},requests=[];let empty=false,fail=false;
  const person={full_name:'<img src=x onerror=alert(1)>',email:'pessoa@example.com',phone:null,price_cents:4500,paid_at:'2026-11-19T12:00:00Z',ticket_products:{lot:2,gender:'mulher'}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/admin.js'),'utf8'),{
    document:{getElementById:id=>ids[id]||=node(),createElement:()=>node()},window:{},Intl,AbortSignal,
    fetch:async url=>{requests.push(url);return {ok:!fail,status:fail?503:200,json:async()=>fail?{error:'Falha ao carregar'}:url.includes('view=paid')?{people:empty?[]:[person],page:Number(new URL(url,'https://example.com').searchParams.get('page')),hasMore:!empty}:{lots:[],partners:[],content:{},checkoutReady:true}};}
  });
  await new Promise(resolve=>setImmediate(resolve));
  const cells=ids['paid-list'].children[0].children;
  assert.equal(cells[0].textContent,person.full_name);assert.equal(cells[1].textContent,person.email);
  assert.equal(cells[2].textContent,'—');assert.equal(cells[3].textContent,'2º lote · Mulher');assert.match(cells[4].textContent,/45,00/);assert.match(cells[5].textContent,/09:00/);
  assert.equal(ids['paid-prev'].hidden,true);assert.equal(ids['paid-next'].hidden,false);
  await ids['paid-next'].handlers.click();assert.equal(requests.at(-1),'/api/admin?view=paid&page=1');assert.equal(ids['paid-prev'].hidden,false);
  fail=true;await ids['paid-refresh'].handlers.click();assert.equal(ids.notice.textContent,'Falha ao carregar');assert.equal(ids['paid-refresh'].disabled,false);
  fail=false;empty=true;await ids['paid-refresh'].handlers.click();
  assert.equal(ids['paid-empty'].hidden,false);assert.equal(ids['paid-table'].hidden,true);assert.equal(ids['paid-list'].children.length,0);assert.equal(ids['paid-next'].hidden,true);
});
