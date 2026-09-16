import {readFile} from 'node:fs/promises';

export const prayers=JSON.parse(await readFile(new URL('../content/prayers.json',import.meta.url),'utf8'));
const categories=['Oraciones habituales','Con María','Adoración y cantos','Respuestas de la Misa'];
prayers.sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceFor=p=>p.id==='o-salutaris'?'https://utacatholics.org/adoration-prayers':p.id==='lauda-sion'?'https://www.abbeyofreginalaudis.org/liturgy-Corpus.html':p.id==='alabanzas-divinas'||p.id==='laudate-dominum'?'https://www.vatican.va/news_services/liturgy/libretti/2013/20130306.pdf':p.id==='adoro-te-devote'?'https://multimedia.opusdei.org/doc/pdf/rezar-con-el-adoro-te-devote20250205113047552437.pdf':p.category==='Con María'?'https://opusdei.org/es/prayers/section/?section1=25':p.category==='Adoración y cantos'?'https://opusdei.org/es/prayers/section/?section1=23':p.category==='Respuestas de la Misa'?'https://www.vatican.va/news_services/liturgy/2005/documents/ns_lit_doc_20050424_messa-inizio-pontif_it.html':'https://opusdei.org/es/prayers/?pb1=es&pb2=latin';

export function prayerbook(base){
  const shortcutLinks=[['tantum-ergo','Adoración al Santísimo'],['angelus','Ángelus'],['pange-lingua','Pange lingua'],['respuestas-misa','Respuestas de la Misa']];
  return `<section class="section prayerbook" id="devocionario">
    <div class="prayer-directory-head">
      <div><span class="eyebrow">DEVOCIONARIO</span><h2>Oraciones para<br>volver a lo esencial.</h2></div>
      <p>Textos habituales para la oración personal, la adoración y la Misa. Busca una oración o abre el índice; al desplegar cada texto puedes leer español y latín lado a lado.</p>
    </div>
    <nav class="prayer-shortcuts" aria-label="Accesos rápidos"><span class="shortcut-label">Ir directamente a</span>${shortcutLinks.map(([id,label])=>`<a href="#${id}">${label} <span aria-hidden="true">↘</span></a>`).join('')}</nav>
    <div class="prayer-controls" hidden>
      <div class="prayer-control-heading"><span class="eyebrow">BUSCAR</span><strong>Encuentra un texto</strong></div>
      <label class="prayer-search-field"><span>Buscar</span><input id="prayer-search" type="search" placeholder="Ángelus, Tantum ergo, Evangelio…"></label>
      <label><span>Categoría</span><select id="prayer-category"><option value="">Todas</option>${[...new Set(prayers.map(p=>p.category))].map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>
      <div class="prayer-language" role="group" aria-label="Idioma de lectura"><span>Idioma</span><div><button type="button" data-prayer-language="es" aria-pressed="false">Español</button><button type="button" data-prayer-language="la" aria-pressed="false">Latín</button><button type="button" data-prayer-language="both" aria-pressed="true">Ambos</button></div></div>
      <label class="prayer-size" hidden><span>Tamaño de letra</span><select id="prayer-size"><option value="normal">Normal</option><option value="large">Grande</option><option value="larger">Muy grande</option></select></label>
      <div class="prayer-actions"><button type="button" id="prayer-reset">Limpiar</button><button type="button" id="prayer-collapse">Cerrar todo</button></div>
      <p id="prayer-count" role="status" aria-live="polite"></p>
    </div>
    <p class="prayer-help">Abre una oración para leerla. <strong>V.</strong> indica versículo o ministro; <strong>R.</strong>, respuesta. Los cantos se presentan como texto.</p>
    <div class="prayer-entries">${prayers.map((p,i)=>`<details id="${p.id}" class="prayer-entry" data-prayer-category="${esc(p.category)}"><summary><span class="prayer-number">${String(i+1).padStart(2,'0')}</span><span class="prayer-entry-title"><small>${esc(p.category)}</small><span>${esc(p.title)}</span></span><span class="prayer-expand" aria-hidden="true">+</span></summary><div class="prayer-entry-content"><p class="prayer-note">${esc(p.note)}</p><div class="prayer-columns"><section class="prayer-version" lang="es" data-prayer-version="es" aria-label="Texto en español"><h3>Español</h3><div class="prayer-verses">${esc(p.es)}</div></section><section class="prayer-version" lang="la" data-prayer-version="la" aria-label="Texto en latín"><h3>Latín</h3><div class="prayer-verses">${esc(p.la)}</div></section></div><div class="prayer-entry-links"><a href="#${p.id}">Enlace a esta oración</a><a href="${esc(sourceFor(p))}" target="_blank" rel="noopener noreferrer">Consultar referencia ↗</a><a href="#devocionario">Volver al índice ↑</a></div></div></details>`).join('')}</div>
    <p id="prayer-empty" hidden>No encontramos esa oración. Prueba con otra palabra o limpia los filtros.</p>
    <div class="prayer-more"><div><span class="eyebrow">PARA SEGUIR REZANDO</span><h2>Todo a mano.</h2></div><div><p>Las traducciones de apoyo de los himnos ayudan a comprender el latín. Para cantar en español o seguir una celebración, utiliza la versión indicada por quien la dirige.</p><a class="button light" href="https://opusdei.org/es/prayers/?pb1=es&pb2=latin" target="_blank" rel="noopener noreferrer">Abrir el devocionario completo ↗</a><p><a href="${base}guias/retiro/">Cómo vivir un retiro mensual ↗</a></p></div></div>
  </section>`;
}
