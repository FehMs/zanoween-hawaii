# Preparar o Supabase

1. Crie um projeto no Supabase.
2. No SQL Editor desse projeto, execute uma vez o conteúdo de `migrations/202611120001_ticketing.sql`. A migration cria tabelas, restrições, permissões e os seis preços. Também pode ser aplicada pelo fluxo de migrations da CLI do Supabase.
3. Em Settings > API Keys, crie ou copie uma chave **secret** (`sb_secret_...`). Pegue também a Project URL. A alternativa legada é a chave `service_role`; a chave `anon`/publishable não serve para este acesso administrativo.
4. Localmente, copie `.env.example` para `.env.local` na raiz do projeto e preencha `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. Deixe a alternativa legada vazia.
5. Rode `npm run supabase:check` usando Node 22 ou superior. O comando apenas lê produtos e verifica o acesso às tabelas, sem consultar dados dos participantes nem gravar registros.
6. Na Vercel, adicione as mesmas variáveis em Project > Settings > Environment Variables e faça novo deploy. Nunca coloque a chave em `dist`, no Git ou em variável com prefixo público.

Não é necessário um token pessoal do painel, senha do banco, chave anon ou login de comprador. A chave secreta é acessada por `server/supabase.cjs`, fora da pasta pública.

## Estrutura

- `ticket_products`: seis combinações de lote/gênero e preços em centavos; vendas desativadas por padrão.
- `orders`: dados do participante, valor congelado do pedido, ciência sobre RG e situação do pagamento. Sem CPF ou número do RG.
- `tickets`: um ingresso por pedido aprovado, token aleatório para validação e registro de utilização/revogação.
- `payment_events`: identificação única das notificações processadas.
- `email_outbox`: fila de confirmação de compra pelo Resend, com tentativas de reenvio.

Todas as tabelas têm RLS e não permitem acesso com os papéis `anon` e `authenticated`. O servidor utiliza a chave secreta. Não existem endpoints públicos para listar compradores ou aprovar pagamentos.

## O que já funciona e o que falta

O cliente REST, as migrations e as rotas de checkout estão implementados. O servidor valida os dados, consulta o valor no banco e rejeita produtos com vendas desativadas; ele não aceita preço ou aprovação enviados pelo visitante.

Adicionar as chaves **não abre vendas automaticamente**. Execute também a segunda migration (`202611120002_checkout.sql`) para as funções de estoque, emissão, fila de e-mail e entrada. A flag de checkout, as quantidades e o remetente de produção são configurados conforme [CHECKOUT.md](../CHECKOUT.md). O status `paid` só é escrito pelo servidor após verificar o pagamento no Mercado Pago; a restrição do banco não substitui essa verificação. A fila é processada após aprovação e pelo endpoint de recuperação autenticado.

O site continua sem build; use `npm run dev` para executar também as APIs. Não habilite as vendas antes de definir as quantidades e concluir a configuração e a validação de [CHECKOUT.md](../CHECKOUT.md).
