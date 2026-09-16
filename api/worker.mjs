import {belongs,plain as notionText,notion} from './cms-records.mjs';
import {publicMaterials} from './public-materials.mjs';
import {cms} from './cms.mjs';
import {team} from './team.mjs';
import {publicAgenda,cachedAgenda} from './public-agenda.mjs';
import {supabaseAuth} from './supabase-auth.mjs';
import {backoffice} from './backoffice.mjs';
import {catechismPlatform} from './catechism-platform.mjs';
import {catechismOps} from './catechism-ops.mjs';
import {catechismSetup} from './catechism-setup.mjs';
import {teamAccess} from './team-access.mjs';
import {catechistOnboarding} from './catechist-onboarding.mjs';
export const activities=['Retiro mensual · 1 octubre 2026','Retiro semestral · 16–18 octubre 2026','Círculos','Catecismo','Despensas y visitas','Hikes y caminatas','Labor social','Aportaciones y donaciones','Proponer una actividad','Otras actividades'];
export function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Revisa los datos del formulario.');
 const text=(key,max,required=false)=>{const v=input[key];if(v==null&&!required)return '';if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Revisa los datos del formulario.');return v.trim();};
 const name=text('name',120,true),email=text('email',254,true),activity=text('activity',150,true),message=text('message',1800),phone=text('phone',30),token=text('token',2048,true);
 const eventId=text('eventId',36);if(eventId&&!/^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(eventId))throw Error('Actividad no válida.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||(!eventId&&!activities.includes(activity))||phone&&!/^[+\d\s()-]{7,30}$/.test(phone))throw Error('Revisa el correo, la actividad y el teléfono.');
 if(input.privacy!==true)throw Error('Confirma el uso de tus datos para gestionar la solicitud.');
 for(const k of ['emailOptIn','whatsappOptIn'])if(input[k]!==undefined&&typeof input[k]!=='boolean')throw Error('Revisa tus preferencias de avisos.');
 if(input.whatsappOptIn&&!phone)throw Error('Escribe tu WhatsApp o desmarca los avisos por WhatsApp.');
 if(input.website)throw Error('No se pudo validar la solicitud.');
 return {name,email,activity,eventId,message,phone,token,emailOptIn:input.emailOptIn===true,whatsappOptIn:input.whatsappOptIn===true};
}
export function notionPayload(v,dataSourceId,verifiedEventId){return {parent:{type:'data_source_id',data_source_id:dataSourceId},properties:{...(verifiedEventId?{Agenda:{relation:[{id:verifiedEventId}]}}:{}),'Nombre y apellido':{title:[{text:{content:v.name}}]},Correo:{email:v.email},'Actividad solicitada':{select:{name:activities.slice(0,4).includes(v.activity)?v.activity:'Otras actividades'}},Estado:{select:{name:'Solicitada'}},WhatsApp:{phone_number:v.phone||null},'Quiero recibir novedades por correo':{checkbox:v.emailOptIn},'Acepto avisos de mi actividad por WhatsApp':{checkbox:v.whatsappOptIn},Fecha:{date:{start:new Date().toISOString()}}},children:[{object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:`Solicitud desde la web · ${v.activity}\nUso de datos para coordinar la solicitud: aceptado.\n${v.message||'Sin mensaje adicional.'}`}}]}}]};}
async function readBounded(request){const reader=request.body?.getReader();if(!reader)throw Error('empty');let count=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>12000){await reader.cancel();throw Error('large');}chunks.push(value);}const bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function handle(request,env,fetcher=fetch){
 const path=new URL(request.url).pathname;
 if(path==='/public/materials')return publicMaterials(request,env,fetcher,typeof caches==='undefined'?undefined:caches.default);
 if(path==='/auth'||path.startsWith('/auth/'))return supabaseAuth(request,env);
 if(path==='/backoffice/setup'||path.startsWith('/backoffice/setup/'))return catechismSetup(request,env);
 if(path==='/backoffice/v2/access'||path.startsWith('/backoffice/v2/access/'))return teamAccess(request,env);
 if(path==='/backoffice/v2/catechists'&&request.method==='POST')return catechistOnboarding(request,env);
 if(path.startsWith('/backoffice/ops/'))return catechismOps(request,env);
 if(path.startsWith('/backoffice/v2/'))return catechismPlatform(request,env);
 if(path.startsWith('/backoffice/api/'))return backoffice(request,env,fetcher);
 if(path==='/cms'||path.startsWith('/cms/')||path==='/equipo/activar')return cms(request,env,fetcher);
 if(path==='/equipo'||path==='/equipo/'||path==='/equipo/catecismo'||path.startsWith('/equipo/catecismo/'))return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});
 if(path.startsWith('/equipo/'))return team(request,env,fetcher);
 if(['/public/agenda','/calendario.ics'].includes(path))return publicAgenda(request,env,fetcher);
 if(['GET','HEAD'].includes(request.method)&&path!=='/solicitudes'&&env.ASSETS)return env.ASSETS.fetch(request);
 const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',');
 const headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 const reply=(status,message)=>new Response(JSON.stringify({ok:status===201,message}),{status,headers});
 if(!origin||!allowed.includes(origin))return reply(403,'Origen no permitido.');
 headers['Access-Control-Allow-Origin']=origin;
 if(path!=='/solicitudes')return reply(404,'Ruta no disponible.');
 if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';return new Response(null,{status:204,headers});}
 if(request.method!=='POST')return reply(405,'Método no disponible.');
 if(!env.NOTION_TOKEN||!env.TURNSTILE_SECRET_KEY||!env.FORM_LIMIT)return reply(503,'El formulario está en preparación. Inténtalo más tarde.');
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply(415,'Formato no válido.');
 let v;try{v=validate(await readBounded(request));}catch(e){return reply(400,['large','empty'].includes(e.message)?'Revisa los datos del formulario.':e instanceof SyntaxError?'Formato no válido.':e.message);}
 try{
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';if(!(await env.FORM_LIMIT.limit({key:ip})).success)return reply(429,'Espera un minuto antes de volver a intentarlo.');
 const challenge=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:v.token,remoteip:ip}),signal:AbortSignal.timeout(10000)});
 if(!challenge.ok)return reply(503,'No pudimos validar la solicitud. Inténtalo más tarde.');const result=await challenge.json();
 if(!result.success||result.action!=='inscripcion'||result.hostname!==new URL(origin).hostname)return reply(400,'Repite la verificación del formulario.');
 let verifiedEventId;
 if(v.eventId){
  if(!env.NOTION_AGENDA_ID)return reply(503,'La agenda todavía no está conectada.');
  const event=await notion(env,'pages/'+v.eventId,{},fetcher),p=event.properties||{};
  if(!belongs(event,env.NOTION_AGENDA_ID)||p['Publicar en web']?.checkbox!==true||!['Confirmada','Tentativa'].includes(p.Estado?.select?.name))return reply(400,'Esta actividad no está disponible para solicitudes.');
  const deadline=p['Cierre de inscripción']?.date?.start;if(deadline&&Date.parse(deadline)<Date.now())return reply(400,'El plazo de esta actividad ya terminó. Contacta al equipo.');
  verifiedEventId=event.id;v.activity=notionText(p.Name?.title).slice(0,150);
 }
 const saved=await fetcher('https://api.notion.com/v1/pages',{method:'POST',headers:{Authorization:`Bearer ${env.NOTION_TOKEN}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:JSON.stringify(notionPayload(v,env.NOTION_DATA_SOURCE_ID,verifiedEventId)),signal:AbortSignal.timeout(15000)});
 if(!saved.ok)return reply(502,'No pudimos confirmar el registro. Consulta al equipo antes de enviar otra solicitud.');
 return reply(201,'Solicitud recibida. El equipo revisará los detalles contigo; tu lugar aún no está confirmado.');
 }catch{return reply(502,'No pudimos confirmar el registro. Consulta al equipo antes de enviar otra solicitud.');}
}
export default {fetch(request,env){if(['/public/agenda','/calendario.ics'].includes(new URL(request.url).pathname))return publicAgenda(request,env,fetch,()=>cachedAgenda(request,env));return handle(request,env);}};
