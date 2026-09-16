import {supabaseIdentity} from './supabase-auth.mjs';
import {can} from './cms-auth.mjs';
import {modules,records,notion,plain,belongs,enabled,sourceId,modulePermission,recordValues,propertiesFor,RecordError} from './cms-records.mjs';
import {recordUpdate} from './cms-updates.mjs';

const CATECHISM_KEYS=['students','attendance','lessons','grades','topics','shifts'];
const CATECHISM_SET=new Set(CATECHISM_KEYS);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const BASE_HEADERS={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};

const originFor=(request,env)=>{const origin=request.headers.get('Origin');return origin&&(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)?origin:'';};
const corsHeaders=origin=>({...BASE_HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin'});
const reply=(origin,status,data)=>new Response(JSON.stringify(data),{status,headers:corsHeaders(origin)});
const bearer=request=>{const value=request.headers.get('Authorization')||'';return /^Bearer\s+\S+$/.test(value)&&value.length<20000?value.slice(7):'';};
async function jsonBody(request){const reader=request.body?.getReader();if(!reader)throw new RecordError('Solicitud incompleta.');let parts=[],length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>12000){await reader.cancel();throw new RecordError('La solicitud es demasiado grande.');}parts.push(value);}try{return JSON.parse(await new Blob(parts).text());}catch{throw new RecordError('Formato no válido.');}}
const userFromIdentity=me=>({id:me.id,name:me.name,email:me.email,role:'reader',modules:(me.modules||[]).map(m=>m.key),supabase:{status:'active',memberships:(me.modules||[]).map(m=>({workspace:m.key,role:m.role}))}});

async function querySource(env,key,body,fetcher){if(!enabled(key,env))throw new RecordError('Esta sección todavía no está conectada.',503);return notion(env,'data_sources/'+sourceId(key,env)+'/query',{method:'POST',body:JSON.stringify(body)},fetcher);}
const titleField=key=>modules[key]?.fields.find(f=>f.type==='title');
const itemTitle=(key,page)=>plain(page.properties?.[titleField(key)?.name]?.title)||'Sin nombre';

async function summary(env,fetcher){
 const specs=[
  ['students',{property:'Estatus',select:{equals:'Activo'}}],
  ['attendance',{property:'Asistencia',select:{equals:'Por registrar'}}],
  ['lessons',{property:'Estado',select:{does_not_equal:'Cerrada'}}],
  ['grades',{or:[{property:'Estado',select:{equals:'Pendiente'}},{property:'Estado',select:{equals:'Por completar'}}]}],
  ['topics',{property:'Estado',select:{does_not_equal:'Impartido'}}],
  ['shifts',{property:'Confirmación',select:{does_not_equal:'Confirmado'}}]
 ];
 const rows=await Promise.all(specs.map(async([key,filter])=>{
  try{const data=await querySource(env,key,{page_size:100,filter,sorts:[{timestamp:'last_edited_time',direction:'descending'}]},fetcher);return [key,{count:data.results.length,hasMore:!!data.has_more,samples:data.results.slice(0,4).map(page=>({id:page.id,title:itemTitle(key,page)}))}];}
  catch(error){return [key,{count:null,hasMore:false,samples:[],message:error.message||'No se pudo cargar.'}];}
 }));
 return Object.fromEntries(rows);
}

async function lookup(env,user,key,url,fetcher){
 const allowed=CATECHISM_SET.has(key)||key==='agenda'||key==='materials';
 if(!allowed)throw new RecordError('Consulta no disponible.',404);
 if(key!=='agenda'&&!can(user,modulePermission(key)))throw new RecordError('Acceso restringido.',403);
 const q=url.searchParams.get('q')||'';if(q.length>150)throw new RecordError('Consulta no válida.');
 const cursor=url.searchParams.get('cursor');if(cursor&&!UUID.test(cursor))throw new RecordError('Consulta no válida.');
 if(key==='agenda'){
  const data=await notion(env,'data_sources/'+env.NOTION_AGENDA_ID+'/query',{method:'POST',body:JSON.stringify({page_size:50,...(cursor?{start_cursor:cursor}:{}),filter:{and:[{property:'Tipo',select:{equals:'Catecismo'}},...(q?[{property:'Name',title:{contains:q}}]:[])]},sorts:[{property:'Fecha',direction:'descending'}]})},fetcher);
  return {options:data.results.map(page=>{const name=plain(page.properties?.Name?.title)||'Sesión de catecismo',date=page.properties?.Fecha?.date?.start;return {id:page.id,label:date?`${name} · ${date.slice(0,10)}`:name};}),nextCursor:data.has_more?data.next_cursor:null};
 }
 if(!enabled(key,env))throw new RecordError('Esta sección todavía no está conectada.',503);
 const field=titleField(key),data=await querySource(env,key,{page_size:50,...(cursor?{start_cursor:cursor}:{}),...(q?{filter:{property:field.name,title:{contains:q}}}:{})},fetcher);
 return {options:data.results.map(page=>({id:page.id,label:itemTitle(key,page)})),nextCursor:data.has_more?data.next_cursor:null};
}

