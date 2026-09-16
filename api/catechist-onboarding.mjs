import {catechismPlatform} from './catechism-platform.mjs';
import {supabaseConfig,supabaseRequest} from './supabase.mjs';

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean=(value,max=180)=>typeof value==='string'?value.trim().slice(0,max):'';

async function authAdmin(env,path,{method='GET',body,redirectTo}={}){
 const {url,key}=supabaseConfig(env);
 const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 if(redirectTo)headers['x-redirect-to']=redirectTo;
 const response=await fetch(`${url}/auth/v1/${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{}
 if(!response.ok){const error=new Error(data?.msg||data?.message||data?.error_description||'No pudimos enviar la invitación.');error.status=response.status;throw error;}
 return data;
}

async function authUsers(env){
 const data=await authAdmin(env,'admin/users?page=1&per_page=1000');
 return Array.isArray(data)?data:(data.users||[]);
}

async function ensureProfile(env,{email,name,authUser}){
 let rows=await supabaseRequest(env,`rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,display_name,auth_user_id&limit=1`),profile=rows[0];
 if(profile){
  if(profile.auth_user_id&&profile.auth_user_id!==authUser.id)throw Object.assign(Error('Ese correo ya está vinculado a otra cuenta.'),{status:409});
  const patch={};if(name&&profile.display_name!==name)patch.display_name=name;if(!profile.auth_user_id)patch.auth_user_id=authUser.id;
  if(Object.keys(patch).length){const updated=await supabaseRequest(env,`rest/v1/profiles?id=eq.${profile.id}`,{method:'PATCH',body:patch});profile=updated[0]||{...profile,...patch};}
  return profile;
 }
 rows=await supabaseRequest(env,'rest/v1/profiles',{method:'POST',body:{id:authUser.id,email,display_name:name||'',auth_user_id:authUser.id}});
 return rows[0];
}

export async function provisionCatechistAccount(env,{email,name,personId}){
 const normalized=clean(email,254).toLowerCase();if(!EMAIL.test(normalized))throw Object.assign(Error('El catequista necesita un correo válido para recibir acceso.'),{status:400});
 const users=await authUsers(env);let authUser=users.find(user=>(user.email||'').toLowerCase()===normalized)||null,invited=false;
 if(!authUser){
  const redirectTo=env.TEAM_INVITE_REDIRECT||'https://la-comarca.github.io/equipo/';
  const data=await authAdmin(env,`invite?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',body:{email:normalized,data:{display_name:name}},redirectTo});
  authUser=data.user||data;invited=true;
 }
 if(!authUser?.id)throw Error('No pudimos crear la cuenta del catequista.');
 const profile=await ensureProfile(env,{email:normalized,name,authUser});
 const workspace=(await supabaseRequest(env,'rest/v1/workspaces?key=eq.catecismo&active=eq.true&select=id&limit=1'))[0];
 if(!workspace)throw Error('Catecismo no está disponible.');
 await supabaseRequest(env,'rest/v1/workspace_memberships',{method:'POST',body:{workspace_id:workspace.id,user_id:profile.id,role:'catechist',scope:{},active:true},headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
 await supabaseRequest(env,`rest/v1/catechism_catechists?person_id=eq.${encodeURIComponent(personId)}`,{method:'PATCH',body:{profile_id:profile.id,active:true}});
 return {invited,profileId:profile.id,authUserId:authUser.id};
}

function responseLike(source,payload){
 const headers=new Headers(source.headers);headers.set('Content-Type','application/json;charset=utf-8');headers.set('Cache-Control','no-store');
 return new Response(JSON.stringify(payload),{status:source.status,headers});
}

export async function catechistOnboarding(request,env,dependencies={}){
 const input=await request.clone().json().catch(()=>({}));
 const platform=dependencies.platform||catechismPlatform,provision=dependencies.provision||provisionCatechistAccount;
 const created=await platform(request,env);if(created.status!==201)return created;
 const payload=await created.clone().json().catch(()=>({message:'Catequista creado.'}));
 const email=clean(input.email,254).toLowerCase();if(!email)return created;
 const name=[clean(input.first_name,120),clean(input.last_name,180)].filter(Boolean).join(' ');
 try{
  const onboarding=await provision(env,{email,name,personId:payload.person?.id});
  return responseLike(created,{...payload,onboarding:{status:onboarding.invited?'invited':'linked'},message:onboarding.invited?'Catequista creado. Invitación enviada por correo.':'Catequista creado. Su cuenta existente quedó vinculada.'});
 }catch(error){
  return responseLike(created,{...payload,onboarding:{status:'failed'},message:'Catequista creado, pero no pudimos enviar el correo de acceso. Puedes reenviarlo desde Accesos del equipo.'});
 }
}
