// Final public-copy cleanup applied after page generation.
// Keeps old operational language from surviving in otherwise-public pages.
export function cleanPublicCopy(html){
  return html
    // Resources should be a useful directory, not a long quote/editorial appendix.
    .replace(/<section class="section voices-index"[\s\S]*?<\/section>(?:<div id="voz-[\s\S]*?<\/section><\/div>)*/g,'')
    // Remove legacy FAQ blocks about rides/costs from the public site.
    .replace(/<article class="info-block reveal"><h2>¿Tiene costo participar\?<\/h2>[\s\S]*?<\/article>/g,'')
    .replace(/<article class="info-block reveal"><h2>¿Cómo consigo un ride\?<\/h2>[\s\S]*?<\/article>/g,'')
    // Avoid stale operational promises/details on event and participation pages.
    .replace(/<article class="info-block reveal"><h2>Si la actividad es fuera\.<\/h2>[\s\S]*?<\/article>/g,'')
    .replace(/<article class="info-block reveal"><h2>Tiempo y transporte\.<\/h2>[\s\S]*?<\/article>/g,'')
    .replace(/Costo, alojamiento y transporte pendientes de confirmar\. No des por reservado tu lugar hasta recibir la confirmación del equipo\./g,'Consulta los detalles vigentes de este encuentro en la agenda y confirma tu participación con el equipo.')
    .replace(/El horario de catecismo y los traslados son provisionales\. Confirma tu turno y el tema que prepararás con el equipo\./g,'Consulta los detalles vigentes en la agenda y confirma con el equipo antes de acudir.')
    .replace(/cualquier necesidad de traslado/g,'cualquier detalle práctico')
    .replace(/horarios y traslados previstos/g,'detalles vigentes')
    .replace(/transporte o gastos estimados/g,'materiales u organización necesaria');
}
