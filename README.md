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

A seção `.recap-section` apresenta o texto editorial à esquerda e a imagem `dist/assets/Moldura Tropical Vertical em Tons Vibrantes.png` à direita. O espaço da mídia usa a proporção vertical 9:16 na abertura da moldura, mantendo flores e folhas por cima. No celular, o texto aparece antes da moldura centralizada.

O vídeo da edição anterior está incorporado pelo Vimeo em `.recap-media`, sem controles, no mudo e em loop. O script `dist/recap-video.js` usa o SDK do Vimeo e IntersectionObserver para reproduzir quando o vídeo aparece na tela e pausar quando sai ou a aba fica oculta. A reprodução automática depende das permissões do navegador; ocultar a interface também depende das opções disponíveis na conta Vimeo. O parâmetro `h=49a77ddf5e` preserva o acesso ao vídeo não listado e deve permanecer no endereço do player. O arquivo de vídeo fica hospedado no Vimeo e não entra no deploy do site.

## Publicar na Vercel

A última seção, `#ingressos`, apresenta três lotes em cartões inspirados em bilhetes, com o primeiro em destaque e os valores “A divulgar”. As vendas permanecem “Em breve” até a confirmação dos preços e do link da bilheteria. O botão superior “Ver ingressos” leva a essa seção. O link de novidades abre o grupo oficial de WhatsApp.

Importe o repositório na Vercel com a pasta `zanoween` como raiz (a pasta que contém este README e `vercel.json`). Use o preset Other, sem comando de build e com saída `dist`. O arquivo `vercel.json` já define a pasta de saída.

Para vídeo no próprio projeto, coloque o MP4 em `dist/assets/` e substitua o placeholder por `<video controls playsinline preload="metadata" src="assets/edicao-anterior.mp4"></video>`. O arquivo será incluído no deploy e a reprodução consumirá transferência de dados da hospedagem.

Como alternativa, hospede o vídeo no Vimeo e substitua o placeholder pelo iframe de incorporação fornecido pela plataforma. O CSS já dimensiona o player na abertura vertical. Nesse caso, o MP4 não precisa entrar no repositório nem no deploy.
