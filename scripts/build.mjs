import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {calendar} from '../public/calendar.js';
const basePath=process.env.BASE_PATH||'/comarca/';if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw Error('BASE_PATH inválido');
const oneSignalAppId=process.env.ONESIGNAL_APP_ID||'';if(oneSignalAppId&&!/^[a-f0-9-]{36}$/i.test(oneSignalAppId))throw Error('ONESIGNAL_APP_ID inválido');
const registrationApi=process.env.REGISTRATION_API||'',turnstileSiteKey=process.env.TURNSTILE_SITE_KEY||'';
if(registrationApi&&!/^https:\/\/[^\s]+\/solicitudes$/.test(registrationApi))throw Error('REGISTRATION_API inválido');
const platformOrigin=process.env.PLATFORM_ORIGIN||'https://comarca.kipadmon.com';
if(!/^https:\/\/[^\s/]+$/.test(platformOrigin))throw Error('PLATFORM_ORIGIN inválido');
const data=JSON.parse(await readFile('public/data.json','utf8'));if(!Array.isArray(data.events)||!Array.isArray(data.resources))throw Error('Datos inválidos');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});

const editorialCSS=await readFile('public/editorial-fix.css','utf8');
const auditCSS=await readFile('public/visual-audit.css','utf8');
const baseCSS=await readFile('dist/styles.css','utf8');
await writeFile('dist/styles.css',`${baseCSS}\n\n${editorialCSS}\n\n${auditCSS}\n`);

await writeFile('dist/config.json',JSON.stringify({basePath,oneSignalAppId,registrationApi,turnstileSiteKey,platformOrigin,calendarURL:platformOrigin+'/calendario.ics',signupURL:basePath+'participar/#inscripcion'}));
await writeFile('dist/manifest.webmanifest',JSON.stringify({id:basePath,name:'La Comarca',short_name:'La Comarca',lang:'es-MX',start_url:basePath,scope:basePath,display:'standalone',background_color:'#ffffff',theme_color:'#133b58',icons:[{src:'./assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'./assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
await writeFile('dist/agenda.ics',calendar(data.events));await writeFile('dist/.nojekyll','');console.log(`Web lista: ${data.events.length} actividades, ${data.resources.length} recursos.`);

const version=createHash('sha256').update(await readFile('public/app.js')).update(await readFile('public/styles.css')).update(editorialCSS).update(auditCSS).update(await readFile('public/calendar.js')).update(await readFile('public/motion.js')).update(await readFile('public/registration.js')).update(await readFile('public/formation.js')).update(await readFile('public/subscription.js')).digest('hex').slice(0,12);
let html=await readFile('dist/index.html','utf8');html=html.replace('./styles.css',`./styles.css?v=${version}`).replace('./app.js',`./app.js?v=${version}`);await writeFile('dist/index.html',html);
let app=await readFile('dist/app.js','utf8');app=app.replace("'./calendar.js'",`'./calendar.js?v=${version}'`);app=app.replace("'./motion.js'",`'./motion.js?v=${version}'`);app=app.replace("'./registration.js'",`'./registration.js?v=${version}'`);app=app.replace("'./formation.js'",`'./formation.js?v=${version}'`);app=app.replace("'./subscription.js'",`'./subscription.js?v=${version}'`);await writeFile('dist/app.js',app);

const {buildPages}=await import('./pages.mjs');
await buildPages(data,basePath,version,platformOrigin);

const teamPath='dist/equipo/index.html',cmsURL=platformOrigin.replace(/\/$/,'')+'/cms/';
let teamHTML=await readFile(teamPath,'utf8');
teamHTML=teamHTML.replace(/<section class="page-intro[^"]*">[\s\S]*?<\/section>/,`<section class="page-intro login-intro"><span class="eyebrow">BACK OFFICE</span><h1 class="page-title"><span class="word-mask"><span>Iniciar<br>sesión.</span></span></h1><p>Acceso privado para quienes coordinan La Comarca. La autenticación y los permisos se gestionan en el servidor seguro.</p></section>`);
teamHTML=teamHTML.replace(/<section class="section team-login-section">[\s\S]*?<\/section>/,`<section class="section login-page"><div class="login-shell"><div class="login-copy"><span class="eyebrow">ACCESO DEL EQUIPO</span><h2>Tu espacio de trabajo,<br>en un solo lugar.</h2><p>Entra al back office para organizar agenda, personas, asistencia, materiales y seguimiento. El sitio público permanece separado de la información interna.</p><p class="login-help">¿Es tu primera vez? Pide una invitación al administrador antes de intentar entrar.</p></div><div class="login-panel"><div class="login-mark" aria-hidden="true">↗</div><h3>Back office de La Comarca</h3><p>Continuarás al acceso seguro, donde podrás introducir tu correo y contraseña.</p><a class="button login-button" href="${cmsURL}">Iniciar sesión <span aria-hidden="true">↗</span></a></div></div></section>`);
teamHTML=teamHTML.replaceAll('Acceso del equipo','Iniciar sesión');
await writeFile(teamPath,teamHTML);

async function htmlFiles(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())out.push(...await htmlFiles(path));else if(entry.name.endsWith('.html'))out.push(path);}return out;}
for(const path of await htmlFiles('dist')){let page=await readFile(path,'utf8');const next=page.replaceAll('Acceso del equipo','Iniciar sesión');if(next!==page)await writeFile(path,next);}

await import('./check-site.mjs');