async function sessions(env,fetcher){
 if(!env.NOTION_AGENDA_ID)throw new RecordError('La agenda todavía no está conectada.',503);
 const data=await notion(env,'data_sources/'+env.NOTION_AGENDA_ID+'/query',{method:'POST',body:JSON.stringify({page_size:50,filter:{property:'Tipo',select:{equals:'Catecismo'}},sorts:[{property:'Fecha',direction:'descending'}]})},fetcher);
 return {sessions:data.results.map(page=>({id:page.id,title:plain(page.properties?.Name?.title)||'Sesión de catecismo',start:page.properties?.Fecha?.date?.start||'',status:page.properties?.Estado?.select?.name||''})),nextCursor:data.has_more?data.next_cursor:null};
}

async function attendanceSheet(env,user,sessionId,fetcher){
 if(!UUID.test(sessionId||''))throw new RecordError('Selecciona una sesión válida.');
 const session=await notion(env,'pages/'+sessionId,{},fetcher);
 if(!belongs(session,env.NOTION_AGENDA_ID)||session.properties?.Tipo?.select?.name!=='Catecismo')throw new RecordError('Sesión no disponible.',404);
 if(!enabled('students',env)||!enabled('attendance',env))throw new RecordError('Pase de lista todavía no está conectado.',503);
 const [studentData,attendanceData]=await Promise.all([
  querySource(env,'students',{page_size:100,filter:{property:'Estatus',select:{equals:'Activo'}},sorts:[{property:'Alumno',direction:'ascending'}]},fetcher),
  querySource(env,'attendance',{page_size:100,filter:{property:'Sesión',relation:{contains:sessionId}}},fetcher)
 ]);
 const attendanceByStudent=new Map();
 for(const page of attendanceData.results){const item=recordValues(page,modules.attendance),student=item.values.Alumno?.[0];if(student)attendanceByStudent.set(student,item);}
 const students=studentData.results.map(page=>({id:page.id,name:plain(page.properties?.Alumno?.title)||'Alumno',group:plain(page.properties?.['Grupo o nivel']?.rich_text)||'',catechist:plain(page.properties?.['Catequista referente']?.rich_text)||'',attendance:attendanceByStudent.get(page.id)||null}));
 return {session:{id:session.id,title:plain(session.properties?.Name?.title)||'Sesión de catecismo',start:session.properties?.Fecha?.date?.start||''},students,partial:!!studentData.has_more||!!attendanceData.has_more,canWrite:can(user,'catecismo',true)};
}

async function saveAttendance(env,user,input,fetcher){
 if(!can(user,'catecismo',true))throw new RecordError('Tu cuenta es de consulta.',403);
 if(!input||typeof input!=='object'||!UUID.test(input.studentId||'')||!UUID.test(input.sessionId||''))throw new RecordError('Revisa alumno y sesión.');
 const statuses=modules.attendance.fields.find(f=>f.name==='Asistencia').options;
 if(!statuses.includes(input.status)||typeof (input.observation??'')!=='string'||(input.observation??'').length>1800)throw new RecordError('Revisa la asistencia y la observación.');
 const [student,session]=await Promise.all([notion(env,'pages/'+input.studentId,{},fetcher),notion(env,'pages/'+input.sessionId,{},fetcher)]);
 if(!belongs(student,modules.students.id))throw new RecordError('Alumno no disponible.',404);
 if(!belongs(session,env.NOTION_AGENDA_ID)||session.properties?.Tipo?.select?.name!=='Catecismo')throw new RecordError('Sesión no disponible.',404);
 const found=await querySource(env,'attendance',{page_size:2,filter:{and:[{property:'Alumno',relation:{contains:input.studentId}},{property:'Sesión',relation:{contains:input.sessionId}}]}},fetcher);
 let current=found.results[0]||null;
 if(found.results.length>1)throw new RecordError('Hay registros duplicados de asistencia. Revísalos antes de continuar.',409);
 if(current&&input.recordId&&current.id!==input.recordId)throw new RecordError('El registro cambió. Actualiza el pase de lista.',409);
 if(current&&input.version&&current.last_edited_time!==input.version)throw new RecordError('El registro cambió. Actualiza el pase de lista.',409);
 const studentName=plain(student.properties?.Alumno?.title)||'Alumno',sessionTitle=plain(session.properties?.Name?.title)||'Catecismo';
 const values={Registro:`${studentName} · ${sessionTitle}`,'Alumno':[input.studentId],'Sesión':[input.sessionId],Asistencia:input.status,Observación:(input.observation||'').trim()};
 const properties=propertiesFor('attendance',values,!current);
 const saved=await notion(env,'pages'+(current?'/'+current.id:''),{method:current?'PATCH':'POST',body:JSON.stringify({...(current?{}:{parent:{type:'data_source_id',data_source_id:modules.attendance.id}}),properties})},fetcher);
 const record=recordValues(saved,modules.attendance);await recordUpdate(env,user,'attendance',record.id,current?'updated':'created',{source:'backoffice',operation:'attendance'});return {record,message:'Asistencia guardada.'};
}

