const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {renderPurchaseEmail}=require('../server/purchase-email.cjs');
const ticket=()=>({fullName:'Pessoa Compradora',gender:'mulher',priceCents:4500,lot:1,entryToken:randomUUID(),orderId:randomUUID()});
test('production email includes the banner, price and unique ticket without simulation copy',()=>{
  const data=ticket(),email=renderPurchaseEmail(data);
  assert.match(email.html,/src="cid:zanoween-email-banner"/);assert.ok(email.html.includes(data.entryToken));assert.ok(email.text.includes(data.entryToken));assert.match(email.text,/45,00/);
  assert.equal(email.attachments[0].content_id,'zanoween-email-banner');assert.equal(Buffer.from(email.attachments[0].content,'base64').subarray(1,4).toString(),'PNG');
  assert.ok(!email.subject.includes('TESTE'));assert.ok(!email.html.includes('SEM VALIDADE'));assert.ok(!email.text.includes('teste'));
});
test('buyer HTML is escaped and an email cannot render without a valid ticket',()=>{
  const email=renderPurchaseEmail({...ticket(),fullName:'<img src=x onerror=alert(1)>'});assert.ok(!email.html.includes('<img src=x'));assert.match(email.html,/&lt;img/);
  assert.throws(()=>renderPurchaseEmail({...ticket(),entryToken:null}));assert.throws(()=>renderPurchaseEmail({...ticket(),priceCents:0}));
});
