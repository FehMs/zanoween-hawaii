'use strict';

const { createSupabase } = require('../server/supabase.cjs');

(async () => {
  const db = createSupabase();
  const products = await db.request('ticket_products?select=lot,gender,price_cents,sales_enabled&order=lot,gender');
  const expected = { '1:mulher': 4500, '1:homem': 5000, '2:mulher': 5000, '2:homem': 5500, '3:mulher': 5500, '3:homem': 6000 };
  if (products.length !== 6 || products.some(p => expected[`${p.lot}:${p.gender}`] !== p.price_cents)) {
    throw new Error('Os seis produtos ou precos esperados nao foram encontrados. Confira a migration.');
  }
  for (const table of ['orders', 'tickets', 'payment_events', 'email_outbox']) {
    await db.request(`${table}?select=id&limit=0`);
  }
  console.log('Supabase conectado. Tabelas acessiveis e seis precos conferidos. Nenhum dado foi alterado.');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
