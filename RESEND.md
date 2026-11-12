# Confirmação de compra por e-mail

O e-mail é enviado somente depois de o servidor confirmar o pagamento real no Mercado Pago e emitir o ingresso no Supabase. Não existe endpoint público para disparar e-mail sem compra.

Configure no `.env.local` e nas variáveis da Vercel:

```dotenv
RESEND_API_KEY=re_sua_chave
RESEND_FROM="Zanoween <ingressos@SEU-DOMINIO-VERIFICADO>"
```

No painel Resend > Domains, adicione um domínio que você possua e cadastre os registros DNS solicitados. Depois de aparecer como verificado, use um endereço desse domínio no remetente. O código bloqueia a abertura das vendas com `onboarding@resend.dev`; esse remetente não serve para enviar a todos os compradores.

O modelo em `server/purchase-email.cjs` inclui banner tropical inline, nome, categoria, lote, valor pago, código único de entrada e aviso da conferência do RG. HTML e texto podem ser personalizados nesse arquivo. A imagem fica em `server/assets/email-banner.png`, incluída no pacote das funções pela configuração da Vercel.

A fila `email_outbox` é criada na mesma transação da aprovação e do ingresso. Uma falha no envio não perde a compra: o código fica disponível no site, e o envio é retomado pelas consultas da compra ou pela rotina de recuperação. Chamadas concorrentes usam uma trava temporária e chave de idempotência para reduzir duplicações. `sent` significa aceitação pelo Resend; acompanhe a entrega pelo painel do provedor.

Depois de dez tentativas sem sucesso, revise o remetente, a chave e os eventos do Resend antes de reativar o envio. Veja a rotina de recuperação em [CHECKOUT.md](CHECKOUT.md).
