import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {calendar} from '../public/calendar.js';
import {cleanPublicCopy} from './content-cleanup.mjs';
import {backofficeHTML} from './backoffice.mjs';
const basePath=process.env.BASE_PATH||'/comarca/';if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw Error('BASE_PATH inválido');
const oneSignalAppId=process.env.ONESIGNAL_APP_ID||'';if(oneSignalAppId&&!/^[a-f0-9-]{36}$/i.test(oneSignalAppId))throw Error('ONESIGNAL_APP_ID inválido');
const registrationApi=process.env.REGISTRATION_API||'',turnstileSiteKey=process.env.TURNSTILE_SITE_KEY||'';
if(registrationApi&&!/^https:\/\/[^\s]+\/solicitudes$/.test(registrationApi))throw Error('REGISTRATION_API inválido');
const platformOrigin=process.env.PLATFORM_ORIGIN||'https://comarca.kipadmon.com';
if(!/^https:\/\/[^\s/]+$/.test(platformOrigin))throw Error('PLATFORM_ORIGIN inválido');
const data=JSON.parse(await readFile('public/data.json','utf8'));if(!Array.isArray(data.events)||!Array.isArray(data.resources))throw Error('Datos inválidos');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
const editorialCSS=await readFile('public/editorial-fix.css','utf8'),auditCSS=await readFile('public/visual-audit.css','utf8'),teamCSS=await readFile('public/team-page.css','utf8'),baseCSS=await readFile('dist/styles.css','utf8'),backofficeCSS=await readFile('public/backoffice.css','utf8');
await writeFile('dist/styles.css',`${baseCSS}\n\n${editorialCSS}\n\n${auditCSS}\n\n${teamCSS}\n`);
await writeFile('dist/config.json',JSON.stringify({basePath,oneSignalAppId,registrationApi,turnstileSiteKey,platformOrigin,calendarURL:platformOrigin+'/calendario.ics',signupURL:basePath+'participar/#inscripcion'}));
await writeFile('dist/manifest.webmanifest',JSON.stringify({id:basePath,name:'La Comarca',short_name:'La Comarca',lang:'es-MX',start_url:basePath,scope:basePath,display:'standalone',background_color:'#ffffff',theme_color:'#133b58',icons:[{src:'./assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'./assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
await writeFile('dist/agenda.ics',calendar(data.events));await writeFile('dist/.nojekyll','');console.log(`Web lista: ${data.events.length} actividades, ${data.resources.length} recursos.`);
const version=createHash('sha256').update(await readFile('public/app.js')).update(await readFile('public/home-announcements.js')).update(await readFile('public/team-auth.js')).update(await readFile('public/backoffice.js')).update(backofficeCSS).update(await readFile('public/styles.css')).update(editorialCSS).update(auditCSS).update(teamCSS).update(await readFile('public/calendar.js')).update(await readFile('public/motion.js')).update(await readFile('public/registration.js')).update(await readFile('public/formation.js')).update(await readFile('public/subscription.js')).digest('hex').slice(0,12);
let html=await readFile('dist/index.html','utf8');html=html.replace('./styles.css',`./styles.css?v=${version}`).replace('./app.js',`./app.js?v=${version}`);await writeFile('dist/index.html',html);
let app=await readFile('dist/app.js','utf8');app=app.replace("'./calendar.js'",`'./calendar.js?v=${version}'`).replace("'./motion.js'",`'./motion.js?v=${version}'`).replace("'./registration.js'",`'./registration.js?v=${version}'`).replace("'./formation.js'",`'./formation.js?v=${version}'`).replace("'./subscription.js'",`'./subscription.js?v=${version}'`);app+=`\nimport './home-announcements.js?v=${version}';\nimport './team-auth.js?v=${version}';\n`;await writeFile('dist/app.js',app);
const {buildPages}=await import('./pages.mjs');await buildPages(data,basePath,version,platformOrigin);

const homePath='dist/index.html';let homeHTML=await readFile(homePath,'utf8');
homeHTML=homeHTML.replace(/<section class="priority-banner"[\s\S]*?<\/section>/,`<section class="home-feature" aria-label="Próximos encuentros"><div class="home-announcements-head"><div><span class="eyebrow">LO QUE VIENE</span><h2>Próximos<br>encuentros.</h2></div><p>Cargando los próximos encuentros especiales…</p></div></section>`);
await writeFile(homePath,homeHTML);

const teamPath='dist/equipo/index.html',cmsURL=platformOrigin.replace(/\/$/,'')+'/cms/';let teamHTML=await readFile(teamPath,'utf8');
teamHTML=teamHTML.replace(/<section class="page-intro[^"]*">[\s\S]*?<\/section>/,`<section class="page-intro login-intro"><span class="eyebrow">EQUIPO</span><h1 class="page-title"><span class="word-mask"><span>Iniciar<br>sesión.</span></span></h1><p>Acceso para quienes coordinan las actividades y contenidos de La Comarca.</p></section>`);
teamHTML=teamHTML.replace(/<section class="section team-login-section">[\s\S]*?<\/section>/,`<section class="section team-access-section" data-team-auth><div class="team-access-heading"><span class="eyebrow">ACCESO PRIVADO</span><h2>Bienvenido.</h2><p>Usa el correo y la contraseña de tu cuenta del equipo.</p></div><div class="team-access-body"><form id="supabase-team-signin" class="team-access-form"><label><span>Correo</span><input type="email" name="email" autocomplete="username" required maxlength="254"></label><label><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required maxlength="128"></label><button class="button team-submit" type="submit"><span>Entrar</span><span aria-hidden="true">↗</span></button><p id="team-login-status" class="team-login-status" data-team-status role="status" aria-live="polite"></p><p class="team-access-note">Si todavía no tienes acceso o no puedes entrar, pide ayuda a la persona que coordina tu equipo.</p></form><div class="team-access-panel" data-team-panel hidden></div></div></section>`).replaceAll('Acceso del equipo','Iniciar sesión');
const visibleTeamText=teamHTML.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');
if(/\b(?:supabase|memberships?|backend|endpoint)\b/i.test(visibleTeamText))throw Error('La página de equipo expone texto técnico');
await writeFile(teamPath,teamHTML);

await mkdir('dist/equipo/catecismo',{recursive:true});
await writeFile('dist/equipo/catecismo/index.html',backofficeHTML(basePath,version));

const resourcesIcon='<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z"/><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z"/></svg>';
async function htmlFiles(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())out.push(...await htmlFiles(path));else if(entry.name.endsWith('.html'))out.push(path);}return out;}
for(const path of await htmlFiles('dist')){
 let page=cleanPublicCopy(await readFile(path,'utf8'));
 page=page.replaceAll(`href="${cmsURL}"`,`href="${basePath}equipo/"`).replaceAll('Acceso del equipo','Iniciar sesión');
 page=page.replace(/(<a href="[^\"]*equipo\/"[^>]*><svg class="dock-icon"[\s\S]*?<\/svg>Equipo<\/a>)/,`<a href="${basePath}recursos/">${resourcesIcon}Recursos</a>$1`);
 await writeFile(path,page);
}
await import('./check-site.mjs');
