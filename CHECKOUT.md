# Publicação do checkout de produção

O checkout usa Pix pela API Orders do Mercado Pago. Preço e estoque são definidos pelo servidor, nunca pelo valor enviado no navegador. O servidor confere conta recebedora, referência, moeda, valor pago e situação da order antes de aprovar a compra. Não há modos de simulação na aplicação publicada.

## Banco

As migrations ficam em `supabase/migrations/`, nesta ordem:

1. `202611120001_ticketing.sql`: tabelas e seis preços.
2. `202611120002_checkout.sql`: funções transacionais, estoque, fila e entrada.
3. `202611120003_lot_capacity.sql`: 30 ingressos no primeiro lote, 30 no segundo e 20 no terceiro, compartilhados entre categorias.

A estrutura e as quantidades já foram aplicadas ao projeto conectado. Não execute novamente as migrations de criação. Os produtos do primeiro lote estão habilitados; os demais permanecem fechados.

Os dados de compradores são privados. RLS e permissões bloqueiam acesso direto por visitantes e usuários autenticados. Somente o servidor usa a chave secreta. Registros históricos marcados `is_test` são preservados para auditoria e excluídos do fluxo de produção; não os converta em ingressos reais.

Cada pedido pendente reserva uma vaga. A vaga só é liberada depois de confirmar o cancelamento/expiração no provedor, evitando vender além do limite. As tentativas de criação reutilizam uma chave de idempotência para recuperar respostas perdidas. Há limites por e-mail e hash do IP; o IP bruto não é gravado.

## Variáveis de ambiente

Use `.env.local` no computador e Settings > Environment Variables na Vercel:

```dotenv
APP_URL=https://zanoween-hawaii.vercel.app
MERCADO_PAGO_ENVIRONMENT=production
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
RESEND_API_KEY=...
RESEND_FROM="Zanoween <ingressos@SEU-DOMINIO-VERIFICADO>"
CHECKOUT_HASH_SECRET=...
CHECKIN_TOKEN=...
CRON_SECRET=...
CHECKOUT_ENABLED=false
```

Os três segredos internos já foram gerados no `.env.local`; use valores independentes com pelo menos 32 caracteres. Não coloque credenciais em `dist`, no Git ou no chat. `MERCADO_PAGO_PUBLIC_KEY` é opcional para expansões futuras; o Pix atual é criado exclusivamente no servidor.

O remetente próprio depende de um domínio verificado no Resend. Até configurá-lo, mantenha as vendas fechadas. O endereço `vercel.app` pode hospedar a página, mas não é um domínio seu para configurar o remetente de e-mail.

## Deploy e webhook

Importe a pasta do projeto com `api/` e `vercel.json`, Framework Other, sem build, Output Directory `dist`. Não publique apenas os arquivos de `dist`: as funções também são necessárias. Configure as variáveis no painel Vercel e faça novo deploy quando mudá-las.

Na aplicação Zanoween do Mercado Pago, ambiente Produção, configure:

```text
https://zanoween-hawaii.vercel.app/api/mercado-pago-webhook
```

Selecione **Order (Mercado Pago)** e copie a assinatura secreta para `MERCADO_PAGO_WEBHOOK_SECRET`. A rota deve estar acessível sem login de preview. Notificações sem assinatura válida recebem 401. O corpo da notificação não aprova o pagamento: o servidor consulta a order pelo próprio Access Token.

Confira o recebimento pelo painel Mercado Pago usando uma order da integração. A consulta pelo localhost não substitui essa validação no domínio publicado.

## Abrir vendas

1. Configure o domínio/remetente no Resend e as variáveis na Vercel.
2. Publique o código com `CHECKOUT_ENABLED=false`.
3. Rode `npm run checkout:check` para conferir as pendências locais, sem cobranças ou alterações no banco.
4. Confirme a URL e a assinatura do webhook na implantação publicada.
5. Concluídas as verificações, altere `CHECKOUT_ENABLED=true` na Vercel e faça novo deploy.

`CHECKOUT_ENABLED=false` bloqueia novas compras, mas mantém a consulta e a confirmação de pedidos de produção já iniciados. Os preços continuam Mulher R$ 45 / Homem R$ 50 no primeiro lote. Não existe mais a oferta temporária de R$ 1.

## Confirmação e recuperação

A aprovação, um único ingresso e a fila de e-mail são registrados na mesma transação. O checkout acompanha pagamento e envio automaticamente e mostra o código mesmo se o e-mail atrasar. O ingresso usa código textual de uso único; o QR Code mostrado no pagamento é o Pix.

Webhooks e consultas da compra tentam enviar o e-mail imediatamente. `api/payment-jobs` concilia pedidos e retoma envios, com acesso protegido por `Authorization: Bearer <CRON_SECRET>`. O `vercel.json` mantém uma execução diária de recuperação. Para recuperação em poucos minutos e liberação rápida de estoque pendente, use um agendador autorizado a cada cinco minutos ou ajuste a frequência conforme seu plano Vercel. A rotina processa um lote limitado por execução e exclui registros históricos de simulação.

Monitore no Supabase pedidos pendentes antigos e a fila `email_outbox` com falhas. Após dez tentativas, revise a causa antes de reativar o envio. A chave de idempotência do Resend tem retenção limitada: não há promessa de exatamente uma entrega após interrupções muito longas. Falha de e-mail nunca deve desfazer um pagamento aprovado.

## Entrada

Use `/entrada.html` nos aparelhos da equipe. Digite o código `CHECKIN_TOKEN`, consulte o ingresso, confira o nome no RG e confirme a entrada. A consulta não consome o ingresso; a confirmação é atômica e impede uso duplicado. Ingressos históricos de simulação, usados, revogados ou estornados não liberam nova entrada. Compartilhe o código da equipe apenas com os responsáveis.

Referências: [Pix Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications).
