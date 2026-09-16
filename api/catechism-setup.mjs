import {supabaseIdentity} from './supabase-auth.mjs';
import {supabaseRequest} from './supabase.mjs';

const HEADERS={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allowedOrigin=(request,env)=>{const origin=request.headers.get('Origin');return origin&&(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).includes(origin)?origin:'';};
const bearer=request=>{const value=request.headers.get('Authorization')||'';return /^Bearer\s+\S+$/.test(value)&&value.length<20000?value.slice(7):'';};
const reply=(origin,status,data)=>new Response(JSON.stringify(data),{status,headers:{...HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin'}});
const clean=(value,max=240)=>typeof value==='string'?value.trim().slice(0,max):'';
async function jsonBody(request){const text=await request.text();if(text.length>12000)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413});try{return JSON.parse(text||'{}');}catch{throw Object.assign(Error('Formato no válido.'),{status:400});}}
const moduleFor=me=>(me.modules||[]).find(item=>item.key==='catecismo');
const canManage=me=>['admin','coordinator'].includes(moduleFor(me)?.role);
async function requireManager(request,env){const token=bearer(request);if(!token)throw Object.assign(Error('Inicia sesión.'),{status:401});let me;try{me=await supabaseIdentity(env,token);}catch{throw Object.assign(Error('Tu sesión terminó.'),{status:401});}if(!canManage(me))throw Object.assign(Error('Tu cuenta no puede cambiar la configuración académica.'),{status:403});return me;}
async function rate(env,me){if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'catechism-setup:'+me.id})).success)throw Object.assign(Error('Espera un momento antes de guardar otra vez.'),{status:429});}

async function listSetup(env){const [cycles,programs,rooms]=await Promise.all([
 supabaseRequest(env,'rest/v1/catechism_cycles?select=id,name,status,starts_on,ends_on,created_at&order=starts_on.desc'),
 supabaseRequest(env,'rest/v1/catechism_programs?select=id,name,description,active,created_at&order=name.asc'),
 supabaseRequest(env,'rest/v1/catechism_rooms?select=id,name,location,capacity,notes,active&order=name.asc')
]);return {cycles,programs,rooms};}

function cyclePayload(input,{partial=false}={}){
 const out={};
 if(!partial||input.name!==undefined){const name=clean(input.name,120);if(!name)throw Object.assign(Error('Escribe el nombre del ciclo.'),{status:400});out.name=name;}
 if(!partial||input.starts_on!==undefined){if(!/^\d{4}-\d{2}-\d{2}$/.test(input.starts_on||''))throw Object.assign(Error('Selecciona la fecha de inicio.'),{status:400});out.starts_on=input.starts_on;}
 if(!partial||input.ends_on!==undefined){if(!/^\d{4}-\d{2}-\d{2}$/.test(input.ends_on||''))throw Object.assign(Error('Selecciona la fecha de fin.'),{status:400});out.ends_on=input.ends_on;}
 if(out.starts_on&&out.ends_on&&out.ends_on<out.starts_on)throw Object.assign(Error('La fecha de fin debe ser posterior al inicio.'),{status:400});
 if(!partial||input.status!==undefined){const status=clean(input.status,30)||'planning';if(!['planning','active','closed','archived'].includes(status))throw Object.assign(Error('Estado de ciclo no válido.'),{status:400});out.status=status;}
 return out;
}
function programPayload(input,{partial=false}={}){const out={};if(!partial||input.name!==undefined){const name=clean(input.name,120);if(!name)throw Object.assign(Error('Escribe el nombre del programa.'),{status:400});out.name=name;}if(!partial||input.description!==undefined)out.description=clean(input.description,1800);if(!partial||input.active!==undefined)out.active=input.active===true||input.active==='true';return out;}
function roomPayload(input,{partial=false}={}){const out={};if(!partial||input.name!==undefined){const name=clean(input.name,120);if(!name)throw Object.assign(Error('Escribe el nombre del salón.'),{status:400});out.name=name;}if(!partial||input.location!==undefined)out.location=clean(input.location,240);if(!partial||input.notes!==undefined)out.notes=clean(input.notes,1800);if(!partial||input.capacity!==undefined){if(input.capacity===null||input.capacity==='')out.capacity=null;else{const capacity=Number(input.capacity);if(!Number.isInteger(capacity)||capacity<0||capacity>1000)throw Object.assign(Error('Capacidad no válida.'),{status:400});out.capacity=capacity;}}if(!partial||input.active!==undefined)out.active=input.active===true||input.active==='true';return out;}

