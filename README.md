# Zanoween — Hawaii Edition

Frontend estático em `dist/`, sem build. APIs Node 22 ou superior em `api/` e `server/`, integradas ao Supabase, Mercado Pago Orders e Resend. O código de produção não usa dependências externas de runtime; PGlite é usado somente na suíte automatizada de verificação.

## Localhost

```powershell
npm install
npm run dev
```

Abra http://localhost:3001. Reinicie o servidor após alterar o `.env.local`. Abrir somente o HTML ou usar `npx serve dist` não executa o checkout.

## Publicar

Importe na Vercel a pasta que contém este README, `api/` e `vercel.json`:

- Framework Preset: **Other**.
- Build Command: vazio.
- Output Directory: **dist**.
- Configure as variáveis do `.env.example` em Settings > Environment Variables, usando os valores reais guardados no `.env.local`. Não envie o `.env.local` ao Git.

`CHECKOUT_ENABLED=false` mantém a página publicada com as vendas fechadas. Depois de configurar o remetente de domínio verificado, conferir as credenciais e validar o webhook no domínio publicado, altere para `true` e faça novo deploy.

Leia [CHECKOUT.md](CHECKOUT.md) para a configuração completa e [RESEND.md](RESEND.md) para o e-mail de confirmação. `.vercelignore` impede o upload de arquivos de ambiente, ferramentas de verificação e pastas locais pela CLI.

## Ingressos e estoque

| Lote | Mulher | Homem | Estoque compartilhado |
| --- | --- | --- | --- |
| 1º | R$ 45 | R$ 50 | 30 |
| 2º | R$ 50 | R$ 55 | 30 |
| 3º | R$ 55 | R$ 60 | 20 |

Somente os produtos do primeiro lote estão habilitados no Supabase. O formulário coleta nome completo, gênero e e-mail, com WhatsApp opcional e confirmação de conferência do RG. Não há CPF ou número de RG. O servidor fixa o preço pelo banco e reserva uma vaga; o ingresso só é emitido depois de confirmar a order no Mercado Pago.

A tela acompanha automaticamente o Pix e o envio do e-mail, com loading e confirmação. O código do ingresso também aparece no site. Uma referência privada é mantida no sessionStorage da mesma aba para retomar a compra após atualizar a página; os dados do formulário não são gravados ali.

A equipe usa `/entrada.html`, protegida por código privado, para consultar o ingresso, conferir o RG e confirmar a entrada uma única vez.

## Verificações

```powershell
npm test
npm run supabase:check
npm run checkout:check
```

`npm test` executa verificações automatizadas isoladas de banco, interfaces e integrações com provedores simulados; não acessa a conta real nem cria cobranças. Os comandos `:check` consultam os serviços e mostram pendências sem alterar registros. Essa suíte de desenvolvimento é preservada e não faz parte da interface publicada.

As páginas e APIs de simulação de Pix/e-mail foram removidas. Os registros antigos continuam preservados no banco e são excluídos da venda, emissão de ingressos e controle de entrada de produção.

## Página e mídia

`dist/index.html` e `dist/style.css` contêm a página responsiva e o checkout. O vídeo da edição anterior fica no Vimeo, dentro da moldura vertical 9:16, com áudio mudo, loop e reprodução conforme a visibilidade. Preserve o parâmetro `h` do vídeo não listado. O banner do e-mail é incorporado como imagem inline, sem depender de URL externa.

O horário e o endereço completo ainda não foram fornecidos. A organização deve informar o endereço aos compradores antes do evento.
