# Zanoween — Hawaii Edition

Site estático e minimalista com abertura da edição, destaques da festa, fotos em estilo polaroid e convite para o grupo de WhatsApp. Sem instalação, build ou JavaScript.

## Arquivos

- `dist/index.html`: conteúdo da página.
- `dist/style.css`: layout, cores, tipografia e versão mobile.
- `dist/assets/fundo.png`: fundo tropical fornecido.
- `dist/assets/hawaii-edition.png`: título original com transparência.
- `dist/assets/zanoween-logo.png`: logo original Zanoween 2K26 com transparência.
- `dist/assets/palmeiras.png`, `hibisco.png` e `praia.png`: imagens ilustrativas dos cartões.
- `dist/assets/favicon.svg`: ícone da aba.

Abra `dist/index.html` no navegador. As fontes são carregadas pelo Google Fonts; sem internet, o site usa fontes alternativas do sistema.

## Editar

Altere a data, local e textos diretamente em `dist/index.html`. O endereço completo não está no código: a página só informa que será revelado após a compra.

Quando a venda abrir, substitua o botão desabilitado por um link para o endereço oficial da bilheteria. O horário e o link de compra ainda não foram fornecidos.

## Identidade

Fundo, título Hawaii Edition e logo Zanoween 2K26 usam as imagens originais fornecidas, sem recriar a tipografia. As imagens mantêm suas proporções e a transparência. Montserrat é usada apenas nos textos de apoio; Kawaii continua composto em texto.

A camada escura do fundo pode ser ajustada em `.poster::after`, em `dist/style.css`. O tamanho do título é controlado por `.edition-logo` e o do logo superior por `.zanoween`.

## Parte de baixo

Os destaques Open Bar, DJ Set e Ambiente Temático e o texto da festa seguem a referência fornecida. As fotos são ilustrativas, geradas com a ferramenta integrada ImageGen; não representam registros do local ou de edições anteriores. O link do grupo de WhatsApp foi fornecido pelo organizador e abre em uma nova aba.

As três imagens foram geradas separadamente com o prefixo:

> Use case: photorealistic-natural. Asset type: photograph for a small polaroid card on a tropical party website. Rich burnt orange and amber sunset palette, deep brown shadows, warm analog 35mm film grain, believable natural photograph, high-end editorial travel mood, landscape 3:2 framing, no text, no frame, no watermark, no people.

Complementos de cada prompt:

- `palmeiras.png`: Silhouettes of coconut palm trees framing a spectacular saturated orange sunset over a distant tropical coastline. Camera looking up slightly at curved dark palm trunks and feathered fronds. Sensual warm summer atmosphere.
- `hibisco.png`: Close-up of one beautiful fiery orange hibiscus flower lying on fine textured golden beach sand with gentle ripples. Warm low golden hour side lighting, shallow depth of field, flower centered, detailed petals, natural stamen.
- `praia.png`: A glowing round sunset sun above calm ocean waves at a quiet tropical beach. Fine dark golden sand foreground, delicate white surf, deep orange sky with thin dramatic clouds, sun reflected across water. Wide restful horizon.
