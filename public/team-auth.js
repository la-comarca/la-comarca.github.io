const root=document.querySelector('[data-team-auth]');
if(root){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const SESSION_KEY='comarca-team-supabase-session';
 const configResponse=await fetch(new URL('./config.json',import.meta.url),{cache:'no-store'}),config=configResponse.ok?await configResponse.json():{};
 const origin=(config.platformOrigin||'https://comarca.kipadmon.com').replace(/\/$/,'');
 const status=root.querySelector('[data-team-status]'),form=root.querySelector('form'),panel=root.querySelector('[data-team-panel]');
 let session=null;try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{}
 const save=value=>{session=value;if(value)sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));else sessionStorage.removeItem(SESSION_KEY);};
 const call=async(path,{method='GET',body,token}={})=>{const response=await fetch(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await response.json().catch(()=>({message:'Respuesta no válida.'}));if(!response.ok){const error=Error(data.message||'No pudimos completar la solicitud.');error.status=response.status;throw error;}return data;};
 const moduleLabel=key=>({agenda:'Agenda',materiales:'Materiales',catecismo:'Catecismo',traslados:'Traslados',inscripciones:'Inscripciones',operaciones:'Operaciones'}[key]||key);
 const renderUser=user=>{
  form.hidden=true;panel.hidden=false;
  panel.innerHTML=`<div class="team-session-head"><div><span class="eyebrow">SESIÓN ACTIVA</span><h3>${esc(user.name||user.email)}</h3><p>${esc(user.email)}</p></div><button class="text-link" type="button" data-team-logout>Cerrar sesión ↗</button></div><div class="team-module-grid">${(user.modules||[]).map(module=>`<article class="team-module"><small>${esc(module.role||'reader')}</small><h3>${esc(module.name||moduleLabel(module.key))}</h3><p>${esc(module.description||'Acceso autorizado para este espacio de trabajo.')}</p><span>Disponible</span></article>`).join('')}</div>${user.modules?.length?'':'<p>No hay módulos asignados a esta cuenta.</p>'}`;
  panel.querySelector('[data-team-logout]')?.addEventListener('click',async()=>{try{if(session?.access_token)await call('/auth/logout',{method:'POST',token:session.access_token});}catch{}save(null);location.reload();});
 };
 const renderSignedOut=message=>{form.hidden=false;panel.hidden=true;if(message)status.textContent=message;};
 const refresh=async()=>{if(!session?.refresh_token)return false;try{const data=await call('/auth/refresh',{method:'POST',body:{refresh_token:session.refresh_token}});save({...data,expires_at:Date.now()+(data.expires_in||3600)*1000});renderUser(data.user);return true;}catch{save(null);return false;}};
 const resume=async()=>{if(!session?.access_token){renderSignedOut('');return;}try{if(session.expires_at&&Date.now()>session.expires_at-60000){if(await refresh())return;}const data=await call('/auth/me',{token:session.access_token});renderUser(data.user);}catch(error){if(error.status===401&&await refresh())return;save(null);renderSignedOut('Tu sesión terminó. Inicia sesión de nuevo.');}};
 form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button[type=submit]'),values=Object.fromEntries(new FormData(form));button.disabled=true;status.textContent='Comprobando acceso…';try{const data=await call('/auth/token',{method:'POST',body:{email:values.email,password:values.password}});save({...data,expires_at:Date.now()+(data.expires_in||3600)*1000});form.reset();status.textContent='';renderUser(data.user);}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
 await resume();
}
