const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('PostgreSQL: migrations, inventory, idempotency, tickets, mail and admission',async t=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    for(const file of ['202611120001_ticketing.sql','202611120002_checkout.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    const reserve=async({id=randomUUID(),gender='mulher',email='tester@example.com',access='a'.repeat(64),isTest=false}={})=>{
      const params=[id,access,'Pessoa Teste',email,null,gender,'b'.repeat(64),isTest];
      return (await db.query('select public.reserve_checkout($1,$2,$3,$4,$5,$6,$7,$8) as value',params)).rows[0].value;
    };
    await t.test('closed sales cannot reserve; missing capacity cannot open accidentally',async()=>{
      await assert.rejects(reserve(),/sales_closed/);
      await db.exec('update public.ticket_products set sales_enabled=true where lot=1');
      await assert.rejects(reserve(),/capacity_missing/);
    });
    await db.exec('update public.ticket_lots set capacity=2 where lot=1; set role service_role;');
    const first=await reserve();
    await t.test('price from database and repeated request reserves only once',async()=>{
      assert.equal(first.price_cents,4500);
      const again=await reserve({id:first.id});assert.equal(again.id,first.id);
      await assert.rejects(reserve({id:first.id,access:'c'.repeat(64)}),/request_conflict/);
      assert.equal(Number((await db.query('select count(*) from public.orders')).rows[0].count),1);
    });
    const second=await reserve({gender:'homem',email:'other@example.com'});
    await t.test('both categories share the lot limit, cancellation releases it',async()=>{
      assert.equal(second.price_cents,5000);
      await assert.rejects(reserve({email:'third@example.com'}),/sold_out/);
      await db.query("select public.apply_verified_payment($1,'ORD2','PAY2','cancelled','cancelled')",[second.id]);
      const third=await reserve({email:'third@example.com'});assert.ok(third.id);
    });
    await t.test('approval is atomic; duplicates create one ticket and one email',async()=>{
      await assert.rejects(db.query('insert into public.tickets(order_id) values($1)',[first.id]),/approved order/);
      for(let i=0;i<2;i++)await db.query("select public.apply_verified_payment($1,'ORD1','PAY1','paid','processed')",[first.id]);
      assert.equal(Number((await db.query('select count(*) from public.tickets where order_id=$1',[first.id])).rows[0].count),1);
      assert.equal(Number((await db.query('select count(*) from public.email_outbox where order_id=$1',[first.id])).rows[0].count),1);
      await db.query("select public.apply_verified_payment($1,'ORD1','PAY1','pending','processing')",[first.id]);
      assert.equal((await db.query('select status from public.orders where id=$1',[first.id])).rows[0].status,'paid');
    });
    await t.test('email lease prevents concurrent delivery and failed sends are retried',async()=>{
      const claim=(await db.query('select public.claim_purchase_email($1) as value',[first.id])).rows[0].value;
      assert.equal(claim.attempt,1);
      assert.equal((await db.query('select public.claim_purchase_email($1) as value',[first.id])).rows[0].value,null);
      await db.query('select public.finish_purchase_email($1,1,null)',[claim.outbox_id]);
      assert.equal((await db.query('select public.claim_purchase_email($1) as value',[first.id])).rows[0].value,null);
      await db.query("update public.email_outbox set next_attempt_at=now()-interval '1 minute' where id=$1",[claim.outbox_id]);
      const retry=(await db.query('select public.claim_purchase_email($1) as value',[first.id])).rows[0].value;
      assert.equal(retry.attempt,2);
      await db.query("select public.finish_purchase_email($1,2,'email-ok')",[claim.outbox_id]);
      assert.equal((await db.query('select public.claim_purchase_email($1) as value',[first.id])).rows[0].value,null);
    });
    await t.test('one admission per paid ticket and refund revokes it',async()=>{
      const token=(await db.query('select entry_token from public.tickets where order_id=$1',[first.id])).rows[0].entry_token;
      assert.equal((await db.query('select public.admit_ticket($1) as value',[token])).rows[0].value.admitted,true);
      await assert.rejects(db.query('select public.admit_ticket($1)',[token]),/ticket_already_used/);
      await db.query("select public.apply_verified_payment($1,'ORD1','PAY1','refunded','refunded')",[first.id]);
      await assert.rejects(db.query('select public.admit_ticket($1)',[token]),/invalid_ticket/);
    });
    await t.test('test payments never issue a valid ticket or confirmation email',async()=>{
      const sandbox=await reserve({email:'sandbox@example.com',isTest:true});
      await db.query("select public.apply_verified_payment($1,'ORDTEST','PAYTEST','paid','processed')",[sandbox.id]);
      assert.equal(Number((await db.query('select count(*) from public.tickets where order_id=$1',[sandbox.id])).rows[0].count),0);
      assert.equal(Number((await db.query('select count(*) from public.email_outbox where order_id=$1',[sandbox.id])).rows[0].count),0);
    });
    await t.test('anonymous and signed-in visitors cannot read data or invoke privileged functions',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec(`reset role; set role ${role};`);
        await assert.rejects(db.query('select * from public.orders'),/permission denied/);
        await assert.rejects(db.query('select * from public.tickets'),/permission denied/);
        await assert.rejects(db.query('select public.claim_purchase_email($1)',[first.id]),/permission denied/);
      }
    });
  }finally{await db.close();}
});
