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
 const controls=root.querySelector('.prayer-controls');controls.hidden=false;
 const entries=[...root.querySelectorAll('.prayer-entry')],search=root.querySelector('#prayer-search');
 const filter=()=>{
  const query=search.value;
  let visible=0;
  for(const entry of entries){
   const haystack=`${entry.textContent} ${entry.dataset.prayerTags||''}`;
   const show=!normalizeSearch(query)||normalizeSearch(query).split(/\s+/).every(term=>normalizeSearch(haystack).includes(term));
   entry.hidden=!show;if(show)visible++;
  }
  root.querySelector('#prayer-count').textContent=`${visible} de ${entries.length} oraciones`;
  root.querySelector('#prayer-empty').hidden=visible>0;
 };
 const setQuery=value=>{search.value=value;filter();root.querySelector('.prayer-entries')?.scrollIntoView({block:'start',behavior:'smooth'});};
 search.addEventListener('input',filter);
 root.querySelectorAll('[data-prayer-query]').forEach(button=>button.addEventListener('click',()=>setQuery(button.dataset.prayerQuery||'')));
 root.querySelector('#prayer-reset').addEventListener('click',()=>{search.value='';filter();search.focus();});
 root.querySelector('#prayer-collapse').addEventListener('click',()=>entries.forEach(e=>e.open=false));
 const openTarget=()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const entry=entries.find(e=>e.id===id);if(entry){search.value='';filter();entry.hidden=false;entry.open=true;requestAnimationFrame(()=>entry.scrollIntoView({block:'start'}));}};
 root.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{const entry=entries.find(e=>e.id===a.hash.slice(1));if(entry){search.value='';filter();entry.hidden=false;entry.open=true;}}));
 window.addEventListener('hashchange',openTarget);filter();openTarget();
}
