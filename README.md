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
