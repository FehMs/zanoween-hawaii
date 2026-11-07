const modal = document.querySelector('#tickets');
document.querySelectorAll('.ticket-trigger').forEach(button => button.addEventListener('click', () => modal.showModal()));
document.querySelector('.close-modal').addEventListener('click', () => modal.close());
modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close(); } });
let toastTimeout;
function toast(message) { const element = document.querySelector('.toast'); element.textContent = message; element.classList.add('visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => element.classList.remove('visible'), 4500); }
document.querySelectorAll('.calendar-trigger').forEach(button => button.addEventListener('click', () => {
  const content = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Zanoween//Hawaii Edition//PT-BR','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:zanoween-hawaii-2026@zanoween','DTSTAMP:20261106T120000Z','DTSTART;VALUE=DATE:20261212','DTEND;VALUE=DATE:20261213','SUMMARY:Zanoween — Hawaii Edition','LOCATION:Espaço Limão — endereço após a compra','DESCRIPTION:Zanoween × Kawaii. Horário a confirmar. Endereço completo revelado após a compra do ingresso.','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], {type:'text/calendar;charset=utf-8'})); const link = document.createElement('a'); link.href = url; link.download = 'zanoween-hawaii-2026.ics'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Arquivo da agenda baixado. Abra para salvar a data!');
}));
document.querySelector('#share').addEventListener('click', async () => { const data = {title:'Zanoween — Hawaii Edition',text:'O calor vai tomar conta. 12.12.26, no Espaço Limão.',url:location.href.split('#')[0]}; try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); toast('Link copiado. Chame sua turma!'); } } catch (error) { if (error.name !== 'AbortError') toast('Copie o endereço do navegador para compartilhar.'); } });
