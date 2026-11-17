# Administração

Acesse `/admin` no mesmo domínio do site (localmente, `http://localhost:3001/admin`). O painel permite liberar/pausar cada um dos três lotes, editar preços e estoque compartilhado, consultar pagos/pendentes/receita e editar os textos principais, data, local e link do WhatsApp.

## Ativação

1. Execute `supabase/migrations/202611160001_admin.sql` no SQL Editor do projeto Supabase, após as três migrações anteriores. Em seguida, execute `supabase/migrations/202611160002_partners.sql`. Se já aplicou a migração do admin, execute somente a nova migração de parceiros. As migrações preservam o estado atual de liberação dos lotes e as compras existentes.
2. Configure `ADMIN_PASSWORD` com uma senha exclusiva de pelo menos 32 caracteres no `.env.local` e nas variáveis de ambiente da Vercel. Não inclua a senha no código ou no Git.
3. Reinicie o servidor local ou publique a nova versão na Vercel. Acesse `/admin` e entre com a senha configurada.

As alterações são salvas no Supabase e aparecem ao recarregar o site, sem novo deploy. `CHECKOUT_ENABLED=true` e as credenciais de pagamento/e-mail continuam necessários para vender: o painel mostra um aviso se essa configuração estiver incompleta. Cada lote liberado pode ser comprado pelo seu próprio cartão no site.

O estoque inclui pedidos pagos e pendentes. A quantidade total não pode ficar abaixo desse número; alterar um preço não muda pedidos já criados. Pedidos pendentes são reconciliados pelo fluxo de pagamentos existente. Esgotamento é validado atomicamente no banco ao comprar.

O editor altera o conteúdo textual da página; imagens, layout e o modelo de e-mail permanecem em código. Ao mudar data/local do evento, atualize também `server/purchase-email.cjs` para que os e-mails acompanhem a página.

## Parceiros

Na seção **Parceiros e indicações**, cadastre o nome do divulgador e um código único de 3 a 32 letras, números, hífen ou sublinhado (ex.: `MARIA10`). O comprador pode informar esse código no campo opcional antes de gerar o Pix. Letras minúsculas são normalizadas para maiúsculas. Códigos inexistentes ou pausados impedem criar o Pix até a correção ou remoção do código.

O código identifica a indicação e mantém o preço do ingresso. O painel exibe pedidos pagos, pendentes e receita confirmada por parceiro; testes, cancelamentos, expirações e estornos não entram na receita. É possível editar o nome e pausar/reativar o código. O código de uma compra já criada permanece vinculado ao pedido mesmo após a pausa do parceiro; repetir a mesma compra não troca a indicação. Pedidos anteriores continuam sem parceiro.

## Fotos e vídeos nos stories

Em `/admin#fotos`, selecione várias fotos e vídeos juntos, sem preencher título ou legenda. Fotos: JPG, PNG ou WebP, até 20 MB cada; o navegador reduz a maior dimensão para 2000 px e otimiza para até 2 MB. Vídeos: MP4, WebM ou MOV reproduzível pelo navegador, até 60 segundos e 20 MB cada. Não há transcodificação; MP4 com H.264 oferece a maior compatibilidade entre navegadores. O álbum aceita até 60 stories entre fotos e vídeos, com prévias, ordenação, publicação e ocultação. Registros horizontais sempre aparecem inteiros, inclusive os já cadastrados, independentemente do enquadramento escolhido.

A seção pública em `/#galeria` tem setas, miniaturas, navegação por teclado e gesto lateral no celular. A reprodução ocorre no próprio story; não há visualização ampliada. A reprodução automática é opcional e pausa quando a galeria sai da tela ou a aba fica oculta. Sem fotos, a seção exibe uma capa ilustrada e mantém o acesso ao aftermovie.

As imagens usam o bucket público `event-gallery` no Supabase Storage, criado automaticamente pelo servidor no primeiro upload (ou na preparação inicial). Os dados do álbum ficam em `site_settings.content.gallery`, sem migração adicional. Somente o admin pode enviar ou editar. A API pública lista apenas as fotos publicadas; ocultar retira a foto da galeria, mas não revoga seu endereço público no Storage. O envio usa os limites documentados no [Supabase Storage](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

As gravações de conteúdo e galeria usam a revisão `_revision` para preservar alterações simultâneas. Salvar os textos não apaga as fotos. Uma falha ao salvar uma foto tenta remover apenas o arquivo recém-enviado. Vídeos vão diretamente ao Storage por URL assinada, sem passar pelo limite de corpo da função na Vercel. O servidor confere tamanho e tipo do objeto antes da publicação; a duração é lida pelo navegador e validada na preparação. A confirmação do vídeo é idempotente, permitindo repetir uma confirmação sem duplicar o story. Após uma falha parcial, os arquivos pendentes continuam selecionados para nova tentativa. O bucket existente é atualizado automaticamente para aceitar vídeos no primeiro envio; não é necessária migração de banco.

## Acesso

A senha é verificada no servidor; a sessão assinada dura oito horas e usa cookie HttpOnly, SameSite=Strict e Secure em produção. Sair remove o cookie deste navegador. Trocar `ADMIN_PASSWORD` e republicar invalida as sessões anteriores. O login limita cinco falhas por origem em cada instância do servidor durante quinze minutos; em produção com múltiplas instâncias, use também o rate limit/WAF da hospedagem para um limite global.

O navegador nunca recebe chaves de serviço do Supabase. Visitantes e usuários autenticados do Supabase não têm acesso direto às tabelas e funções administrativas. Os resumos excluem pedidos de teste e não expõem dados pessoais dos compradores.
