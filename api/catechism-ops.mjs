import {supabaseIdentity} from './supabase-auth.mjs';
import {supabaseRequest} from './supabase.mjs';

const JSON_HEADERS={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ATTENDANCE=new Set(['unrecorded','present','absent','late','excused']);
const STAFF_ROLES=new Set(['lead','catechist','assistant','substitute']);
const allowedOrigin=(request,env)=>{const origin=request.headers.get('Origin');return origin&&(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)?origin:'';};
const bearer=request=>{const value=request.headers.get('Authorization')||'';return /^Bearer\s+\S+$/.test(value)&&value.length<20000?value.slice(7):'';};
const reply=(origin,status,data)=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin'}});
const clean=(value,max=240)=>typeof value==='string'?value.trim().slice(0,max):'';
async function readBody(request,max=30000){const text=await request.text();if(text.length>max)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413});try{return JSON.parse(text||'{}');}catch{throw Object.assign(Error('Formato no válido.'),{status:400});}}
const moduleFor=me=>(me.modules||[]).find(item=>item.key==='catecismo');
const roleFor=me=>moduleFor(me)?.role||'';
const canManage=me=>['admin','coordinator'].includes(roleFor(me));
const canTakeAttendance=me=>['admin','coordinator','catechist'].includes(roleFor(me));

