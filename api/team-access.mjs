import {supabaseIdentity} from './supabase-auth.mjs';
import {supabaseConfig,supabaseRequest} from './supabase.mjs';

const JSON_HEADERS={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const ROLES=['admin','coordinator','editor','catechist','reader'];
const MANAGEABLE_BY_COORDINATOR=new Set(['editor','catechist','reader']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allowedOrigin=(request,env)=>{const origin=request.headers.get('Origin');return origin&&(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)?origin:'';};
const reply=(origin,status,data)=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin'}});
const bearer=request=>{const value=request.headers.get('Authorization')||'';return /^Bearer\s+\S+$/.test(value)&&value.length<20000?value.slice(7):'';};
const clean=(value,max=180)=>typeof value==='string'?value.trim().slice(0,max):'';
async function body(request){const text=await request.text();if(text.length>12000)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413});try{return JSON.parse(text||'{}');}catch{throw Object.assign(Error('Formato no válido.'),{status:400});}}
const moduleFor=me=>(me.modules||[]).find(item=>item.key==='catecismo');
const roleFor=me=>moduleFor(me)?.role||'';
const canManage=me=>['admin','coordinator'].includes(roleFor(me));
const canSetRole=(me,role)=>roleFor(me)==='admin'||MANAGEABLE_BY_COORDINATOR.has(role);

