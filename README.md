# Zanoween — Hawaii Edition

Site estático e minimalista, em uma única tela. Sem instalação, build ou JavaScript.

## Arquivos

- `dist/index.html`: conteúdo da página.
- `dist/style.css`: layout, cores, tipografia e versão mobile.
- `dist/assets/fundo.png`: fundo tropical fornecido.
- `dist/assets/hawaii-edition.png`: título original com transparência.
- `dist/assets/zanoween-logo.png`: logo original Zanoween 2K26 com transparência.
- `dist/assets/favicon.svg`: ícone da aba.

Abra `dist/index.html` no navegador. As fontes são carregadas pelo Google Fonts; sem internet, o site usa fontes alternativas do sistema.

## Editar

Altere a data, local e textos diretamente em `dist/index.html`. O endereço completo não está no código: a página só informa que será revelado após a compra.

Quando a venda abrir, substitua o botão desabilitado por um link para o endereço oficial da bilheteria. O horário e o link de compra ainda não foram fornecidos.

## Identidade

Fundo, título Hawaii Edition e logo Zanoween 2K26 usam as imagens originais fornecidas, sem recriar a tipografia. As imagens mantêm suas proporções e a transparência. Montserrat é usada apenas nos textos de apoio; Kawaii continua composto em texto.

A camada escura do fundo pode ser ajustada em `.poster::after`, em `dist/style.css`. O tamanho do título é controlado por `.edition-logo` e o do logo superior por `.zanoween`.
