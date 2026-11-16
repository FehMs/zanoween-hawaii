(() => {
  fetch('/api/site-config',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(c=>{
    if(!c)return;
    const set=(selector,text)=>{const el=document.querySelector(selector);if(el&&typeof text==='string')el.textContent=text;};
    set('.headline p',c.tagline);set('.event-info > span:last-child',c.venue);set('.address-note',c.addressNote);
    set('#tickets-title',c.ticketsTitle);set('.tickets-intro',c.ticketsIntro);
    if(/^\d{4}-\d{2}-\d{2}$/.test(c.eventDate)){
      const [year,month,day]=c.eventDate.split('-'),date=`${day}.${month}.${year.slice(2)}`;
      const time=document.querySelector('.event-info time');time.dateTime=c.eventDate;time.textContent=date;
      set('.tickets-signoff',`Zanoween - Hawaii Edition · ${date}`);
    }
    try {const url=new URL(c.whatsappUrl);if(url.protocol==='https:'&&['chat.whatsapp.com','wa.me'].includes(url.hostname))document.querySelectorAll('a[href*="chat.whatsapp.com"],a[href*="wa.me"]').forEach(a=>{a.href=url.href;});}catch{}
  }).catch(()=>{});
})();
