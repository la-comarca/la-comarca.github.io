export const normalizeSearch=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replaceAll('æ','ae').replaceAll('œ','oe').trim();
export const matchesCatalog=(text,category,query,selected)=> (!selected||category===selected)&&normalizeSearch(query).split(/\s+/).every(term=>normalizeSearch(text).includes(term));
export function initFormation(){
 initPrayerbook();
 for(const catalog of document.querySelectorAll('[data-catalog]')){
  const search=catalog.querySelector('[data-catalog-search]'),category=catalog.querySelector('[data-catalog-category]');
  const items=[...catalog.querySelectorAll('[data-catalog-item]')];
  const update=()=>{let count=0;for(const item of items){const show=matchesCatalog(item.textContent,item.dataset.category,search.value,category.value);item.hidden=!show;if(show)count++;}catalog.querySelector('[data-catalog-count]').textContent=`${count} de ${items.length} resultados`;catalog.querySelector('[data-catalog-empty]').hidden=count!==0;};
  search.addEventListener('input',update);category.addEventListener('change',update);catalog.querySelector('[data-catalog-reset]').addEventListener('click',()=>{search.value='';category.value='';update();search.focus();});update();
 }
 const openHash=()=>{const id=decodeURIComponent(location.hash.slice(1));const target=document.getElementById(id);if(target?.matches('.formation-question'))target.open=true;};openHash();window.addEventListener('hashchange',openHash);
}

function initPrayerbook(){
 const root=document.querySelector('.prayerbook');if(!root)return;
 root.querySelector('.prayer-controls').hidden=false;
 const entries=[...root.querySelectorAll('.prayer-entry')],search=root.querySelector('#prayer-search'),category=root.querySelector('#prayer-category'),size=root.querySelector('#prayer-size');
 root.dataset.readingLanguage='both';root.dataset.readingSize='normal';root.querySelectorAll('[data-prayer-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.prayerLanguage==='both')));root.querySelector('.prayer-language')?.setAttribute('hidden','');size?.closest('label')?.setAttribute('hidden','');
 const shortcutData=[['tantum-ergo','Adoración al Santísimo'],['angelus','Ángelus'],['pange-lingua','Pange lingua'],['respuestas-misa','Respuestas de la Misa']];root.querySelectorAll('.prayer-shortcuts a').forEach((link,index)=>{const item=shortcutData[index];if(item){link.href='#'+item[0];link.textContent=item[1]+' ↘';}});
 const filter=()=>{let visible=0;for(const entry of entries){entry.hidden=!matchesCatalog(entry.textContent,entry.dataset.prayerCategory,search.value,category.value);if(!entry.hidden)visible++;}root.querySelector('#prayer-count').textContent=`${visible} de ${entries.length} oraciones y cantos`;root.querySelector('#prayer-empty').hidden=visible>0;};
 const language=value=>{if(!['es','la','both'].includes(value))value='es';root.dataset.readingLanguage=value;root.querySelectorAll('[data-prayer-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.prayerLanguage===value)));try{localStorage.setItem('comarca-prayer-language',value);}catch{}};
 root.querySelectorAll('[data-prayer-language]').forEach(b=>b.addEventListener('click',()=>language(b.dataset.prayerLanguage)));
 size.addEventListener('change',()=>{root.dataset.readingSize=size.value;try{localStorage.setItem('comarca-prayer-size',size.value);}catch{}});
 language('both');
 search.addEventListener('input',filter);category.addEventListener('change',filter);root.querySelector('#prayer-reset').addEventListener('click',()=>{search.value='';category.value='';filter();search.focus();});root.querySelector('#prayer-collapse').addEventListener('click',()=>entries.forEach(e=>e.open=false));
 const openTarget=()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const entry=entries.find(e=>e.id===id);if(entry){search.value='';category.value='';filter();entry.open=true;requestAnimationFrame(()=>entry.scrollIntoView({block:'start'}));}};
 root.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{const entry=entries.find(e=>e.id===a.hash.slice(1));if(entry){search.value='';category.value='';filter();entry.open=true;}}));
 window.addEventListener('hashchange',openTarget);filter();openTarget();
}