async function currentProfile(db,env,me){const rows=await db(env,`rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(me.id)}&select=id,email,display_name&limit=1`);return rows[0]||null;}
async function scopeFor(db,env,me){
 if(roleFor(me)!=='catechist')return null;
 const profile=await currentProfile(db,env,me);if(!profile)return new Set();
 const catechist=(await db(env,`rest/v1/catechism_catechists?profile_id=eq.${profile.id}&active=eq.true&select=person_id&limit=1`))[0];
 if(!catechist)return new Set();
 const rows=await db(env,`rest/v1/catechism_group_catechists?catechist_id=eq.${catechist.person_id}&active=eq.true&select=group_id`);
 return new Set(rows.map(row=>row.group_id));
}
const canSeeGroup=(scope,groupId)=>scope===null||scope.has(groupId);
async function sessionById(db,env,id){
 if(!UUID.test(id))throw Object.assign(Error('Sesión no válida.'),{status:400});
 const rows=await db(env,`rest/v1/catechism_sessions?id=eq.${id}&select=id,group_id,series_id,room_id,title,kind,starts_at,ends_at,status,cancellation_reason,notes,catechism_groups(id,name,level,catechism_rooms(name))&limit=1`);
 if(!rows[0])throw Object.assign(Error('Sesión no encontrada.'),{status:404});return rows[0];
}
async function sessionWorkspace(db,env,id,scope){
 const session=await sessionById(db,env,id);if(!canSeeGroup(scope,session.group_id))throw Object.assign(Error('Sesión no encontrada.'),{status:404});
 const [enrollments,attendance]=await Promise.all([
  db(env,`rest/v1/catechism_enrollments?group_id=eq.${session.group_id}&status=in.(active,paused,pending)&select=id,student_id,status,catechism_students(person_id,status,catechism_people(first_name,last_name,preferred_name))&order=enrolled_on.asc`),
  db(env,`rest/v1/catechism_attendance?session_id=eq.${session.id}&select=enrollment_id,status,note,updated_at`)
 ]);
 const byEnrollment=new Map(attendance.map(row=>[row.enrollment_id,row]));
 return {session,enrollments:enrollments.map(row=>({...row,attendance:byEnrollment.get(row.id)||{status:'unrecorded',note:''}}))};
}
async function saveAttendance(db,env,me,id,input,scope){
 if(!canTakeAttendance(me))throw Object.assign(Error('Tu cuenta no puede registrar asistencia.'),{status:403});
 const session=await sessionById(db,env,id);if(!canSeeGroup(scope,session.group_id))throw Object.assign(Error('Sesión no encontrada.'),{status:404});
 const records=Array.isArray(input.records)?input.records:[];if(!records.length||records.length>150)throw Object.assign(Error('Revisa la lista de asistencia.'),{status:400});
 const enrollments=await db(env,`rest/v1/catechism_enrollments?group_id=eq.${session.group_id}&status=in.(active,paused,pending)&select=id`),allowed=new Set(enrollments.map(row=>row.id));
 const profile=await currentProfile(db,env,me);if(!profile)throw Object.assign(Error('No encontramos tu perfil.'),{status:403});
 const now=new Date().toISOString(),payload=[];
 for(const record of records){if(!UUID.test(record.enrollment_id||'')||!allowed.has(record.enrollment_id)||!ATTENDANCE.has(record.status))throw Object.assign(Error('Hay un registro de asistencia no válido.'),{status:400});payload.push({session_id:session.id,enrollment_id:record.enrollment_id,status:record.status,note:clean(record.note,500),updated_by:profile.id,updated_at:now});}
 await db(env,'rest/v1/catechism_attendance',{method:'POST',body:payload,headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
 return {message:'Asistencia guardada.',saved:payload.length};
}
async function catechistDetail(db,env,id){
 if(!UUID.test(id))throw Object.assign(Error('Catequista no válido.'),{status:400});
 const catechist=(await db(env,`rest/v1/catechism_catechists?person_id=eq.${id}&select=person_id,profile_id,active,started_on,ended_on,formation_notes,catechism_people(first_name,last_name,preferred_name,email,phone)&limit=1`))[0];if(!catechist)throw Object.assign(Error('Catequista no encontrado.'),{status:404});
 const [assignments,groups]=await Promise.all([
  db(env,`rest/v1/catechism_group_catechists?catechist_id=eq.${id}&select=group_id,role,active,catechism_groups(name,level,starts_at,ends_at)&order=active.desc`),
  db(env,'rest/v1/catechism_groups?active=eq.true&select=id,name,level,starts_at,ends_at&order=name.asc')
 ]);
 return {catechist,assignments,groups};
}
async function assignCatechist(db,env,id,input){
 if(!UUID.test(id)||!UUID.test(input.group_id||'')||!STAFF_ROLES.has(input.role||'catechist'))throw Object.assign(Error('Revisa el grupo y la función.'),{status:400});
 const [person,group]=await Promise.all([db(env,`rest/v1/catechism_catechists?person_id=eq.${id}&select=person_id&limit=1`),db(env,`rest/v1/catechism_groups?id=eq.${input.group_id}&select=id&limit=1`)]);if(!person[0]||!group[0])throw Object.assign(Error('No encontramos el catequista o grupo.'),{status:404});
 await db(env,'rest/v1/catechism_group_catechists',{method:'POST',body:{group_id:input.group_id,catechist_id:id,role:input.role||'catechist',active:true},headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
 return {message:'Catequista asignado.'};
}
async function updateCatechistAssignment(db,env,id,groupId,input){
 if(!UUID.test(id)||!UUID.test(groupId)||typeof input.active!=='boolean')throw Object.assign(Error('Asignación no válida.'),{status:400});
 const rows=await db(env,`rest/v1/catechism_group_catechists?catechist_id=eq.${id}&group_id=eq.${groupId}`,{method:'PATCH',body:{active:input.active,...(STAFF_ROLES.has(input.role)?{role:input.role}:{})}});if(!rows?.length)throw Object.assign(Error('Asignación no encontrada.'),{status:404});
 return {message:input.active?'Asignación reactivada.':'Catequista retirado del grupo.'};
}
async function createSeries(db,env,input){
 if(!UUID.test(input.group_id||'')||!input.first_starts_at||!input.first_ends_at||!/^\d{4}-\d{2}-\d{2}$/.test(input.ends_on||''))throw Object.assign(Error('Completa grupo, primera sesión y fecha final.'),{status:400});
 const first=new Date(input.first_starts_at),firstEnd=new Date(input.first_ends_at);if(!Number.isFinite(+first)||!Number.isFinite(+firstEnd)||firstEnd<=first)throw Object.assign(Error('El horario de la serie no es válido.'),{status:400});
 const interval=Math.max(1,Math.min(12,Number(input.interval_weeks)||1)),endLimit=new Date(input.ends_on+'T23:59:59Z');if(endLimit<first)throw Object.assign(Error('La fecha final debe ser posterior a la primera clase.'),{status:400});
 const group=(await db(env,`rest/v1/catechism_groups?id=eq.${input.group_id}&active=eq.true&select=id,room_id&limit=1`))[0];if(!group)throw Object.assign(Error('Grupo no encontrado.'),{status:404});
 const weekday=Number.isInteger(input.weekday)?input.weekday:first.getUTCDay(),startsOn=clean(input.starts_on,10)||clean(input.first_local_date,10)||first.toISOString().slice(0,10),startTime=clean(input.start_time,8)||first.toISOString().slice(11,19),endTime=clean(input.end_time,8)||firstEnd.toISOString().slice(11,19);
 const series=(await db(env,'rest/v1/catechism_session_series',{method:'POST',body:{group_id:group.id,title:clean(input.title,160)||'Catecismo',weekday,starts_at:startTime,ends_at:endTime,starts_on:startsOn,ends_on:input.ends_on,interval_weeks:interval,room_id:UUID.test(input.room_id||'')?input.room_id:(group.room_id||null),active:true}}))[0];
 const sessions=[],duration=firstEnd-first,step=interval*7*24*60*60*1000;for(let stamp=+first;stamp<=+endLimit&&sessions.length<80;stamp+=step){const start=new Date(stamp),end=new Date(stamp+duration);sessions.push({group_id:group.id,series_id:series.id,room_id:series.room_id,title:series.title,kind:clean(input.kind,40)||'class',starts_at:start.toISOString(),ends_at:end.toISOString(),status:'scheduled',notes:clean(input.notes,1800)});}
 if(!sessions.length)throw Object.assign(Error('No se generaron sesiones.'),{status:400});await db(env,'rest/v1/catechism_sessions',{method:'POST',body:sessions});return {series,count:sessions.length,message:`Serie creada con ${sessions.length} sesiones.`};
}

export async function catechismOps(request,env,dependencies={}){
 const origin=allowedOrigin(request,env);if(request.method==='OPTIONS'){if(!origin)return new Response(null,{status:403});return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}});}if(!origin)return reply('',403,{message:'Origen no permitido.'});
 const token=bearer(request);if(!token)return reply(origin,401,{message:'Inicia sesión.'});let me;try{me=await (dependencies.identity||supabaseIdentity)(env,token);}catch{return reply(origin,401,{message:'Tu sesión terminó. Inicia sesión de nuevo.'});}if(!moduleFor(me))return reply(origin,403,{message:'Tu cuenta no tiene acceso a Catecismo.'});
 const db=dependencies.db||supabaseRequest,url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
 try{
  const scope=await scopeFor(db,env,me);
  let match=path.match(/^\/backoffice\/ops\/sessions\/([a-f0-9-]{36})$/i);if(match&&request.method==='GET')return reply(origin,200,await sessionWorkspace(db,env,match[1],scope));
  match=path.match(/^\/backoffice\/ops\/sessions\/([a-f0-9-]{36})\/attendance$/i);if(match&&request.method==='PATCH')return reply(origin,200,await saveAttendance(db,env,me,match[1],await readBody(request),scope));
  match=path.match(/^\/backoffice\/ops\/catechists\/([a-f0-9-]{36})$/i);if(match&&request.method==='GET'){if(!canManage(me))return reply(origin,403,{message:'Acceso restringido.'});return reply(origin,200,await catechistDetail(db,env,match[1]));}
  match=path.match(/^\/backoffice\/ops\/catechists\/([a-f0-9-]{36})\/groups$/i);if(match&&request.method==='POST'){if(!canManage(me))return reply(origin,403,{message:'Acceso restringido.'});return reply(origin,201,await assignCatechist(db,env,match[1],await readBody(request)));}
  match=path.match(/^\/backoffice\/ops\/catechists\/([a-f0-9-]{36})\/groups\/([a-f0-9-]{36})$/i);if(match&&request.method==='PATCH'){if(!canManage(me))return reply(origin,403,{message:'Acceso restringido.'});return reply(origin,200,await updateCatechistAssignment(db,env,match[1],match[2],await readBody(request)));}
  if(path==='/backoffice/ops/session-series'&&request.method==='POST'){if(!canManage(me))return reply(origin,403,{message:'Acceso restringido.'});return reply(origin,201,await createSeries(db,env,await readBody(request)));}
  return reply(origin,404,{message:'Ruta no disponible.'});
 }catch(error){return reply(origin,error.status||500,{message:error.status?error.message:'No pudimos completar la operación.'});}
}
