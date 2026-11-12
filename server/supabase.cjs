'use strict';

function getConfig(env = process.env) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY no servidor.');
  }
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch {
    throw new Error('SUPABASE_URL invalida.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a URL HTTPS raiz do projeto Supabase.');
  }
  if (key.startsWith('sb_publishable_')) {
    throw new Error('Use uma chave secreta de servidor, nao a chave publishable.');
  }
  return { url: url.origin, key };
}

function createSupabase({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const { url, key } = getConfig(env);
  return {
    async request(path, { method = 'GET', body, prefer } = {}) {
      if (!/^(?:rpc\/)?[a-z_]+(?:\?|$)/.test(path)) throw new Error('Recurso Supabase invalido.');
      const headers = { apikey: key, 'Content-Type': 'application/json' };
      // New secret keys use apikey; legacy service_role JWTs also use Authorization.
      if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
      if (prefer) headers.Prefer = prefer;
      const response = await fetchImpl(`${url}/rest/v1/${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000), redirect: 'error'
      });
      if (!response.ok) {
        // Do not propagate database messages, credentials, or attendee data.
        let code, reason;
        try {
          const failure = await response.json();
          code = failure.code;
          const allowed = ['invalid_participant','request_conflict','sales_closed','capacity_missing','too_many_requests','sold_out','order_not_found','payment_conflict','invalid_status','invalid_ticket','ticket_already_used'];
          if (allowed.includes(failure.message)) reason = failure.message;
        } catch {}
        if (['PGRST202','PGRST204','42703'].includes(code) || ((code==='PGRST205'||code==='42P01')&&path.startsWith('ticket_lots'))) {
          throw new Error('Estrutura do checkout ausente. Execute supabase/migrations/202611120002_checkout.sql no SQL Editor do projeto e aguarde o cache da API atualizar.');
        }
        if (code === 'PGRST205' || code === '42P01') {
          throw new Error('Tabela nao encontrada no Supabase. Execute supabase/migrations/202611120001_ticketing.sql no SQL Editor do seu projeto. Se ja executou, confira se usou o mesmo projeto e aguarde a atualizacao do cache da API.');
        }
        const error = new Error(`Falha na comunicacao com Supabase (HTTP ${response.status}).`);
        error.reason = reason;
        error.status = response.status;
        throw error;
      }
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
  };
}

module.exports = { getConfig, createSupabase };
