const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getConfig, createSupabase } = require('../server/supabase.cjs');
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test_only' };

test('requires server credentials and a valid root HTTPS URL', () => {
  assert.throws(() => getConfig({}), /Configure/);
  assert.throws(() => getConfig({ ...env, SUPABASE_SECRET_KEY: 'sb_publishable_test' }), /publishable/);
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?token=abc']) {
    assert.throws(() => getConfig({ ...env, SUPABASE_URL: url }));
  }
});

test('new keys use apikey and legacy service-role keys use bearer too', async () => {
  for (const key of ['sb_secret_test_only', 'legacy_test_jwt']) {
    let sent;
    const db = createSupabase({ env: { ...env, SUPABASE_SECRET_KEY: key }, fetchImpl: async (url, options) => {
      sent = { url, ...options }; return { ok: true, status: 200, text: async () => '[]' };
    } });
    await db.request('orders?select=id&limit=0');
    assert.equal(sent.headers.apikey, key);
    assert.equal(sent.headers.Authorization, key.startsWith('sb_secret_') ? undefined : `Bearer ${key}`);
    assert.equal(sent.redirect, 'error');
  }
});

test('does not leak database response details in errors', async () => {
  const db = createSupabase({ env, fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'secret and attendee data' }) });
  await assert.rejects(db.request('orders'), error => /HTTP 401/.test(error.message) && !/attendee|sb_secret/.test(error.message));
});

test('maps only known database reasons for checkout errors', async () => {
  const db=createSupabase({env,fetchImpl:async()=>({ok:false,status:400,json:async()=>({code:'P0001',message:'sold_out'})})});
  await assert.rejects(db.request('rpc/reserve_checkout',{method:'POST',body:{}}),error=>error.reason==='sold_out');
});

test('missing tables explain how to apply the migration without exposing response details', async () => {
  const db = createSupabase({ env, fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ code: 'PGRST205', message: 'private database details' }) }) });
  await assert.rejects(db.request('ticket_products'), error => /SQL Editor/.test(error.message) && !/private database/.test(error.message));
});