export async function backoffice(request,env,fetcher=fetch,dependencies={}){
 const origin=originFor(request,env);
 if(request.method==='OPTIONS'){
  if(!origin)return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}});
 }
 if(!origin)return reply('',403,{message:'Origen no permitido.'});
 const token=bearer(request);if(!token)return reply(origin,401,{message:'Inicia sesión.'});
 let me;try{me=await (dependencies.authenticate||supabaseIdentity)(env,token);}catch(error){return reply(origin,error.message==='permission'?403:401,{message:error.message==='permission'?'Tu cuenta no tiene acceso a este espacio.':'Tu sesión terminó. Inicia sesión de nuevo.'});}
 const user=userFromIdentity(me);if(!can(user,'catecismo'))return reply(origin,403,{message:'Tu cuenta no tiene acceso a Catecismo.'});
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
 try{
  if(path==='/backoffice/api/me'&&request.method==='GET')return reply(origin,200,{user:{name:me.name,email:me.email,role:(me.modules||[]).find(m=>m.key==='catecismo')?.role||'reader'},module:'catecismo'});
  if(path==='/backoffice/api/schema'&&request.method==='GET')return reply(origin,200,{modules:CATECHISM_KEYS.map(key=>({key,label:modules[key].label,canWrite:can(user,'catecismo',true),fields:modules[key].fields.filter(field=>field.name!=='Necesita ride')}))});
  if(path==='/backoffice/api/summary'&&request.method==='GET')return reply(origin,200,{summary:await summary(env,fetcher)});
  if(path==='/backoffice/api/sessions'&&request.method==='GET')return reply(origin,200,await sessions(env,fetcher));
  if(path==='/backoffice/api/attendance'&&request.method==='GET')return reply(origin,200,await attendanceSheet(env,user,url.searchParams.get('session'),fetcher));
  if(path==='/backoffice/api/attendance'&&request.method==='POST'){
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new RecordError('Formato no válido.',415);
   if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'backoffice:'+me.id})).success)throw new RecordError('Espera un momento antes de guardar otra vez.',429);
   return reply(origin,200,await saveAttendance(env,user,await jsonBody(request),fetcher));
  }
  const lookupRoute=path.match(/^\/backoffice\/api\/lookup\/([a-z]+)$/);if(lookupRoute&&request.method==='GET')return reply(origin,200,await lookup(env,user,lookupRoute[1],url,fetcher));
  const recordRoute=path.match(/^\/backoffice\/api\/records\/([a-z]+)(?:\/([a-f0-9-]{36}))?$/i);
  if(recordRoute){
   const key=recordRoute[1],id=recordRoute[2];if(!CATECHISM_SET.has(key))throw new RecordError('Sección no disponible.',404);
   if(!['GET','POST','PATCH'].includes(request.method))throw new RecordError('Método no permitido.',405);
   let input=null;if(request.method!=='GET'){
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new RecordError('Formato no válido.',415);
    if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'backoffice:'+me.id})).success)throw new RecordError('Espera un momento antes de guardar otra vez.',429);
    input=await jsonBody(request);
   }
   const result=await (dependencies.records||records)(request,env,user,key,id,input,fetcher);
   if(request.method!=='GET')await recordUpdate(env,user,key,result.record.id,request.method==='POST'?'created':'updated',{source:'backoffice',operation:request.method.toLowerCase()});
   return reply(origin,request.method==='POST'?201:200,result);
  }
  throw new RecordError('Ruta no disponible.',404);
 }catch(error){const status=error instanceof RecordError?error.status||400:500;return reply(origin,status,{message:error instanceof RecordError?error.message:'No pudimos completar la operación.'});}
}