async function closeOtherActiveCycles(env,keepId=null){const query=keepId?`rest/v1/catechism_cycles?status=eq.active&id=neq.${keepId}`:'rest/v1/catechism_cycles?status=eq.active';await supabaseRequest(env,query,{method:'PATCH',body:{status:'closed'}});}
async function createCycle(env,input){const payload=cyclePayload(input);if(payload.status==='active')await closeOtherActiveCycles(env);const rows=await supabaseRequest(env,'rest/v1/catechism_cycles',{method:'POST',body:payload});return {cycle:rows[0],message:'Ciclo creado.'};}
async function updateCycle(env,id,input){const payload=cyclePayload(input,{partial:true});if(!Object.keys(payload).length)throw Object.assign(Error('No hay cambios que guardar.'),{status:400});if(payload.status==='active')await closeOtherActiveCycles(env,id);const rows=await supabaseRequest(env,`rest/v1/catechism_cycles?id=eq.${id}`,{method:'PATCH',body:payload});if(!rows.length)throw Object.assign(Error('Ciclo no encontrado.'),{status:404});return {cycle:rows[0],message:'Ciclo actualizado.'};}
async function createProgram(env,input){const rows=await supabaseRequest(env,'rest/v1/catechism_programs',{method:'POST',body:programPayload(input)});return {program:rows[0],message:'Programa creado.'};}
async function updateProgram(env,id,input){const payload=programPayload(input,{partial:true});if(!Object.keys(payload).length)throw Object.assign(Error('No hay cambios que guardar.'),{status:400});const rows=await supabaseRequest(env,`rest/v1/catechism_programs?id=eq.${id}`,{method:'PATCH',body:payload});if(!rows.length)throw Object.assign(Error('Programa no encontrado.'),{status:404});return {program:rows[0],message:'Programa actualizado.'};}
async function createRoom(env,input){const rows=await supabaseRequest(env,'rest/v1/catechism_rooms',{method:'POST',body:roomPayload(input)});return {room:rows[0],message:'Salón creado.'};}
async function updateRoom(env,id,input){const payload=roomPayload(input,{partial:true});if(!Object.keys(payload).length)throw Object.assign(Error('No hay cambios que guardar.'),{status:400});const rows=await supabaseRequest(env,`rest/v1/catechism_rooms?id=eq.${id}`,{method:'PATCH',body:payload});if(!rows.length)throw Object.assign(Error('Salón no encontrado.'),{status:404});return {room:rows[0],message:'Salón actualizado.'};}

export async function catechismSetup(request,env){
 const origin=allowedOrigin(request,env);
 if(request.method==='OPTIONS'){if(!origin)return new Response(null,{status:403});return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}});}
 if(!origin)return reply('',403,{message:'Origen no permitido.'});
 try{
  const me=await requireManager(request,env),url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
  if(path==='/backoffice/setup'&&request.method==='GET')return reply(origin,200,await listSetup(env));
  const cycle=path.match(/^\/backoffice\/setup\/cycles(?:\/([a-f0-9-]{36}))?$/i);if(cycle){if(cycle[1]&&!UUID.test(cycle[1]))throw Object.assign(Error('Ciclo no válido.'),{status:400});if(!['POST','PATCH'].includes(request.method))throw Object.assign(Error('Método no permitido.'),{status:405});await rate(env,me);const input=await jsonBody(request);return reply(origin,cycle[1]?200:201,cycle[1]?await updateCycle(env,cycle[1],input):await createCycle(env,input));}
  const program=path.match(/^\/backoffice\/setup\/programs(?:\/([a-f0-9-]{36}))?$/i);if(program){if(program[1]&&!UUID.test(program[1]))throw Object.assign(Error('Programa no válido.'),{status:400});if(!['POST','PATCH'].includes(request.method))throw Object.assign(Error('Método no permitido.'),{status:405});await rate(env,me);const input=await jsonBody(request);return reply(origin,program[1]?200:201,program[1]?await updateProgram(env,program[1],input):await createProgram(env,input));}
  const room=path.match(/^\/backoffice\/setup\/rooms(?:\/([a-f0-9-]{36}))?$/i);if(room){if(room[1]&&!UUID.test(room[1]))throw Object.assign(Error('Salón no válido.'),{status:400});if(!['POST','PATCH'].includes(request.method))throw Object.assign(Error('Método no permitido.'),{status:405});await rate(env,me);const input=await jsonBody(request);return reply(origin,room[1]?200:201,room[1]?await updateRoom(env,room[1],input):await createRoom(env,input));}
  return reply(origin,404,{message:'Ruta no disponible.'});
 }catch(error){const status=error.status||500;return reply(origin,status,{message:error.message||'No pudimos guardar la configuración.'});}
}
