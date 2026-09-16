const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function backofficeHTML(basePath,version){
 const base=esc(basePath),v=esc(version);
 const nav=[
  ['resumen','Resumen','⌂'],
  ['students','Alumnos','◎'],
  ['attendance','Pase de lista','✓'],
  ['lessons','Clases','◇'],
  ['grades','Calificaciones','▦'],
  ['topics','Temas','≡'],
  ['shifts','Catequistas','↗']
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
 <aside class="bo-sidebar" aria-label="Navegación del equipo">
  <div class="bo-brand-row">
   <a class="bo-brand" href="${base}">La Comarca<span>.</span></a>
   <span class="bo-private">EQUIPO</span>
  </div>
  <div class="bo-module-heading">
   <span class="bo-kicker">MÓDULO</span>
   <strong>Catecismo</strong>
   <p>Alumnos, sesiones y seguimiento.</p>
  </div>
  <nav class="bo-nav">
   ${nav.map(([key,label,icon],index)=>`<button type="button" data-bo-view="${key}"${index===0?' class="active" aria-current="page"':''}><span class="bo-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}
  </nav>
  <div class="bo-sidebar-foot">
   <a href="${base}agenda/">Ver sitio público <span aria-hidden="true">↗</span></a>
   <button type="button" data-bo-logout>Cerrar sesión <span aria-hidden="true">↗</span></button>
  </div>
 </aside>
 <header class="bo-mobile-head">
  <a class="bo-brand" href="${base}">La Comarca<span>.</span></a>
  <button type="button" class="bo-mobile-menu" data-bo-menu aria-expanded="false" aria-controls="bo-mobile-nav">Menú</button>
 </header>
 <nav class="bo-mobile-nav" id="bo-mobile-nav" hidden>
  ${nav.map(([key,label])=>`<button type="button" data-bo-view="${key}">${label}</button>`).join('')}
  <button type="button" data-bo-logout>Cerrar sesión</button>
 </nav>
 <main class="bo-main" id="bo-content">
  <header class="bo-topbar">
   <div>
    <span class="bo-kicker" data-bo-breadcrumb>CATÉCISMO / RESUMEN</span>
    <h1 data-bo-title>Resumen</h1>
   </div>
   <div class="bo-account" data-bo-account>
    <span class="bo-account-dot" aria-hidden="true"></span>
    <div><strong>Cargando…</strong><small>Equipo</small></div>
   </div>
  </header>
  <section class="bo-content" data-bo-content aria-live="polite">
   <div class="bo-loading"><span></span><p>Preparando Catecismo…</p></div>
  </section>
 </main>
</div>
<dialog class="bo-editor" data-bo-editor aria-labelledby="bo-editor-title">
 <form method="dialog" class="bo-editor-shell" data-bo-editor-form>
  <header class="bo-editor-head">
   <div><span class="bo-kicker" data-bo-editor-kicker>CATÉCISMO</span><h2 id="bo-editor-title" data-bo-editor-title>Registro</h2></div>
   <button type="button" class="bo-close" data-bo-editor-close aria-label="Cerrar">×</button>
  </header>
  <div class="bo-editor-fields" data-bo-editor-fields></div>
  <p class="bo-form-status" data-bo-form-status role="status" aria-live="polite"></p>
  <footer class="bo-editor-actions"><button type="button" class="bo-quiet" data-bo-editor-cancel>Cancelar</button><button type="submit" class="bo-primary">Guardar <span aria-hidden="true">↗</span></button></footer>
 </form>
</dialog>
<div class="bo-toast" data-bo-toast role="status" aria-live="polite" hidden></div>
<script type="module" src="${base}backoffice.js?v=${v}"></script>
</body>
</html>`;
}
