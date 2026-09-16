// Supabase Auth bridge for the static GitHub Pages team UI.
// Passwords are sent only to this Worker endpoint and immediately forwarded to Supabase Auth.
// Privileged Supabase keys never leave the Worker.
import {supabaseRequest,supabaseConfig} from './supabase.mjs';

const JSON_HEADERS={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(status,data,origin)=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
const allowedOrigin=(request,env)=>{const origin=request.headers.get('Origin');return origin&&(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)?origin:'';};
async function body(request){const text=await request.text();if(text.length>12000)throw Error('body');return JSON.parse(text||'{}');}
const bearer=request=>{const value=request.headers.get('Authorization')||'';return /^Bearer\s+\S+$/.test(value)?value.slice(7):'';};

async function authFetch(env,path,{method='GET',body:payload,token}={}){
 const {url,key}=supabaseConfig(env);
 const headers={apikey:key,'Content-Type':'application/json'};
 if(token)headers.Authorization=`Bearer ${token}`;
 return fetch(`${url}/auth/v1/${path}`,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
}

async function provisionFirstAdministrator(env,user,email){
 const existing=await supabaseRequest(env,'rest/v1/workspace_memberships?active=eq.true&select=user_id&limit=1');
 if(existing.length)return null;
 const created=await supabaseRequest(env,'rest/v1/profiles',{method:'POST',body:{id:user.id,email,auth_user_id:user.id,display_name:user.user_metadata?.display_name||''}});
 const profile=created?.[0];
 if(!profile?.id)throw Error('permission');
 const workspaces=await supabaseRequest(env,'rest/v1/workspaces?active=eq.true&select=id,key,name,description,active');
 if(!workspaces.length)throw Error('permission');
 const rows=workspaces.map(workspace=>({workspace_id:workspace.id,user_id:profile.id,role:'admin',scope:{},active:true}));
 await supabaseRequest(env,'rest/v1/workspace_memberships',{method:'POST',body:rows});
 return {profile,modules:workspaces.map(workspace=>({key:workspace.key,name:workspace.name||workspace.key,description:workspace.description||'',role:'admin',scope:{}}))};
}

async function identity(env,accessToken){
 const response=await authFetch(env,'user',{token:accessToken});
 if(!response.ok)throw Error('session');
 const user=await response.json();
 if(!user?.id||!user?.email)throw Error('session');
 const email=user.email.toLowerCase();
 let profiles=await supabaseRequest(env,`rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id,email,display_name,auth_user_id&limit=1`);
 let profile=profiles[0];
 if(!profile){
  profiles=await supabaseRequest(env,`rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,display_name,auth_user_id&limit=1`);
  profile=profiles[0];
  if(profile?.auth_user_id&&profile.auth_user_id!==user.id)throw Error('permission');
  if(profile&&!profile.auth_user_id){
   const updated=await supabaseRequest(env,`rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,{method:'PATCH',body:{auth_user_id:user.id}});
   profile=updated?.[0]||{...profile,auth_user_id:user.id};
  }
 }
 if(!profile){
  const bootstrap=await provisionFirstAdministrator(env,user,email);
  if(bootstrap)return {id:user.id,email,name:bootstrap.profile.display_name||user.user_metadata?.display_name||email.split('@')[0],modules:bootstrap.modules};
  throw Error('permission');
 }
 if(profile.auth_user_id!==user.id)throw Error('permission');
 let memberships=await supabaseRequest(env,`rest/v1/workspace_memberships?user_id=eq.${encodeURIComponent(profile.id)}&active=eq.true&select=role,scope,workspaces(key,name,description,active)`);
 let active=memberships.filter(item=>item.workspaces?.active!==false&&item.workspaces?.key).map(item=>({key:item.workspaces.key,name:item.workspaces.name||item.workspaces.key,description:item.workspaces.description||'',role:item.role,scope:item.scope||{}}));
 if(!active.length){
  const existing=await supabaseRequest(env,'rest/v1/workspace_memberships?active=eq.true&select=user_id&limit=1');
  if(!existing.length){
   const workspaces=await supabaseRequest(env,'rest/v1/workspaces?active=eq.true&select=id,key,name,description,active');
   const rows=workspaces.map(workspace=>({workspace_id:workspace.id,user_id:profile.id,role:'admin',scope:{},active:true}));
   if(rows.length)await supabaseRequest(env,'rest/v1/workspace_memberships',{method:'POST',body:rows});
   active=workspaces.map(workspace=>({key:workspace.key,name:workspace.name||workspace.key,description:workspace.description||'',role:'admin',scope:{}}));
  }
 }
 if(!active.length)throw Error('permission');
 return {id:user.id,email,name:profile.display_name||user.user_metadata?.display_name||email.split('@')[0],modules:active};
}

export async function supabaseAuth(request,env){
 const origin=allowedOrigin(request,env);
 if(request.method==='OPTIONS'){
  if(!origin)return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}});
 }
 if(!origin)return reply(403,{message:'Origen no permitido.'},'');
 const path=new URL(request.url).pathname.replace(/\/$/,'');
 try{
  if(path==='/auth/token'&&request.method==='POST'){
   if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'supabase-auth:'+request.headers.get('CF-Connecting-IP')})).success)return reply(429,{message:'Espera un minuto antes de intentarlo de nuevo.'},origin);
   const v=await body(request);if(typeof v.email!=='string'||typeof v.password!=='string'||v.email.length>254||v.password.length<1||v.password.length>128||!/^\S+@\S+\.\S+$/.test(v.email))return reply(400,{message:'Revisa el correo y la contraseña.'},origin);
   const response=await authFetch(env,'token?grant_type=password',{method:'POST',body:{email:v.email.trim().toLowerCase(),password:v.password}});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.access_token)return reply(401,{message:'No pudimos iniciar sesión. Revisa tus datos o confirma que tu cuenta esté activa.'},origin);
   try{const me=await identity(env,data.access_token);return reply(200,{access_token:data.access_token,refresh_token:data.refresh_token,expires_in:data.expires_in,token_type:data.token_type,user:me},origin);}catch(error){return reply(error.message==='permission'?403:401,{message:error.message==='permission'?'Tu cuenta existe, pero todavía no tiene acceso al equipo.':'No pudimos validar la sesión.'},origin);}
  }
  if(path==='/auth/refresh'&&request.method==='POST'){
   const v=await body(request);if(typeof v.refresh_token!=='string'||v.refresh_token.length>4096)return reply(400,{message:'Sesión no válida.'},origin);
   const response=await authFetch(env,'token?grant_type=refresh_token',{method:'POST',body:{refresh_token:v.refresh_token}});const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.access_token)return reply(401,{message:'Tu sesión terminó. Inicia sesión de nuevo.'},origin);
   try{const me=await identity(env,data.access_token);return reply(200,{access_token:data.access_token,refresh_token:data.refresh_token||v.refresh_token,expires_in:data.expires_in,token_type:data.token_type,user:me},origin);}catch(error){return reply(error.message==='permission'?403:401,{message:error.message==='permission'?'Tu cuenta ya no tiene acceso al equipo.':'Tu sesión terminó. Inicia sesión de nuevo.'},origin);}
  }
  if(path==='/auth/me'&&request.method==='GET'){
   const token=bearer(request);if(!token)return reply(401,{message:'Inicia sesión.'},origin);
   try{return reply(200,{user:await identity(env,token)},origin);}catch(error){return reply(error.message==='permission'?403:401,{message:error.message==='permission'?'Tu cuenta no tiene acceso al equipo.':'La sesión ya no es válida.'},origin);}
  }
  if(path==='/auth/logout'&&request.method==='POST'){
   const token=bearer(request);if(token)await authFetch(env,'logout',{method:'POST',token}).catch(()=>{});
   return reply(200,{ok:true},origin);
  }
  return reply(404,{message:'Ruta no disponible.'},origin);
 }catch{return reply(500,{message:'No pudimos completar la solicitud.'},origin);}
}
