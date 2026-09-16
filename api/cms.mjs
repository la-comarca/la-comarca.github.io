import {recordUpdate,recentUpdates} from './cms-updates.mjs';
import {uploadFile} from './cms-files.mjs';
import {createAuth,cmsIdentity,can,digest} from './cms-auth.mjs';
import {identity,team} from './team.mjs';
import {cmsHTML,cmsJS} from './cms-ui.mjs';
import {modules,permissionKeys,modulePermission,sourceId,enabled,records,notion,plain,belongs,RecordError} from './cms-records.mjs';
import {supabaseRequest} from './supabase.mjs';

const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' https://la-comarca.github.io; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const reply=(data,status=200,type='application/json')=>new Response(type==='application/json'?JSON.stringify(data):data,{status,headers:{...security,'Content-Type':type+';charset=utf-8'}});
export async function jsonBody(request){let parts=[],length=0;const reader=request.body?.getReader();if(!reader)throw Error('body');for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>12000){await reader.cancel();throw Error('body');}parts.push(value);}return JSON.parse(await new Blob(parts).text());}
export const sameOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin&&request.headers.get('X-Comarca-Request')==='cms'&&request.headers.get('Content-Type')?.startsWith('application/json');
export function invitationInput(v){if(typeof v.email!=='string'||v.email.length>254||!/^\S+@\S+\.\S+$/.test(v.email)||!['reader','editor'].includes(v.role)||!Array.isArray(v.modules)||!v.modules.length||v.modules.length>permissionKeys.length||v.modules.some(m=>!permissionKeys.includes(m))||new Set(v.modules).size!==v.modules.length)throw Error('invite');return {email:v.email.trim().toLowerCase(),role:v.role,modules:v.modules};}

