import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {calendar} from '../public/calendar.js';
const basePath=process.env.BASE_PATH||'/comarca/';if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw Error('BASE_PATH inválido');
const oneSignalAppId=process.env.ONESIGNAL_APP_ID||'';if(oneSignalAppId&&!/^[a-f0-9-]{36}$/i.test(oneSignalAppId))throw Error('ONESIGNAL_APP_ID inválido');
const registrationApi=process.env.REGISTRATION_API||'',turnstileSiteKey=process.env.TURNSTILE_SITE_KEY||'';
if(registrationApi&&!/^https:\/\/[^\s]+\/solicitudes$/.test(registrationApi))throw Error('REGISTRATION_API inválido');
const platformOrigin=process.env.PLATFORM_ORIGIN||'https://comarca.kipadmon.com';
if(!/^https:\/\/[^\s/]+$/.test(platformOrigin))throw Error('PLATFORM_ORIGIN inválido');
const data=JSON.parse(await readFile('public/data.json','utf8'));if(!Array.isArray(data.events)||!Array.isArray(data.resources))throw Error('Datos inválidos');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});

// Keep the legacy stylesheet untouched while a small final layer restores the shared
// public visual system. Appending it guarantees that generated pages and the homepage
// receive the same cascade without duplicating the full stylesheet.
const editorialCSS=await readFile('public/editorial-fix.css','utf8');
const baseCSS=await readFile('dist/styles.css','utf8');
await writeFile('dist/styles.css',`${baseCSS}\n\n${editorialCSS}\n`);

await writeFile('dist/config.json',JSON.stringify({basePath,oneSignalAppId,registrationApi,turnstileSiteKey,platformOrigin,calendarURL:platformOrigin+'/calendario.ics',signupURL:basePath+'participar/#inscripcion'}));
await writeFile('dist/manifest.webmanifest',JSON.stringify({id:basePath,name:'La Comarca',short_name:'La Comarca',lang:'es-MX',start_url:basePath,scope:basePath,display:'standalone',background_color:'#ffffff',theme_color:'#133b58',icons:[{src:'./assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'./assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
await writeFile('dist/agenda.ics',calendar(data.events));await writeFile('dist/.nojekyll','');console.log(`Web lista: ${data.events.length} actividades, ${data.resources.length} recursos.`);

const version=createHash('sha256').update(await readFile('public/app.js')).update(await readFile('public/styles.css')).update(editorialCSS).update(await readFile('public/calendar.js')).update(await readFile('public/motion.js')).update(await readFile('public/registration.js')).update(await readFile('public/formation.js')).update(await readFile('public/subscription.js')).digest('hex').slice(0,12);
let html=await readFile('dist/index.html','utf8');html=html.replace('./styles.css',`./styles.css?v=${version}`).replace('./app.js',`./app.js?v=${version}`);await writeFile('dist/index.html',html);
let app=await readFile('dist/app.js','utf8');app=app.replace("'./calendar.js'",`'./calendar.js?v=${version}'`);app=app.replace("'./motion.js'",`'./motion.js?v=${version}'`);app=app.replace("'./registration.js'",`'./registration.js?v=${version}'`);app=app.replace("'./formation.js'",`'./formation.js?v=${version}'`);app=app.replace("'./subscription.js'",`'./subscription.js?v=${version}'`);await writeFile('dist/app.js',app);

const {buildPages}=await import('./pages.mjs');
await buildPages(data,basePath,version,platformOrigin);

// GitHub Pages is static. Do not present a form that appears to authenticate on the
// static origin. The public Team page remains in the same editorial shell and hands
// the user to the existing private server where authentication is actually enforced.
const teamPath='dist/equipo/index.html',cmsURL=platformOrigin.replace(/\/$/,'')+'/cms/';
let teamHTML=await readFile(teamPath,'utf8');
teamHTML=teamHTML.replace('Inicia sesión para continuar.','Organización, agenda y seguimiento para quienes coordinan La Comarca.');
teamHTML=teamHTML.replace(/<section class="section team-login-section">[\s\S]*?<\/section>/,`<section class="section team-gateway"><div><div class="team-gateway-copy"><span class="eyebrow">ESPACIO PRIVADO</span><h2>Lo público aquí.<br>La gestión, aparte.</h2><p>El portal público informa y acompaña. La organización interna —personas, asistencia, materiales y seguimiento— permanece en el panel privado, con autenticación y permisos del servidor.</p><a class="button team-gateway-button" href="${cmsURL}">Entrar al panel privado <span aria-hidden="true">↗</span></a></div><div class="team-gateway-notes"><div class="team-gateway-note"><small>01 · Privado</small><p>Los datos internos no se publican en GitHub Pages.</p></div><div class="team-gateway-note"><small>02 · Seguro</small><p>El acceso se decide en el servidor, no por botones ocultos.</p></div><div class="team-gateway-note"><small>03 · Claro</small><p>Si no tienes cuenta, pide una invitación al administrador.</p></div></div></div><aside class="team-gateway-aside"><span class="eyebrow">EQUIPO</span><p>Un solo lugar para coordinar.</p><small>Agenda, operación y seguimiento continúan en el panel privado existente.</small></aside></section>`);
await writeFile(teamPath,teamHTML);

await import('./check-site.mjs');
