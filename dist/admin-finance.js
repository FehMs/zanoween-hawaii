(() => {
  const $=id=>document.getElementById(id),form=$('expense-form');
  if(!form)return;
  const fields=form.elements,money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const categories={estrutura:'Estrutura',bebidas:'Bebidas',alimentacao:'Alimentação',equipe:'Equipe',divulgacao:'Divulgação',taxas:'Taxas',outros:'Outros'};
  let page=0,busy=false;
  const content=$('finance-content'),toggle=$('finance-toggle');
  function hide(){content.hidden=true;toggle.textContent='Abrir dashboard financeiro';toggle.setAttribute('aria-expanded','false');}
  function load(){if(!content.hidden)return run(()=>fetchPage());}
  toggle.addEventListener('click',()=>{
    if(!content.hidden){hide();return;}
    content.hidden=false;toggle.textContent='Ocultar dashboard financeiro';toggle.setAttribute('aria-expanded','true');
    return load();
  });
  const admin=()=>window.zanoweenAdmin;
  function notice(text,error=false){$('finance-notice').textContent=text;$('finance-notice').hidden=!text;$('finance-notice').classList.toggle('error',error);}
  function reset(){
    form.reset();fields.expenseId.value='';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=type=>parts.find(p=>p.type===type).value;
    fields.expenseDate.value=`${part('year')}-${part('month')}-${part('day')}`;
    $('expense-form-title').textContent='Adicionar gasto';$('expense-cancel').hidden=true;
  }
  function render(data){
    const revenue=Number(data.revenueCents),expenses=Number(data.expenseCents),profit=Number(data.profitCents);
    $('finance-revenue').textContent=money.format(revenue/100);$('finance-expenses').textContent=money.format(expenses/100);$('finance-profit').textContent=money.format(profit/100);
    $('finance-result-label').textContent=profit<0?'Prejuízo parcial':'Lucro parcial';$('finance-result-card').classList.toggle('negative',profit<0);
    $('finance-expense-count').textContent=`${data.expenseCount} gasto(s) cadastrado(s)`;
    $('finance-margin').textContent=revenue>0?`Margem: ${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(profit/revenue*100)}% da receita`:'Margem indisponível sem receita';
    const max=Math.max(revenue,expenses,1);
    $('finance-revenue-bar').style.width=`${revenue/max*100}%`;$('finance-expense-bar').style.width=`${expenses/max*100}%`;
    $('finance-chart-revenue').textContent=money.format(revenue/100);$('finance-chart-expenses').textContent=money.format(expenses/100);
    const rows=data.expenses.map(expense=>{
      const row=document.createElement('tr');
      for(const value of [expense.description,categories[expense.category]||expense.category,expense.expense_date.split('-').reverse().join('/'),money.format(expense.amount_cents/100)]){
        const cell=document.createElement('td');cell.textContent=value;row.append(cell);
      }
      const cell=document.createElement('td');cell.className='expense-actions';
      const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Editar';edit.setAttribute('aria-label',`Editar gasto: ${expense.description}`);
      edit.addEventListener('click',()=>{
        if(busy)return;
        fields.expenseId.value=expense.id;fields.description.value=expense.description;fields.category.value=expense.category;fields.expenseDate.value=expense.expense_date;fields.amount.value=(expense.amount_cents/100).toFixed(2).replace('.',',');
        $('expense-form-title').textContent='Editar gasto';$('expense-cancel').hidden=false;form.scrollIntoView({behavior:'smooth',block:'center'});fields.description.focus();
      });
      const remove=document.createElement('button');remove.type='button';remove.className='secondary expense-delete';remove.textContent='Excluir';remove.setAttribute('aria-label',`Excluir gasto: ${expense.description}`);
      remove.addEventListener('click',()=>run(async()=>{
        await admin().api({action:'deleteExpense',id:expense.id});
        if(fields.expenseId.value===expense.id)reset();
        await fetchPage(page);notice('Gasto excluído. Resultado atualizado.');
      }));
      cell.append(edit,remove);row.append(cell);return row;
    });
    $('expense-list').replaceChildren(...rows);page=data.page;
    $('expense-empty').hidden=data.expenses.length>0;$('expense-table').hidden=!data.expenses.length;
    $('expense-page').textContent=`Página ${page+1}`;$('expense-prev').hidden=page===0;$('expense-next').hidden=!data.hasMore;
  }
  async function fetchPage(target=0){
    let data=await admin().api(null,`/api/admin?view=finance&page=${target}`);
    if(target>0&&!data.expenses.length)data=await admin().api(null,'/api/admin?view=finance&page=0');
    render(data);
  }
  async function run(fn){
    if(busy)return;busy=true;notice('');
    const controls=[...form.elements,...document.querySelectorAll('#finance-content button')];
    const enabled=controls.filter(control=>!control.disabled);enabled.forEach(control=>{control.disabled=true;});
    $('financeiro').setAttribute('aria-busy','true');
    try{await fn();}catch(error){notice(error.message||'Não foi possível atualizar o financeiro.',true);}
    finally{busy=false;enabled.forEach(control=>{control.disabled=false;});$('financeiro').setAttribute('aria-busy','false');}
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const amount=fields.amount.value.trim();
    if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(amount)){notice('Informe um valor como 150,00, sem separador de milhar.',true);return;}
    const [whole,fraction='']=amount.replace(',','.').split('.'),amountCents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(amountCents<=0||amountCents>100000000){notice('O valor deve estar entre R$ 0,01 e R$ 1.000.000,00.',true);return;}
    // Retain this ID on failure so retrying a save never creates a second expense.
    fields.expenseId.value ||= crypto.randomUUID();
    const data={action:'saveExpense',id:fields.expenseId.value,description:fields.description.value.trim(),category:fields.category.value,expenseDate:fields.expenseDate.value,amountCents};
    return run(async()=>{await admin().api(data);reset();await fetchPage();notice('Gasto salvo. Resultado atualizado.');});
  });
  $('expense-cancel').addEventListener('click',reset);
  $('expense-prev').addEventListener('click',()=>run(()=>fetchPage(page-1)));
  $('expense-next').addEventListener('click',()=>run(()=>fetchPage(page+1)));
  $('finance-refresh').addEventListener('click',()=>run(()=>fetchPage()));
  window.zanoweenFinance={load,hide};
  hide();
  reset();
})();
