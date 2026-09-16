import {readFile} from 'node:fs/promises';

export const prayers=JSON.parse(await readFile(new URL('../content/prayers.json',import.meta.url),'utf8'));
const categories=['Oraciones habituales','Con María','Adoración y cantos','Respuestas de la Misa'];
prayers.sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceFor=p=>p.id==='o-salutaris'?'https://utacatholics.org/adoration-prayers':p.id==='lauda-sion'?'https://www.abbeyofreginalaudis.org/liturgy-Corpus.html':p.id==='alabanzas-divinas'||p.id==='laudate-dominum'?'https://www.vatican.va/news_services/liturgy/libretti/2013/20130306.pdf':p.id==='adoro-te-devote'?'https://multimedia.opusdei.org/doc/pdf/rezar-con-el-adoro-te-devote20250205113047552437.pdf':p.category==='Con María'?'https://opusdei.org/es/prayers/section/?section1=25':p.category==='Adoración y cantos'?'https://opusdei.org/es/prayers/section/?section1=23':p.category==='Respuestas de la Misa'?'https://www.vatican.va/news_services/liturgy/2005/documents/ns_lit_doc_20050424_messa-inizio-pontif_it.html':'https://opusdei.org/es/prayers/?pb1=es&pb2=latin';

const contextTags={
  'padrenuestro':'rosario diario habituales',
  'avemaria':'rosario maria diario habituales',
  'gloria':'rosario diario habituales',
  'senal-cruz':'diario habituales',
  'angelus':'maria diario',
  'regina-caeli':'maria diario',
  'salve-regina':'rosario maria',
  'bajo-tu-amparo':'maria',
  'acordaos':'maria',
  'adoro-te-devote':'santisimo bendicion adoracion eucaristia',
  'pange-lingua':'santisimo bendicion adoracion eucaristia',
  'tantum-ergo':'santisimo bendicion adoracion eucaristia',
  'o-salutaris':'santisimo bendicion adoracion eucaristia',
  'alabanzas-divinas':'santisimo bendicion adoracion eucaristia',
  'laudate-dominum':'santisimo adoracion',
  'lauda-sion':'santisimo eucaristia',
  'respuestas-misa':'misa liturgia',
  'evangelio':'misa liturgia'
};
const tagsFor=p=>`${p.category} ${contextTags[p.id]||''}`;

export function prayerbook(base){
  const quick=[['rosario','Rosario'],['santisimo','Bendición con el Santísimo'],['misa','Misa'],['maria','María'],['habituales','Oraciones habituales']];
  return `<section class="section prayerbook" id="devocionario">
    <div class="prayer-directory-head">
      <div><span class="eyebrow">DEVOCIONARIO</span><h2>Encuentra una oración.<br>Ábrela y reza.</h2></div>
      <p>Una lista sencilla para tener a mano las oraciones habituales, las de la Misa y las de adoración. Cada oración muestra español y latín al mismo tiempo.</p>
    </div>
    <div class="prayer-controls" hidden>
      <label class="prayer-search-field"><span>Buscar rápido</span><input id="prayer-search" type="search" placeholder="Rosario, Santísimo, Ángelus, Misa…" autocomplete="off"></label>
      <div class="prayer-actions"><button type="button" id="prayer-reset">Ver todas</button><button type="button" id="prayer-collapse">Cerrar abiertas</button></div>
      <p id="prayer-count" class="sr-only" role="status" aria-live="polite"></p>
    </div>
    <nav class="prayer-stacks" aria-label="Buscar por momento o devoción">${quick.map(([query,label])=>`<button type="button" data-prayer-query="${query}">${label}</button>`).join('')}</nav>
    <p class="prayer-help">Toca una oración para abrirla. <strong>V.</strong> indica versículo o ministro; <strong>R.</strong>, respuesta.</p>
    <div class="prayer-entries">${prayers.map((p,i)=>`<details id="${p.id}" class="prayer-entry" data-prayer-category="${esc(p.category)}" data-prayer-tags="${esc(tagsFor(p))}"><summary><span class="prayer-number">${String(i+1).padStart(2,'0')}</span><span class="prayer-entry-title"><small>${esc(p.category)}</small><span>${esc(p.title)}</span></span><span class="prayer-expand" aria-hidden="true">+</span></summary><div class="prayer-entry-content"><p class="prayer-note">${esc(p.note)}</p><div class="prayer-columns"><section class="prayer-version" lang="es" aria-label="Texto en español"><h3>Español</h3><div class="prayer-verses">${esc(p.es)}</div></section><section class="prayer-version" lang="la" aria-label="Texto en latín"><h3>Latín</h3><div class="prayer-verses">${esc(p.la)}</div></section></div><div class="prayer-entry-links"><a href="#${p.id}">Enlace a esta oración</a><a href="${esc(sourceFor(p))}" target="_blank" rel="noopener noreferrer">Consultar referencia ↗</a><a href="#devocionario">Volver arriba ↑</a></div></div></details>`).join('')}</div>
    <p id="prayer-empty" hidden>No encontramos esa oración. Prueba otra palabra o vuelve a ver todas.</p>
    <div class="prayer-more"><div><span class="eyebrow">PARA SEGUIR REZANDO</span><h2>Todo a mano.</h2></div><div><p>Las traducciones de apoyo ayudan a comprender el latín. Para una celebración, sigue siempre la versión indicada por quien la dirige.</p><a class="button light" href="https://opusdei.org/es/prayers/?pb1=es&pb2=latin" target="_blank" rel="noopener noreferrer">Abrir el devocionario completo ↗</a><p><a href="${base}guias/retiro/">Cómo vivir un retiro mensual ↗</a></p></div></div>
  </section>`;
}
