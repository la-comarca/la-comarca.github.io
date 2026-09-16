import {betterAuth} from 'better-auth';
import {syncSupabaseAccess} from './supabase.mjs';

export function authOptions(env) {
 const fallback='https://la-comarca-formularios.la-comarca.workers.dev',canonical=env.CMS_ORIGIN||fallback;
 return {
  appName:'La Comarca Formularios',baseURL:canonical,basePath:'/cms/auth',
  secret:env.CMS_AUTH_SECRET,database:env.CMS_DB,
  trustedOrigins:[...new Set([canonical,fallback])],
  emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:false},
  session:{expiresIn:60*60*24,updateAge:60*60,cookieCache:{enabled:false}},
  advanced:{useSecureCookies:!(env.CMS_ORIGIN||'').startsWith('http://localhost'),cookiePrefix:'comarca',defaultCookieAttributes:{httpOnly:true,sameSite:'lax'}},
  rateLimit:{enabled:true,storage:'database',window:60,max:20},
  logger:{disabled:true},
 };
}
export const createAuth=env=>betterAuth(authOptions(env));
export async function cmsIdentity(request,env,auth=createAuth(env)) {
 const session=await auth.api.getSession({headers:request.headers});
 if(!session)throw Error('session');
 const email=session.user.email.toLowerCase();
 let user;
 if(email===env.TEAM_ADMIN_ACCOUNT?.toLowerCase())user={...session.user,email,role:'admin',modules:['agenda','materiales','catecismo','traslados','inscripciones']};
 else {const grant=await env.CMS_DB.prepare('SELECT role, modules FROM cms_grants WHERE email = ? AND active = 1').bind(email).first();if(!grant)throw Error('permission');user={...session.user,email,role:grant.role,modules:JSON.parse(grant.modules)};}
 try{user.supabase=await syncSupabaseAccess(env,{email,displayName:user.name,role:user.role,modules:user.modules});}catch{user.supabase={status:'unavailable'};}
 return user;
}
const capabilities={admin:['read','write'],coordinator:['read','write'],editor:['read','write'],catechist:['read','write'],reader:['read']};
export const can=(user,module,write=false)=>{
 const membership=user.supabase?.memberships?.find(item=>item.workspace===module);
 if(user.supabase?.status==='active')return !!membership&&capabilities[membership.role]?.includes(write?'write':'read');
 return user.role==='admin'||user.modules.includes(module)&&(!write||user.role==='editor');
};
export async function digest(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');}
