import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {calendar} from '../public/calendar.js';
import {cleanPublicCopy} from './content-cleanup.mjs';
const basePath=process.env.BASE_PATH||'/comarca/';if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw Error('BASE_PATH inválido');
const oneSignalAppId=process.env.ONESIGNAL_APP_ID||'';if(oneSignalAppId&&!/^[a-f0-9-]{36}$/i.test(oneSignalAppId))throw Error('ONESIGNAL_APP_ID inválido');
const registrationApi=process.env.REGISTRATION_API||'',turnstileSiteKey=process.env.TURNSTILE_SITE_KEY||'';
if(registrationApi&&!/^https:\/\/[^\s]+\/solicitudes$/.test(registrationApi))throw Error('REGISTRATION_API inválido');
const platformOrigin=process.env.PLATFORM_ORIGIN||'https://comarca.kipadmon.com';
if(!/^https:\/\/[^\s/]+$/.test(platformOrigin))throw Error('PLATFORM_ORIGIN inválido');
const data=JSON.parse(await readFile('public/data.json','utf8'));if(!Array.isArray(data.events)||!Array.isArray(data.resources))throw Error('Datos inválidos');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
const editorialCSS=await readFile('public/editorial-fix.css','utf8'),auditCSS=await readFile('public/visual-audit.css','utf8'),baseCSS=await readFile('dist/styles.css','utf8');
await writeFile('dist/styles.css',`${baseCSS}\n\n${editorialCSS}\n\n${auditCSS}\n`);
await writeFile('dist/config.json',JSON.stringify({basePath,oneSignalAppId,registrationApi,turnstileSiteKey,platformOrigin,calendarURL:platformOrigin+'/calendario.ics',signupURL:basePath+'participar/#inscripcion'}));
await writeFile('dist/manifest.webmanifest',JSON.stringify({id:basePath,name:'La Comarca',short_name:'La Comarca',lang:'es-MX',start_url:basePath,scope:basePath,display:'standalone',background_color:'#ffffff',theme_color:'#133b58',icons:[{src:'./assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'./assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
await writeFile('dist/agenda.ics',calendar(data.events));await writeFile('dist/.nojekyll','');console.log(`Web lista: ${data.events.length} actividades, ${data.resources.length} recursos.`);
const version=createHash('sha256').update(await readFile('public/app.js')).update(await readFile('public/home-announcements.js')).update(await readFile('public/team-auth.js')).update(await readFile('public/styles.css')).update(editorialCSS).update(auditCSS).update(await readFile('public/calendar.js')).update(await readFile('public/motion.js')).update(await readFile('public/registration.js')).update(await readFile('public/formation.js')).update(await readFile('public/subscription.js')).digest('hex').slice(0,12);
let html=await readFile('dist/index.html','utf8');html=html.replace('./styles.css',`./styles.css?v=${version}`).replace('./app.js',`./app.js?v=${version}`);await writeFile('dist/index.html',html);
let app=await readFile('dist/app.js','utf8');app=app.replace("'./calendar.js'",`'./calendar.js?v=${version}'`).replace("'./motion.js'",`'./motion.js?v=${version}'`).replace("'./registration.js'",`'./registration.js?v=${version}'`).replace("'./formation.js'",`'./formation.js?v=${version}'`).replace("'./subscription.js'",`'./subscription.js?v=${version}'`);app+=`\nimport './home-announcements.js?v=${version}';\nimport './team-auth.js?v=${version}';\n`;await writeFile('dist/app.js',app);
const {buildPages}=await import('./pages.mjs');await buildPages(data,basePath,version,platformOrigin);

const homePath='dist/index.html';let homeHTML=await readFile(homePath,'utf8');
homeHTML=homeHTML.replace(/<section class="priority-banner"[\s\S]*?<\/section>/,`<section class="home-feature" aria-label="Próximos encuentros"><div class="home-announcements-head"><div><span class="eyebrow">LO QUE VIENE</span><h2>Próximos<br>encuentros.</h2></div><p>Cargando los próximos encuentros especiales…</p></div></section>`);
await writeFile(homePath,homeHTML);

const teamPath='dist/equipo/index.html',cmsURL=platformOrigin.replace(/\/$/,'')+'/cms/';let teamHTML=await readFile(teamPath,'utf8');
teamHTML=teamHTML.replace(/<section class="page-intro[^"]*">[\s\S]*?<\/section>/,`<section class="page-intro login-intro"><span class="eyebrow">EQUIPO</span><h1 class="page-title"><span class="word-mask"><span>Iniciar<br>sesión.</span></span></h1><p>El acceso vive aquí, dentro de La Comarca. Supabase Auth valida tu identidad y tus membresías determinan qué espacios puedes usar.</p></section>`);
teamHTML=teamHTML.replace(/<section class="section team-login-section">[\s\S]*?<\/section>/,`<section class="section team-login-section" data-team-auth><div class="team-login-card"><span class="eyebrow">SUPABASE AUTH</span><h2>Bienvenido.</h2><form id="supabase-team-signin"><label>Correo<input type="email" name="email" autocomplete="username" required maxlength="254"></label><label>Contraseña<input type="password" name="password" autocomplete="current-password" required maxlength="128"></label><button class="button primary" type="submit">Entrar ↗</button><p id="team-login-status" data-team-status role="status" aria-live="polite"></p></form><div data-team-panel hidden></div></div><aside class="team-login-aside"><span class="eyebrow">TU ACCESO</span><h3>Un solo inicio de sesión.</h3><p>Después de entrar verás únicamente los espacios autorizados para tu cuenta: Agenda, Materiales, Catecismo, Traslados, Inscripciones u Operaciones.</p><ul><li>La contraseña se valida con Supabase Auth.</li><li>Los permisos salen de tus memberships.</li><li>Las llaves privilegiadas nunca llegan al navegador.</li></ul></aside></section>`).replaceAll('Acceso del equipo','Iniciar sesión');await writeFile(teamPath,teamHTML);

const resourcesIcon='<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z"/><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z"/></svg>';
async function htmlFiles(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())out.push(...await htmlFiles(path));else if(entry.name.endsWith('.html'))out.push(path);}return out;}
for(const path of await htmlFiles('dist')){
 let page=cleanPublicCopy(await readFile(path,'utf8'));
 page=page.replaceAll(`href="${cmsURL}"`,`href="${basePath}equipo/"`).replaceAll('Acceso del equipo','Iniciar sesión');
 // Mobile has five primary destinations: four public tools plus the team entry.
 page=page.replace(/(<a href="[^\"]*equipo\/"[^>]*><svg class="dock-icon"[\s\S]*?<\/svg>Equipo<\/a>)/,`<a href="${basePath}recursos/">${resourcesIcon}Recursos</a>$1`);
 await writeFile(path,page);
}
await import('./check-site.mjs');
