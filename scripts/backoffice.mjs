const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function backofficeHTML(basePath,version){
 const base=esc(basePath),v=esc(version);
 const nav=[
  ['resumen','Resumen'],
  ['students','Alumnos'],
  ['attendance','Pase de lista'],
  ['lessons','Clases'],
  ['grades','Calificaciones'],
  ['topics','Temas'],
  ['shifts','Catequistas']
 ];
 return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#133b58">
<title>Catecismo · Equipo · La Comarca</title>
<link rel="icon" href="${base}assets/icon-192.png">
<link rel="stylesheet" href="${base}styles.css?v=${v}">
<link rel="stylesheet" href="${base}backoffice.css?v=${v}">
</head>
<body class="bo-body">
<a class="skip" href="#bo-content">Saltar al contenido</a>
<div class="bo-shell" data-backoffice>
 <header class="bo-appbar">
  <div class="bo-app-identity">
   <a class="bo-brand" href="${base}">La Comarca<span>.</span></a>
   <span class="bo-app-switcher" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>
   <div class="bo-app-name"><small>EQUIPO</small><strong>Catecismo</strong></div>
  </div>
  <nav class="bo-appmenu" aria-label="Catecismo">
   ${nav.map(([key,label],index)=>`<button type="button" data-bo-view="${key}"${index===0?' class="active" aria-current="page"':''}>${label}</button>`).join('')}
  </nav>
  <div class="bo-account-wrap">
   <details class="bo-user-menu"><summary class="bo-account" data-bo-account aria-label="Cuenta"><span class="bo-account-avatar" aria-hidden="true">LC</span><span class="bo-account-copy"><strong>Cargando…</strong><small>Equipo</small></span></summary><div class="bo-user-menu-panel"><a href="${base}">Ir al sitio público</a><button type="button" data-bo-logout>Cerrar sesión</button></div></details>
   <button class="bo-icon-button bo-mobile-menu" type="button" data-bo-menu aria-expanded="false" aria-controls="bo-mobile-nav" aria-label="Abrir menú">☰</button>
  </div>
 </header>
 <nav class="bo-mobile-nav" id="bo-mobile-nav" hidden>
  ${nav.map(([key,label])=>`<button type="button" data-bo-view="${key}">${label}</button>`).join('')}
  <a href="${base}agenda/">Sitio público</a>
  <button type="button" data-bo-logout>Cerrar sesión</button>
 </nav>
 <header class="bo-controlbar">
  <div class="bo-control-heading">
   <button class="bo-back" type="button" data-bo-back hidden aria-label="Volver">←</button>
   <div><span class="bo-breadcrumb" data-bo-breadcrumb>CATÉCISMO</span><h1 data-bo-title>Resumen</h1></div>
  </div>
  <div class="bo-control-actions" data-bo-control-actions></div>
 </header>
 <section class="bo-search-command" data-bo-toolbar hidden></section>
 <main class="bo-main" id="bo-content">
  <section class="bo-content" data-bo-content aria-live="polite">
   <div class="bo-loading"><span></span><p>Preparando Catecismo…</p></div>
  </section>
 </main>
</div>
<dialog class="bo-related-dialog" data-bo-related aria-labelledby="bo-related-title">
 <header><div><span class="bo-kicker">RELACIONADOS</span><h2 id="bo-related-title" data-bo-related-title>Registros</h2></div><button type="button" data-bo-related-close aria-label="Cerrar">×</button></header>
 <div data-bo-related-body></div>
</dialog>
<div class="bo-toast" data-bo-toast role="status" aria-live="polite" hidden></div>
<script type="module" src="${base}backoffice.js?v=${v}"></script>
</body>
</html>`;
}
