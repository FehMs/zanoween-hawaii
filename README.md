# Zanoween — Hawaii Edition

Site estático em HTML e CSS, sem instalação ou build.

## Visual atual

A primeira dobra mantém o fundo tropical desfocado, os logos originais, a data, o local e o aviso de ingressos em breve. Depois dela, um desfoque progressivo e um degradê fazem a transição para uma área branca vazia.

A antiga parte inferior (benefícios, fotos, descrição e grupo) foi removida da página. Os arquivos de imagem continuam em `dist/assets` para possível uso futuro.

## Arquivos

- `dist/index.html`: conteúdo e área reservada para novos blocos.
- `dist/style.css`: layout, fundo, desfoque e transição.
- `dist/assets/fundo.png`: fundo original.
- `dist/assets/hawaii-edition.png`: título original.
- `dist/assets/zanoween-logo.png`: logo original.

Abra `dist/index.html` no navegador ou execute `npx --yes serve dist -l 3000` e acesse http://localhost:3000.

## Próximos conteúdos

Substitua o `div.future-content` pelos novos blocos sobre o fundo branco. Ao adicionar conteúdo, remova seu atributo `aria-hidden`. A altura da transição está em `.hero-transition`; o degradê branco fica em `.hero-transition::after`.

Horário e link de ingressos ainda não foram fornecidos. O endereço completo continua reservado para depois da compra.
