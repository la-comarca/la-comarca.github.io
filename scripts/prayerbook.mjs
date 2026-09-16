import {readFile} from 'node:fs/promises';

export const prayers=JSON.parse(await readFile(new URL('../content/prayers.json',import.meta.url),'utf8'));
const categories=['Oraciones habituales','Con María','Adoración y cantos','Respuestas de la Misa'];
prayers.sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceFor=p=>p.id==='o-salutaris'?'https://utacatholics.org/adoration-prayers':p.id==='lauda-sion'?'https://www.abbeyofreginalaudis.org/liturgy-Corpus.html':p.id==='alabanzas-divinas'||p.id==='laudate-dominum'?'https://www.vatican.va/news_services/liturgy/libretti/2013/20130306.pdf':p.id==='adoro-te-devote'?'https://multimedia.opusdei.org/doc/pdf/rezar-con-el-adoro-te-devote20250205113047552437.pdf':p.category==='Con María'?'https://opusdei.org/es/prayers/section/?section1=25':p.category==='Adoración y cantos'?'https://opusdei.org/es/prayers/section/?section1=23':p.category==='Respuestas de la Misa'?'https://www.vatican.va/news_services/liturgy/2005/documents/ns_lit_doc_20050424_messa-inizio-pontif_it.html':'https://opusdei.org/es/prayers/?pb1=es&pb2=latin';

const contextTags={
  'padrenuestro':'rosario habituales','avemaria':'rosario maria habituales','gloria':'rosario habituales','senal-cruz':'habituales',
  'angelus':'maria habituales','regina-caeli':'maria habituales','salve-regina':'rosario maria','bajo-tu-amparo':'maria','acordaos':'maria',
  'adoro-te-devote':'santisimo','pange-lingua':'santisimo','tantum-ergo':'santisimo','o-salutaris':'santisimo','alabanzas-divinas':'santisimo','laudate-dominum':'santisimo','lauda-sion':'santisimo',
  'respuestas-misa':'misa','evangelio':'misa'
};
const tagsFor=p=>`${p.category} ${contextTags[p.id]||''}`.toLocaleLowerCase('es');

export function prayerbook(base){
  const quick=[['rosario','Rosario'],['santisimo','Santísimo'],['misa','Misa'],['maria','María'],['habituales','Habituales']];
  return `<section class="section prayerbook" id="devocionario">
    <div class="prayer-directory-head"><div><span class="eyebrow">DEVOCIONARIO</span><h2>Oraciones para<br>tener a mano.</h2></div><p>Abre una oración para leer español y latín al mismo tiempo. Usa un filtro sólo cuando lo necesites.</p></div>
    <nav class="prayer-stacks" aria-label="Filtrar oraciones">${quick.map(([query,label])=>`<button type="button" data-prayer-query="${query}" aria-pressed="false">${label}</button>`).join('')}</nav>
    <p class="prayer-help">Toca una oración para abrirla. <strong>V.</strong> indica versículo o ministro; <strong>R.</strong>, respuesta.</p>
    <div class="prayer-entries">${prayers.map(p=>`<details id="${p.id}" class="prayer-entry" data-prayer-tags="${esc(tagsFor(p))}"><summary><span class="prayer-entry-title"><small>${esc(p.category)}</small><span>${esc(p.title)}</span></span><span class="prayer-expand" aria-hidden="true">+</span></summary><div class="prayer-entry-content"><p class="prayer-note">${esc(p.note)}</p><div class="prayer-columns"><section class="prayer-version" lang="es" aria-label="Texto en español"><h3>Español</h3><div class="prayer-verses">${esc(p.es)}</div></section><section class="prayer-version" lang="la" aria-label="Texto en latín"><h3>Latín</h3><div class="prayer-verses">${esc(p.la)}</div></section></div><div class="prayer-entry-links"><a href="#${p.id}">Enlace a esta oración</a><a href="${esc(sourceFor(p))}" target="_blank" rel="noopener noreferrer">Consultar referencia ↗</a><a href="#devocionario">Volver arriba ↑</a></div></div></details>`).join('')}</div>
    <p id="prayer-empty" class="prayer-empty" hidden>No hay oraciones en este filtro.</p>
    <div class="prayer-more"><div><span class="eyebrow">PARA SEGUIR REZANDO</span><h2>Todo a mano.</h2></div><div><p>Las traducciones de apoyo ayudan a comprender el latín. Para una celebración, sigue siempre la versión indicada por quien la dirige.</p><a class="button light" href="https://opusdei.org/es/prayers/?pb1=es&pb2=latin" target="_blank" rel="noopener noreferrer">Abrir el devocionario completo ↗</a><p><a href="${base}guias/retiro/">Cómo vivir un retiro mensual ↗</a></p></div></div>
    <script>(()=>{const buttons=[...document.querySelectorAll('[data-prayer-query]')],entries=[...document.querySelectorAll('.prayer-entry')],empty=document.querySelector('#prayer-empty');let active='';const apply=()=>{let shown=0;entries.forEach(entry=>{const visible=!active||(entry.dataset.prayerTags||'').includes(active);entry.hidden=!visible;if(visible)shown++;});buttons.forEach(button=>{const on=button.dataset.prayerQuery===active;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));});empty.hidden=shown!==0;};buttons.forEach(button=>button.addEventListener('click',()=>{active=active===button.dataset.prayerQuery?'':button.dataset.prayerQuery;apply();}));apply();})();</script>
  </section>`;
}