async function authAdmin(env,path,{method='GET',body:payload,redirectTo}={}){
 const {url,key}=supabaseConfig(env);
 const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 if(redirectTo)headers['x-redirect-to']=redirectTo;
 const response=await fetch(`${url}/auth/v1/${path}`,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
 const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{}
 if(!response.ok){const error=new Error(data?.msg||data?.message||data?.error_description||'No pudimos administrar esta cuenta.');error.status=response.status;throw error;}
 return data;
}

async function currentProfile(env,me){
 const rows=await supabaseRequest(env,`rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(me.id)}&select=id,email,display_name,auth_user_id&limit=1`);
 if(!rows[0])throw Object.assign(Error('No encontramos tu perfil.'),{status:403});
 return rows[0];
}
async function catechismWorkspace(env){
 const rows=await supabaseRequest(env,'rest/v1/workspaces?key=eq.catecismo&active=eq.true&select=id,key,name&limit=1');
 if(!rows[0])throw Object.assign(Error('Catecismo no está disponible.'),{status:503});
 return rows[0];
}
async function authUsers(env){
 try{const data=await authAdmin(env,'admin/users?page=1&per_page=1000');return Array.isArray(data)?data:(data.users||[]);}catch{return [];}
}

async function listAccess(env,me){
 const [workspace,profile,users]=await Promise.all([catechismWorkspace(env),currentProfile(env,me),authUsers(env)]);
 const rows=await supabaseRequest(env,`rest/v1/workspace_memberships?workspace_id=eq.${workspace.id}&select=user_id,role,active,scope,profiles(id,email,display_name,auth_user_id)&order=active.desc`);
 const byId=new Map(users.map(user=>[user.id,user]));
 const accounts=rows.map(row=>{const p=row.profiles||{},auth=byId.get(p.auth_user_id)||null;return {profileId:p.id,email:p.email||auth?.email||'',name:p.display_name||auth?.user_metadata?.display_name||'',role:row.role,active:row.active!==false,authUserId:p.auth_user_id||null,invitedAt:auth?.invited_at||null,confirmedAt:auth?.confirmed_at||auth?.email_confirmed_at||null,lastSignInAt:auth?.last_sign_in_at||null,status:!row.active?'inactive':auth?.confirmed_at||auth?.email_confirmed_at?'active':auth?.invited_at?'invited':p.auth_user_id?'pending':'no_account'};});
 return {accounts,current:{profileId:profile.id,role:roleFor(me)},permissions:{canManageAdmins:roleFor(me)==='admin',roles:roleFor(me)==='admin'?ROLES:[...MANAGEABLE_BY_COORDINATOR]}};
}

async function findAuthUser(env,email){const users=await authUsers(env);return users.find(user=>(user.email||'').toLowerCase()===email)||null;}
async function ensureProfile(env,email,name,authUser){
 let rows=await supabaseRequest(env,`rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,display_name,auth_user_id&limit=1`);let profile=rows[0];
 if(profile){const patch={};if(name&&profile.display_name!==name)patch.display_name=name;if(authUser?.id&&profile.auth_user_id!==authUser.id)patch.auth_user_id=authUser.id;if(Object.keys(patch).length){const updated=await supabaseRequest(env,`rest/v1/profiles?id=eq.${profile.id}`,{method:'PATCH',body:patch});profile=updated[0]||{...profile,...patch};}return profile;}
 if(!authUser?.id)throw Object.assign(Error('No pudimos crear la cuenta.'),{status:500});
 rows=await supabaseRequest(env,'rest/v1/profiles',{method:'POST',body:{id:authUser.id,email,display_name:name||'',auth_user_id:authUser.id}});return rows[0];
}
async function linkCatechist(env,profile,email,name){
 let people=await supabaseRequest(env,`rest/v1/catechism_people?email=eq.${encodeURIComponent(email)}&select=id,first_name,last_name,email&limit=1`);let person=people[0];
 if(!person){const parts=(name||email.split('@')[0]).trim().split(/\s+/),first=parts.shift()||email.split('@')[0],last=parts.join(' ');people=await supabaseRequest(env,'rest/v1/catechism_people',{method:'POST',body:{first_name:first,last_name:last,email}});person=people[0];}
 let catechists=await supabaseRequest(env,`rest/v1/catechism_catechists?person_id=eq.${person.id}&select=person_id,profile_id,active&limit=1`);
 if(catechists[0])await supabaseRequest(env,`rest/v1/catechism_catechists?person_id=eq.${person.id}`,{method:'PATCH',body:{profile_id:profile.id,active:true}});
 else await supabaseRequest(env,'rest/v1/catechism_catechists',{method:'POST',body:{person_id:person.id,profile_id:profile.id,active:true}});
}

async function invite(env,me,input){
 if(!canManage(me))throw Object.assign(Error('Tu cuenta no puede administrar accesos.'),{status:403});
 const email=clean(input.email,254).toLowerCase(),name=clean(input.name,180),role=clean(input.role,30);
 if(!/^\S+@\S+\.\S+$/.test(email)||!ROLES.includes(role)||!canSetRole(me,role))throw Object.assign(Error('Revisa el correo y el nivel de acceso.'),{status:400});
 if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'team-access:'+me.id})).success)throw Object.assign(Error('Espera un momento antes de guardar otra vez.'),{status:429});
 const workspace=await catechismWorkspace(env);let authUser=await findAuthUser(env,email),invited=false;
 if(!authUser){const redirectTo=env.TEAM_INVITE_REDIRECT||'https://la-comarca.github.io/equipo/';authUser=await authAdmin(env,`invite?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',body:{email,data:{display_name:name}},redirectTo});authUser=authUser.user||authUser;invited=true;}
 const profile=await ensureProfile(env,email,name,authUser);
 await supabaseRequest(env,'rest/v1/workspace_memberships',{method:'POST',body:{workspace_id:workspace.id,user_id:profile.id,role,scope:{},active:true},headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
 if(role==='catechist')await linkCatechist(env,profile,email,name);
 return {message:invited?'Invitación enviada.':'Acceso actualizado.',invited,profileId:profile.id};
}

async function updateAccess(env,me,profileId,input){
 if(!canManage(me)||!UUID.test(profileId))throw Object.assign(Error('Acceso no válido.'),{status:403});
 if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'team-access:'+me.id})).success)throw Object.assign(Error('Espera un momento antes de guardar otra vez.'),{status:429});
 const workspace=await catechismWorkspace(env),current=await currentProfile(env,me);
 const rows=await supabaseRequest(env,`rest/v1/workspace_memberships?workspace_id=eq.${workspace.id}&user_id=eq.${profileId}&select=user_id,role,active&limit=1`),target=rows[0];
 if(!target)throw Object.assign(Error('No encontramos ese acceso.'),{status:404});
 if(roleFor(me)!=='admin'&&['admin','coordinator'].includes(target.role))throw Object.assign(Error('Sólo un administrador puede cambiar ese acceso.'),{status:403});
 const patch={};if(input.role!==undefined){const role=clean(input.role,30);if(!ROLES.includes(role)||!canSetRole(me,role))throw Object.assign(Error('No puedes asignar ese nivel de acceso.'),{status:403});patch.role=role;}
 if(input.active!==undefined){if(typeof input.active!=='boolean')throw Object.assign(Error('Estado no válido.'),{status:400});if(profileId===current.id&&!input.active)throw Object.assign(Error('No puedes desactivar tu propia cuenta.'),{status:400});patch.active=input.active;}
 if(!Object.keys(patch).length)throw Object.assign(Error('No hay cambios para guardar.'),{status:400});
 await supabaseRequest(env,`rest/v1/workspace_memberships?workspace_id=eq.${workspace.id}&user_id=eq.${profileId}`,{method:'PATCH',body:patch});
 if(patch.role==='catechist'){const profile=(await supabaseRequest(env,`rest/v1/profiles?id=eq.${profileId}&select=id,email,display_name&limit=1`))[0];if(profile)await linkCatechist(env,profile,(profile.email||'').toLowerCase(),profile.display_name||'');}
 return {message:patch.active===false?'Acceso desactivado.':'Acceso actualizado.'};
}

export async function teamAccess(request,env,dependencies={}){
 const origin=allowedOrigin(request,env);
 if(request.method==='OPTIONS'){if(!origin)return new Response(null,{status:403});return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}});}
 if(!origin)return reply('',403,{message:'Origen no permitido.'});const token=bearer(request);if(!token)return reply(origin,401,{message:'Inicia sesión.'});
 let me;try{me=await (dependencies.identity||supabaseIdentity)(env,token);}catch{return reply(origin,401,{message:'Tu sesión terminó. Inicia sesión de nuevo.'});}
 if(!canManage(me))return reply(origin,403,{message:'Tu cuenta no puede administrar accesos.'});
 const path=new URL(request.url).pathname.replace(/\/$/,'');
 try{
  if(path==='/backoffice/v2/access'&&request.method==='GET')return reply(origin,200,await listAccess(env,me));
  if(path==='/backoffice/v2/access/invite'&&request.method==='POST')return reply(origin,201,await invite(env,me,await body(request)));
  const match=path.match(/^\/backoffice\/v2\/access\/([a-f0-9-]{36})$/i);if(match&&request.method==='PATCH')return reply(origin,200,await updateAccess(env,me,match[1],await body(request)));
  return reply(origin,404,{message:'Ruta no disponible.'});
 }catch(error){return reply(origin,error.status||500,{message:error.status?error.message:'No pudimos completar la operación.'});}
}