export async function cms(request,env,fetcher=fetch,dependencies={}) {
 const path=new URL(request.url).pathname.replace(/\/$/,''),method=request.method;
 if(method==='GET'&&(path==='/cms'||path==='/equipo/activar'))return reply(cmsHTML.replaceAll('Equipo · La Comarca','La Comarca Formularios').replaceAll('LA COMARCA / EQUIPO','LA COMARCA / FORMULARIOS'),200,'text/html');
 if(method==='GET'&&path==='/cms/app.js')return reply(cmsJS,200,'text/javascript');
 if(!env.CMS_DB||!env.CMS_AUTH_SECRET)return reply({message:'El acceso propio está terminando de configurarse.'},503);
 try {
  const auth=dependencies.auth||createAuth(env);
  if(path.startsWith('/cms/auth/')){
   // Public signup and account-changing endpoints are deliberately not mounted.
   const allowed={'/cms/auth/sign-in/email':'POST','/cms/auth/sign-out':'POST','/cms/auth/get-session':'GET','/cms/auth/change-password':'POST'};
   if(allowed[path]!==method)return reply({message:'Ruta no disponible.'},404);
   if(method==='POST'&&!sameOrigin(request))return reply({message:'Solicitud no permitida.'},403);
   if(method==='POST'){
    if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'cms-auth:'+request.headers.get('CF-Connecting-IP')})).success)return reply({message:'Espera un minuto antes de intentarlo de nuevo.'},429);
    const body=await jsonBody(request);request=new Request(request.url,{method,headers:request.headers,body:JSON.stringify(body)});
   }
   const response=await auth.handler(request),headers=new Headers(response.headers);for(const [key,value] of Object.entries(security))headers.set(key,value);
   return new Response(response.body,{status:response.status,headers});
  }
  const fileRoute=path.match(/^\/cms\/api\/files\/([a-z]+)\/([a-f0-9-]{36})$/i);
  const fileOrigin=fileRoute&&method==='POST'&&request.headers.get('Origin')===new URL(request.url).origin&&request.headers.get('X-Comarca-Request')==='cms'&&request.headers.get('Content-Type')?.startsWith('multipart/form-data;');
  if(['POST','PATCH'].includes(method)&&!sameOrigin(request)&&!fileOrigin)return reply({message:'Solicitud no permitida.'},403);
  if(['POST','PATCH'].includes(method)&&(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'cms-write:'+request.headers.get('CF-Connecting-IP')})).success))return reply({message:'Espera un minuto antes de guardar otra vez.'},429);
  if(path==='/equipo/activar'&&method==='POST'){
   let admin;try{admin=await (dependencies.bootstrapIdentity||identity)(request,env);}catch{return reply({message:'Verifica tu cuenta de administrador para activar el acceso.'},403);}
   const v=await jsonBody(request);
   if(typeof v.password!=='string'||v.password.length<12||v.password.length>128)return reply({message:'Usa una contraseña de entre 12 y 128 caracteres.'},400);
   // Cloudflare Access has already verified the sole administrator's identity.
   // Let that proof safely recover a forgotten first password without exposing
   // account existence or accepting a client-provided email address.
   const context=await auth.$context,existing=await context.internalAdapter.findUserByEmail(admin.email);
   if(existing?.user){
    await context.internalAdapter.updatePassword(existing.user.id,await context.password.hash(v.password));
    await context.internalAdapter.deleteUserSessions(existing.user.id);
    return reply({message:'Acceso actualizado. Entra ahora con tu correo y la nueva contraseña.'});
   }
   await auth.api.signUpEmail({body:{email:admin.email,name:'Administrador',password:v.password}});
   return reply({message:'Cuenta creada. Ya puedes entrar con tu correo y contraseña en el nuevo panel.'},201);
  }
  if(path==='/cms/api/accept-invitation'&&method==='POST'){
   const v=await jsonBody(request);if(typeof v.token!=='string'||!/^[a-f0-9]{64}$/.test(v.token)||typeof v.name!=='string'||!v.name.trim()||v.name.length>100)return reply({message:'Invitación no válida.'},400);
   const invite=await env.CMS_DB.prepare('UPDATE cms_invitations SET used = 1 WHERE hash = ? AND used = 0 AND expires > ? RETURNING email, role, modules').bind(await digest(v.token),Date.now()).first();
   if(!invite)return reply({message:'La invitación venció o ya fue utilizada. Pide una nueva al administrador.'},400);
   await auth.api.signUpEmail({body:{email:invite.email,name:v.name.trim(),password:v.password}});
   await env.CMS_DB.prepare('INSERT INTO cms_grants(email,role,modules,active) VALUES(?,?,?,1) ON CONFLICT(email) DO UPDATE SET role=excluded.role, modules=excluded.modules, active=1').bind(invite.email,invite.role,invite.modules).run();
   return reply({message:'Cuenta activada. Entra con tu correo y contraseña.'},201);
  }
  let user;try{user=await (dependencies.authenticate||cmsIdentity)(request,env,auth);}catch{return reply({message:'Inicia sesión con una cuenta autorizada.'},401);}
  if(path==='/cms/api/me'&&method==='GET')return reply({name:user.name,email:user.email,role:user.role,modules:user.modules,canUpdate:env.CMS_AGENDA_EDIT_ENABLED==='true',supabase:user.supabase?.status==='active'?{status:'active',profileId:user.supabase.profileId,memberships:user.supabase.memberships}: {status:user.supabase?.status||'disabled'}});
  if(path==='/cms/api/supabase-status'&&method==='GET'){
   if(user.role!=='admin')return reply({message:'Acceso restringido.'},403);
   if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return reply({configured:false,healthy:false,profile:user.supabase?.status||'disabled'});
   try{const workspaces=await supabaseRequest(env,'rest/v1/workspaces?select=key&active=eq.true');return reply({configured:true,healthy:true,profile:user.supabase?.status||'disabled',workspaceCount:workspaces.length,memberships:user.supabase?.memberships?.length||0});}
   catch{return reply({configured:true,healthy:false});}
  }
  if(fileRoute&&method==='POST'){const result=await uploadFile(request,env,user,fileRoute[1],fileRoute[2],fetcher);await recordUpdate(env,user,fileRoute[1],result.record.id,'updated',{source:'cms',operation:'file_upload'});return reply(result);}
  if(path==='/cms/api/updates'&&method==='GET')return reply({updates:await recentUpdates(env,user)});
  if(path==='/cms/api/modules'&&method==='GET')return reply({modules:Object.entries(modules).filter(([,m])=>can(user,m.permission)).map(([key,m])=>({key,label:m.label,permission:m.permission,enabled:enabled(key,env),canWrite:can(user,m.permission,true),fields:m.fields.map(f=>({...f,readOnly:!!f.readOnly||!!f.target&&!can(user,modulePermission(f.target))}))}))});
  if(path==='/cms/api/connections'&&method==='GET'){
   if(user.role!=='admin')return reply({message:'Acceso restringido.'},403);
   const connections=[];for(const [key,m] of Object.entries(modules)){try{const source=await notion(env,'data_sources/'+m.id,{},fetcher);const missing=m.fields.filter(f=>!source.properties?.[f.name]);connections.push({key,label:m.label,ok:!missing.length,enabled:enabled(key,env),message:missing.length?'Hay campos que cambiaron en Notion.':'Conexión de lectura verificada.'});}catch(e){connections.push({key,label:m.label,ok:false,enabled:enabled(key,env),message:e.message});}}
   return reply({connections});
  }
  const lookup=path.match(/^\/cms\/api\/lookup\/([a-z]+)$/);
  if(lookup&&method==='GET'){
   const key=lookup[1],permission=modulePermission(key);if(!permission||!can(user,permission))return reply({message:'Acceso restringido.'},403);
   if(key!=='agenda'&&!enabled(key,env))return reply({message:'La base relacionada todavía no está conectada.'},503);
   const url=new URL(request.url),cursor=url.searchParams.get('cursor'),q=url.searchParams.get('q')||'';if(q.length>150||cursor&&!/^[a-f0-9-]{36}$/i.test(cursor))return reply({message:'Consulta no válida.'},400);
   const title=key==='agenda'?'Name':modules[key].fields.find(f=>f.type==='title').name;
   const data=await notion(env,'data_sources/'+sourceId(key,env)+'/query',{method:'POST',body:JSON.stringify({page_size:50,...(cursor?{start_cursor:cursor}:{}),...(q?{filter:{property:title,title:{contains:q}}}:{})})},fetcher);
   return reply({options:data.results.map(p=>({id:p.id,label:plain(p.properties?.[title]?.title)})),nextCursor:data.has_more?data.next_cursor:null});
  }
  const related=path.match(/^\/cms\/api\/related\/([a-z]+)\/([a-f0-9-]{36})$/i);
  if(related&&method==='GET'){
   const key=related[1],id=related[2],definition=modules[key],permission=modulePermission(key);
   if(!permission||!can(user,permission)||key!=='agenda'&&!definition)return reply({message:'Acceso restringido.'},403);
   if(key!=='agenda'&&!enabled(key,env))return reply({message:'Esta sección está pendiente de conectar.'},503);
   const parent=await notion(env,'pages/'+id,{},fetcher);if(!belongs(parent,sourceId(key,env)))return reply({message:'Registro no disponible.'},404);
   const groups=[];
   for(const [childKey,child] of Object.entries(modules)){
    if(!enabled(childKey,env)||!can(user,child.permission))continue;
    const relations=child.fields.filter(f=>f.type==='relation'&&f.target===key);if(!relations.length)continue;
    const filter=relations.length===1?{property:relations[0].name,relation:{contains:id}}:{or:relations.map(f=>({property:f.name,relation:{contains:id}}))};
    const data=await notion(env,'data_sources/'+child.id+'/query',{method:'POST',body:JSON.stringify({page_size:20,filter})},fetcher);
    const title=child.fields.find(f=>f.type==='title');
    groups.push({key:childKey,label:child.label,records:data.results.map(page=>({id:page.id,label:plain(page.properties?.[title.name]?.title),version:page.last_edited_time}))});
   }
   return reply({related:groups});
  }
  const recordRoute=path.match(/^\/cms\/api\/records\/([a-z]+)(?:\/([a-f0-9-]{36}))?$/i);
  if(recordRoute){const result=await records(request,env,user,recordRoute[1],recordRoute[2],method==='GET'?null:await jsonBody(request),fetcher);if(method!=='GET')await recordUpdate(env,user,recordRoute[1],result.record.id,method==='POST'?'created':'updated',{source:'cms',operation:method.toLowerCase()});return reply(result,method==='POST'?201:200);}
  if(path==='/cms/api/invitations'&&method==='POST'){
   if(user.role!=='admin')return reply({message:'Solo administración puede invitar.'},403);
   let v;try{v=invitationInput(await jsonBody(request));}catch{return reply({message:'Revisa el correo y los permisos.'},400);}
   if(v.email===env.TEAM_ADMIN_ACCOUNT?.toLowerCase())return reply({message:'La cuenta administradora ya está reservada.'},400);
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
   await env.CMS_DB.batch([
    env.CMS_DB.prepare('UPDATE cms_invitations SET used=1 WHERE email=?').bind(v.email),
    env.CMS_DB.prepare('INSERT INTO cms_invitations(hash,email,role,modules,expires,used) VALUES(?,?,?,?,?,0)').bind(await digest(token),v.email,v.role,JSON.stringify(v.modules),Date.now()+48*60*60*1000)
   ]);
   return reply({url:new URL('/cms/#invitacion='+token,request.url).href,message:'Enlace privado válido durante 48 horas. Compártelo únicamente con la persona invitada.'},201);
  }
  if(path==='/cms/api/users'&&method==='GET'){
   if(user.role!=='admin')return reply({message:'Acceso restringido.'},403);
   const {results}=await env.CMS_DB.prepare('SELECT email, role, modules, active FROM cms_grants ORDER BY email LIMIT 100').all();return reply({users:results});
  }
  if(path==='/cms/api/users'&&method==='POST'){
   if(user.role!=='admin')return reply({message:'Acceso restringido.'},403);
   const v=await jsonBody(request);if(typeof v.email!=='string'||v.email===env.TEAM_ADMIN_ACCOUNT?.toLowerCase())return reply({message:'Cuenta no válida.'},400);
   await env.CMS_DB.batch([env.CMS_DB.prepare('UPDATE cms_grants SET active=0 WHERE email=?').bind(v.email.toLowerCase()),env.CMS_DB.prepare('UPDATE cms_invitations SET used=1 WHERE email=?').bind(v.email.toLowerCase())]);
   return reply({message:'Acceso revocado.'});
  }
  if(path==='/cms/api/agenda'||/^\/cms\/api\/agenda\/[a-f0-9-]{36}$/.test(path)){
   if(method==='PATCH'&&env.CMS_AGENDA_EDIT_ENABLED!=='true')return reply({message:'Falta habilitar la actualización de Agenda en Notion. Puedes crear borradores mientras tanto.'},503);
   if(!can(user,'agenda',method!=='GET'))return reply({message:'Tu cuenta no puede realizar esta acción.'},403);
   const url=new URL(request.url);url.pathname=url.pathname.replace('/cms/api','/equipo/api');
   const headers=new Headers(request.headers);headers.set('X-Comarca-Request','team');
   const response=await team(new Request(url,new Request(request,{headers})),env,fetcher,async()=>user);if(response.ok&&method!=='GET'){const saved=await response.clone().json();await recordUpdate(env,user,'agenda',saved.id,method==='POST'?'created':'updated',{source:'cms',operation:method.toLowerCase()});}return response;
  }
  return reply({message:'Ruta no disponible.'},404);
 }catch(error){if(error instanceof RecordError)return reply({message:error.message},error.status);return reply({message:'No se pudo completar la operación. Si intentabas crear una cuenta, comprueba tu invitación o pide ayuda al administrador.'},400);}
}
