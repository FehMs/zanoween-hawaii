# Zanoween — Hawaii Edition

Site estático em HTML e CSS, sem instalação ou build.

## Visual atual

A primeira dobra mantém o fundo tropical desfocado, os logos originais, a data, o local e o aviso de ingressos em breve. Depois dela, um desfoque progressivo e um degradê fazem a transição para a seção branca Vibe do Verão.

A antiga parte inferior (benefícios, fotos, descrição e grupo) foi removida da página. Os arquivos de imagem continuam em `dist/assets` para possível uso futuro.

## Arquivos

- `dist/index.html`: primeira dobra e seção Vibe do Verão.
- `dist/style.css`: layout, fundo, desfoque e transição.
- `dist/assets/fundo.png`: fundo original.
- `dist/assets/hawaii-edition.png`: título original.
- `dist/assets/zanoween-logo.png`: logo original.
- `dist/assets/assets tropicar.png`: arte tropical à esquerda.
- `dist/assets/A Festa Vibe do Verão.png`: arte da direita, preservada com transparência.

Abra `dist/index.html` no navegador ou execute `npx --yes serve dist -l 3000` e acesse http://localhost:3000.

## Seção Vibe do Verão

As duas imagens originais ficam lado a lado no desktop e empilhadas no celular. A arte da direita tem letras claras, por isso recebe um painel sólido marrom escuro para contraste. O botão laranja abaixo abre o convite oficial do grupo de WhatsApp em uma nova aba. Não há efeito glass nessa seção.

A altura da transição está em `.hero-transition`; o degradê branco fica em `.hero-transition::after`. O layout e o botão estão nas classes `.vibe-layout`, `.vibe-copy` e `.vibe-whatsapp`.

Horário e link de ingressos ainda não foram fornecidos. O endereço completo continua reservado para depois da compra.
