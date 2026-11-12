'use strict';
// Local development server for static assets and the same API handlers as Vercel.
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const root = path.resolve(__dirname, '../dist');
const routes = {
  '/api/checkout-config': require('../api/checkout-config.js'),
  '/api/checkout': require('../api/checkout.js'),
  '/api/order-status': require('../api/order-status.js'),
  '/api/mercado-pago-webhook': require('../api/mercado-pago-webhook.js'),
  '/api/payment-jobs': require('../api/payment-jobs.js'),
  '/api/check-in': require('../api/check-in.js')
};
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (routes[pathname]) {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 8192) { res.writeHead(413); res.end(); return; }
      }
      req.body = raw;
      return await routes[pathname](req, res);
    }
    if (pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const content = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Porta ocupada. Pare o servidor anterior com Ctrl+C ou use outra PORT.' : 'Nao foi possivel iniciar o servidor local.');
  process.exitCode = 1;
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Zanoween: http://localhost:${server.address().port}`));
