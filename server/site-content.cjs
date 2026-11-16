'use strict';
const defaults = {
  tagline: 'O calor vai tomar conta.', eventDate: '2026-12-12', venue: 'Espaço Limão',
  addressNote: 'Endereço revelado após a compra.',
  ticketsTitle: 'Garanta o seu ingresso', ticketsIntro: 'Seu próximo encontro com a vibe do verão.',
  whatsappUrl: 'https://chat.whatsapp.com/C423ygeW2kRIcbW1St7Xak?mode=wwt'
};
function validateContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaults, key))) return null;
  const result = {};
  for (const key of Object.keys(defaults)) {
    if (typeof value[key] !== 'string') return null;
    const text = value[key].trim();
    if (!text || text.length > (key === 'whatsappUrl' ? 500 : 200) || /[\x00-\x1f\x7f]/.test(text)) return null;
    result[key] = text;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.eventDate) || !Number.isFinite(Date.parse(result.eventDate)) || new Date(result.eventDate).toISOString().slice(0,10) !== result.eventDate) return null;
  try { const url = new URL(result.whatsappUrl); if (url.protocol !== 'https:' || !['chat.whatsapp.com','wa.me'].includes(url.hostname) || url.port || url.username || url.password) return null; } catch { return null; }
  return result;
}
module.exports = { defaults, validateContent };
