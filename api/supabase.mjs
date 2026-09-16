/* Server-only Supabase boundary. Never expose privileged keys to the browser. */
export function supabaseConfig(env){
 const url=typeof env.SUPABASE_URL==='string'?env.SUPABASE_URL.replace(/\/$/,''):'';
 if(!url||!/^https:\/\/[^/]+$/.test(url))throw Error('SUPABASE_URL is not configured');
 const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw Error('Supabase server key is not configured');
 return {url,key};
}

export async function supabaseRequest(env,path,{method='GET',body,signal,headers:extraHeaders={}}={}){
 const {url,key}=supabaseConfig(env);
 const response=await fetch(`${url}/${path.replace(/^\//,'')}`,{
  method,
  headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...extraHeaders},
  body:body===undefined?undefined:JSON.stringify(body),signal
 });
 const text=await response.text();
 let data=null;try{data=text?JSON.parse(text):null;}catch{throw Error('Supabase returned invalid JSON');}
 if(!response.ok){const error=new Error('Supabase request failed');error.status=response.status;throw error;}
 return data;
}

const moduleWorkspace={agenda:'agenda',materiales:'materiales',catecismo:'catecismo',traslados:'traslados',inscripciones:'inscripciones'};
const roleFor=(role)=>role==='admin'?'admin':role==='editor'?'editor':'reader';

export async function syncSupabaseAccess(env,{email,displayName,role,modules}){
 if(!env.SUPABASE_PROFILE_SYNC_ENABLED||env.SUPABASE_PROFILE_SYNC_ENABLED!=='true')return {status:'disabled'};
 const normalizedEmail=email.toLowerCase();
 let profiles=await supabaseRequest(env,`rest/v1/profiles?email=eq.${encodeURIComponent(normalizedEmail)}&select=id,email,display_name&limit=1`);
 let profile=profiles[0];
 if(!profile){
  const created=await supabaseRequest(env,'rest/v1/profiles',{method:'POST',body:{email:normalizedEmail,display_name:displayName||''}});
  profile=created[0];
 }
 const workspaces=await supabaseRequest(env,'rest/v1/workspaces?select=id,key&active=eq.true');
 const allowed=new Set(role==='admin'?workspaces.map(w=>w.key):modules.filter(key=>moduleWorkspace[key]).map(key=>moduleWorkspace[key]));
 const memberships=workspaces.filter(w=>allowed.has(w.key)).map(workspace=>({workspace_id:workspace.id,user_id:profile.id,role:roleFor(role),scope:{},active:true}));
 if(memberships.length)await supabaseRequest(env,'rest/v1/workspace_memberships',{method:'POST',body:memberships,headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
 return {status:'active',profileId:profile.id,memberships:workspaces.filter(w=>allowed.has(w.key)).map(w=>({workspace:w.key,role:roleFor(role)}))};
}
