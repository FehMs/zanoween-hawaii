# Zanoween — Hawaii Edition

Site estático em HTML e CSS, sem instalação ou build.

## Visual atual

A primeira dobra mantém o fundo tropical desfocado, os logos originais, a data, o local e o aviso de ingressos em breve. A seção branca Vibe do Verão começa logo abaixo, com uma borda superior e sem fade.

A antiga parte inferior foi substituída pela nova composição fornecida. Os arquivos anteriores continuam em `dist/assets` para possível uso futuro.

## Arquivos

- `dist/index.html`: primeira dobra e seção Vibe do Verão.
- `dist/style.css`: layout, fundo desfocado e seção branca.
- `dist/assets/fundo.png`: fundo original.
- `dist/assets/hawaii-edition.png`: título original.
- `dist/assets/zanoween-logo.png`: logo original.
- `dist/assets/assets tropicar.png`: arte tropical à esquerda.
- `dist/assets/A Festa_ Vibe do Verão.png`: título escuro da direita, preservado com transparência.

Abra `dist/index.html` no navegador ou execute `npx --yes serve dist -l 3000` e acesse http://localhost:3000.

## Seção Vibe do Verão

As duas imagens originais ficam lado a lado no desktop e empilhadas no celular. A arte da direita tem letras escuras e aparece diretamente sobre o branco. A frase de apoio fica ao lado do título; os quatro benefícios aparecem em uma linha abaixo, seguidos do botão laranja para o grupo de WhatsApp. A composição inclui uma flor suave e linhas laranja decorativas, seguindo a referência.

O layout e o botão estão nas classes `.vibe-layout`, `.vibe-intro`, `.vibe-benefits` e `.vibe-whatsapp`. A borda superior é definida em `.vibe-section`.

Horário e link de ingressos ainda não foram fornecidos. O endereço completo continua reservado para depois da compra.

## Edição anterior

A seção `.recap-section` apresenta o texto editorial à esquerda e a imagem original `dist/assets/Moldura Tropical com Flores e Folhagem.png` à direita. O espaço da mídia fica na abertura da moldura, mantendo flores e folhas por cima. No celular, o texto aparece antes da moldura.

O vídeo oficial ainda não foi informado. Por enquanto, o espaço mostra “Vídeo da edição anterior — Em breve”, sem controles ou duração fictícios. Quando o vídeo for fornecido, substituir o conteúdo de `.recap-media` pelo player correspondente. As imagens e o título dessa seção não alteram a primeira dobra nem a composição Vibe do Verão.
