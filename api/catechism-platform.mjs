import {supabaseIdentity} from './supabase-auth.mjs';
import {supabaseRequest} from './supabase.mjs';

const JSON_HEADERS={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const allowedOrigin=(request,env)=>{const origin=request.headers.get('Origin');return origin&&(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)?origin:'';};
const bearer=request=>{const value=request.headers.get('Authorization')||'';return /^Bearer\s+\S+$/.test(value)&&value.length<20000?value.slice(7):'';};
const reply=(origin,status,data)=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin'}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function body(request){const text=await request.text();if(text.length>20000)throw Object.assign(Error('Solicitud demasiado grande.'),{status:413});try{return JSON.parse(text||'{}');}catch{throw Object.assign(Error('Formato no válido.'),{status:400});}}
const clean=(value,max=180)=>{if(typeof value!=='string')return'';return value.trim().slice(0,max);};
const roleRank={reader:0,catechist:1,editor:1,coordinator:2,admin:3};
const catechismModule=me=>(me.modules||[]).find(item=>item.key==='catecismo');
const canWrite=me=>(roleRank[catechismModule(me)?.role]||0)>=2;
const isMember=me=>!!catechismModule(me);
async function currentProfile(env,me){const rows=await supabaseRequest(env,`rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(me.id)}&select=id,email,display_name&limit=1`);return rows[0]||null;}
async function workspace(env){const rows=await supabaseRequest(env,'rest/v1/workspaces?key=eq.catecismo&active=eq.true&select=id,key,name&limit=1');return rows[0]||null;}
async function requireWrite(env,me){if(!canWrite(me))throw Object.assign(Error('Tu cuenta no puede realizar esta acción.'),{status:403});if(!env.FORM_LIMIT||!(await env.FORM_LIMIT.limit({key:'catechism-v2:'+me.id})).success)throw Object.assign(Error('Espera un momento antes de guardar otra vez.'),{status:429});}
const todayBounds=()=>{const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);return [start.toISOString(),end.toISOString()];};

async function home(env,me){
 const [ws,cycles,groups,students,catechists]=await Promise.all([
  workspace(env),
  supabaseRequest(env,'rest/v1/catechism_cycles?status=eq.active&select=id,name,starts_on,ends_on&order=starts_on.desc&limit=1'),
  supabaseRequest(env,'rest/v1/catechism_groups?active=eq.true&select=id,name,level,weekday,starts_at,ends_at,room_id,cycle_id,program_id&order=name.asc'),
  supabaseRequest(env,'rest/v1/catechism_students?status=eq.active&select=person_id'),
  supabaseRequest(env,'rest/v1/catechism_catechists?active=eq.true&select=person_id')
 ]);
 const [from,to]=todayBounds();
 const sessions=await supabaseRequest(env,`rest/v1/catechism_sessions?starts_at=gte.${encodeURIComponent(from)}&starts_at=lt.${encodeURIComponent(to)}&select=id,title,kind,starts_at,ends_at,status,group_id,room_id&order=starts_at.asc`);
 let pendingDocuments=[];
 if(canWrite(me))pendingDocuments=await supabaseRequest(env,'rest/v1/catechism_student_documents?status=eq.pending&select=id,student_id,document_type,original_filename,uploaded_at&order=uploaded_at.asc&limit=8');
 return {workspace:ws,cycle:cycles[0]||null,metrics:{groups:groups.length,students:students.length,catechists:catechists.length,pendingDocuments:pendingDocuments.length},today:sessions,pendingDocuments,groups:groups.slice(0,8)};
}

async function calendar(env,url){
 const from=url.searchParams.get('from'),to=url.searchParams.get('to');if(!from||!to||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to)))throw Object.assign(Error('Rango de calendario no válido.'),{status:400});
 const sessions=await supabaseRequest(env,`rest/v1/catechism_sessions?starts_at=gte.${encodeURIComponent(from)}&starts_at=lt.${encodeURIComponent(to)}&select=id,title,kind,starts_at,ends_at,status,cancellation_reason,group_id,room_id,replaced_by_session_id&order=starts_at.asc`);
 return {sessions};
}

async function groups(env){
 const rows=await supabaseRequest(env,'rest/v1/catechism_groups?select=id,name,level,weekday,starts_at,ends_at,active,room_id,cycle_id,program_id,catechism_cycles(name,status),catechism_programs(name),catechism_rooms(name,location)&order=name.asc');
 const enrollmentCounts=await supabaseRequest(env,'rest/v1/catechism_enrollments?status=in.(active,paused,pending)&select=group_id');
 const catechists=await supabaseRequest(env,'rest/v1/catechism_group_catechists?active=eq.true&select=group_id,role,catechist_id');
 const counts=new Map();for(const row of enrollmentCounts)counts.set(row.group_id,(counts.get(row.group_id)||0)+1);
 const staff=new Map();for(const row of catechists){if(!staff.has(row.group_id))staff.set(row.group_id,[]);staff.get(row.group_id).push(row);}
 return {groups:rows.map(row=>({...row,student_count:counts.get(row.id)||0,catechists:staff.get(row.id)||[]}))};
}

async function groupDetail(env,id){
 if(!uuid.test(id))throw Object.assign(Error('Grupo no válido.'),{status:400});
 const group=(await supabaseRequest(env,`rest/v1/catechism_groups?id=eq.${id}&select=id,name,level,weekday,starts_at,ends_at,active,room_id,cycle_id,program_id,catechism_cycles(name,status,starts_on,ends_on),catechism_programs(name,description),catechism_rooms(name,location,capacity)&limit=1`))[0];if(!group)throw Object.assign(Error('Grupo no encontrado.'),{status:404});
 const [enrollments,sessions,assignments,topics,catechists,categories]=await Promise.all([
  supabaseRequest(env,`rest/v1/catechism_enrollments?group_id=eq.${id}&select=id,status,enrolled_on,student_id,catechism_students(status,joined_on,person_id,catechism_people(first_name,last_name,preferred_name,birth_date))&order=enrolled_on.asc`),
  supabaseRequest(env,`rest/v1/catechism_sessions?group_id=eq.${id}&select=id,title,kind,starts_at,ends_at,status,cancellation_reason,room_id&order=starts_at.asc&limit=40`),
  supabaseRequest(env,`rest/v1/catechism_assignments?group_id=eq.${id}&select=id,title,kind,status,max_points,due_at,category_id,topic_id&order=due_at.asc.nullslast&limit=40`),
  supabaseRequest(env,`rest/v1/catechism_curriculum_topics?program_id=eq.${group.program_id}&active=eq.true&select=id,code,title,description,sequence,required,estimated_minutes&order=sequence.asc`),
  supabaseRequest(env,`rest/v1/catechism_group_catechists?group_id=eq.${id}&active=eq.true&select=role,catechist_id,catechism_catechists(person_id,profile_id,catechism_people(first_name,last_name,preferred_name,email,phone))`),
  supabaseRequest(env,`rest/v1/catechism_grade_categories?group_id=eq.${id}&select=id,name,weight,drop_lowest,sequence&order=sequence.asc`)
 ]);
 return {group,enrollments,sessions,assignments,topics,catechists,categories};
}

async function students(env,url){
 const q=clean(url.searchParams.get('q')||'',80).toLowerCase();
 const people=await supabaseRequest(env,'rest/v1/catechism_students?select=person_id,status,joined_on,completed_on,baptism_date,baptism_place,catechism_people(first_name,last_name,preferred_name,birth_date,email,phone)&order=created_at.desc&limit=200');
 const enrollments=await supabaseRequest(env,'rest/v1/catechism_enrollments?status=in.(active,paused,pending)&select=id,student_id,group_id,status,enrolled_on,catechism_groups(name,level,cycle_id,program_id)&limit=400');
 const byStudent=new Map();for(const row of enrollments){if(!byStudent.has(row.student_id))byStudent.set(row.student_id,[]);byStudent.get(row.student_id).push(row);}
 let result=people.map(row=>({...row,enrollments:byStudent.get(row.person_id)||[]}));if(q)result=result.filter(row=>{const p=row.catechism_people||{};return `${p.first_name||''} ${p.last_name||''} ${p.preferred_name||''}`.toLowerCase().includes(q);});return {students:result};
}

async function studentDetail(env,id,me){
 if(!uuid.test(id))throw Object.assign(Error('Alumno no válido.'),{status:400});
 const student=(await supabaseRequest(env,`rest/v1/catechism_students?person_id=eq.${id}&select=person_id,status,joined_on,completed_on,baptism_date,baptism_place,pastoral_notes,catechism_people(first_name,last_name,preferred_name,birth_date,email,phone,notes)&limit=1`))[0];if(!student)throw Object.assign(Error('Alumno no encontrado.'),{status:404});
 const [enrollments,contacts,progress,submissions,documents]=await Promise.all([
  supabaseRequest(env,`rest/v1/catechism_enrollments?student_id=eq.${id}&select=id,status,enrolled_on,withdrawn_on,group_id,catechism_groups(name,level,catechism_cycles(name),catechism_programs(name))&order=enrolled_on.desc`),
  supabaseRequest(env,`rest/v1/catechism_student_contacts?student_id=eq.${id}&select=id,relationship,primary_contact,authorized_pickup,person_id,catechism_people(first_name,last_name,preferred_name,email,phone)`),
  supabaseRequest(env,`rest/v1/catechism_student_topic_progress?select=enrollment_id,topic_id,status,completed_at,evidence_type,source_session_id&enrollment_id=in.(${(await supabaseRequest(env,`rest/v1/catechism_enrollments?student_id=eq.${id}&select=id`)).map(x=>x.id).join(',')||'00000000-0000-0000-0000-000000000000'})`),
  supabaseRequest(env,`rest/v1/catechism_submissions?select=id,assignment_id,enrollment_id,status,submitted_at,points,feedback,graded_at,catechism_assignments(title,kind,max_points,due_at)&enrollment_id=in.(${(await supabaseRequest(env,`rest/v1/catechism_enrollments?student_id=eq.${id}&select=id`)).map(x=>x.id).join(',')||'00000000-0000-0000-0000-000000000000'})&order=updated_at.desc&limit=100`),
  canWrite(me)?supabaseRequest(env,`rest/v1/catechism_student_documents?student_id=eq.${id}&select=id,document_type,original_filename,mime_type,file_size,status,expires_on,verified_at,uploaded_at,notes&order=uploaded_at.desc`):Promise.resolve([])
 ]);
 return {student,enrollments,contacts,progress,submissions,documents};
}

async function catechists(env){
 const rows=await supabaseRequest(env,'rest/v1/catechism_catechists?select=person_id,profile_id,active,started_on,ended_on,formation_notes,catechism_people(first_name,last_name,preferred_name,email,phone)&order=created_at.desc');
 const assignments=await supabaseRequest(env,'rest/v1/catechism_group_catechists?active=eq.true&select=group_id,catechist_id,role,catechism_groups(name,level)');
 const byCatechist=new Map();for(const row of assignments){if(!byCatechist.has(row.catechist_id))byCatechist.set(row.catechist_id,[]);byCatechist.get(row.catechist_id).push(row);}
 return {catechists:rows.map(row=>({...row,groups:byCatechist.get(row.person_id)||[]}))};
}

async function createStudent(env,me,input){await requireWrite(env,me);const first=clean(input.first_name,120),last=clean(input.last_name,180);if(!first)throw Object.assign(Error('Escribe el nombre del alumno.'),{status:400});const people=await supabaseRequest(env,'rest/v1/catechism_people',{method:'POST',body:{first_name:first,last_name:last,preferred_name:clean(input.preferred_name,120)||null,birth_date:input.birth_date||null,email:clean(input.email,254)||null,phone:clean(input.phone,40)||null}});const person=people[0];const students=await supabaseRequest(env,'rest/v1/catechism_students',{method:'POST',body:{person_id:person.id,status:input.status||'active',joined_on:input.joined_on||null,baptism_date:input.baptism_date||null,baptism_place:clean(input.baptism_place,200)||null}});if(input.group_id&&uuid.test(input.group_id))await supabaseRequest(env,'rest/v1/catechism_enrollments',{method:'POST',body:{group_id:input.group_id,student_id:person.id,status:'active',enrolled_on:input.joined_on||new Date().toISOString().slice(0,10)}});return {student:students[0],person,message:'Alumno creado.'};}
async function createCatechist(env,me,input){await requireWrite(env,me);const first=clean(input.first_name,120),last=clean(input.last_name,180);if(!first)throw Object.assign(Error('Escribe el nombre del catequista.'),{status:400});const person=(await supabaseRequest(env,'rest/v1/catechism_people',{method:'POST',body:{first_name:first,last_name:last,preferred_name:clean(input.preferred_name,120)||null,email:clean(input.email,254)||null,phone:clean(input.phone,40)||null}}))[0];const catechist=(await supabaseRequest(env,'rest/v1/catechism_catechists',{method:'POST',body:{person_id:person.id,active:true,started_on:input.started_on||null,formation_notes:clean(input.formation_notes,1800)}}))[0];return {catechist,person,message:'Catequista creado.'};}
async function createGroup(env,me,input){await requireWrite(env,me);for(const key of ['cycle_id','program_id'])if(!uuid.test(input[key]||''))throw Object.assign(Error('Selecciona ciclo y programa.'),{status:400});const group=(await supabaseRequest(env,'rest/v1/catechism_groups',{method:'POST',body:{cycle_id:input.cycle_id,program_id:input.program_id,room_id:uuid.test(input.room_id||'')?input.room_id:null,name:clean(input.name,120),level:clean(input.level,120),weekday:Number.isInteger(input.weekday)?input.weekday:null,starts_at:input.starts_at||null,ends_at:input.ends_at||null,active:true}}))[0];return {group,message:'Grupo creado.'};}
async function createSession(env,me,input){await requireWrite(env,me);if(!uuid.test(input.group_id||'')||!input.starts_at||!input.ends_at)throw Object.assign(Error('Completa grupo y horario.'),{status:400});const session=(await supabaseRequest(env,'rest/v1/catechism_sessions',{method:'POST',body:{group_id:input.group_id,room_id:uuid.test(input.room_id||'')?input.room_id:null,title:clean(input.title,160)||'Catecismo',kind:input.kind||'class',starts_at:input.starts_at,ends_at:input.ends_at,status:input.status||'scheduled',notes:clean(input.notes,1800)}}))[0];return {session,message:'Sesión creada.'};}
async function updateSession(env,me,id,input){await requireWrite(env,me);if(!uuid.test(id))throw Object.assign(Error('Sesión no válida.'),{status:400});const patch={};for(const key of ['title','kind','starts_at','ends_at','status','cancellation_reason','notes'])if(input[key]!==undefined)patch[key]=typeof input[key]==='string'?clean(input[key],key==='notes'?1800:240):input[key];if(input.room_id!==undefined)patch.room_id=uuid.test(input.room_id||'')?input.room_id:null;const rows=await supabaseRequest(env,`rest/v1/catechism_sessions?id=eq.${id}`,{method:'PATCH',body:patch});return {session:rows[0],message:patch.status==='cancelled'?'Sesión cancelada.':'Sesión actualizada.'};}
async function setup(env,me){if(!canWrite(me))throw Object.assign(Error('Acceso restringido.'),{status:403});const [cycles,programs,rooms]=await Promise.all([supabaseRequest(env,'rest/v1/catechism_cycles?select=id,name,status,starts_on,ends_on&order=starts_on.desc'),supabaseRequest(env,'rest/v1/catechism_programs?active=eq.true&select=id,name,description&order=name.asc'),supabaseRequest(env,'rest/v1/catechism_rooms?active=eq.true&select=id,name,location,capacity&order=name.asc')]);return {cycles,programs,rooms};}

export async function catechismPlatform(request,env){
 const origin=allowedOrigin(request,env);if(request.method==='OPTIONS'){if(!origin)return new Response(null,{status:403});return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}});}if(!origin)return reply('',403,{message:'Origen no permitido.'});
 const token=bearer(request);if(!token)return reply(origin,401,{message:'Inicia sesión.'});let me;try{me=await supabaseIdentity(env,token);}catch(error){return reply(origin,error.message==='permission'?403:401,{message:'Tu sesión terminó o no tiene acceso.'});}if(!isMember(me))return reply(origin,403,{message:'Tu cuenta no tiene acceso a Catecismo.'});
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
 try{
  if(path==='/backoffice/v2/me'&&request.method==='GET')return reply(origin,200,{user:{id:me.id,name:me.name,email:me.email,role:catechismModule(me).role},profile:await currentProfile(env,me)});
  if(path==='/backoffice/v2/home'&&request.method==='GET')return reply(origin,200,await home(env,me));
  if(path==='/backoffice/v2/calendar'&&request.method==='GET')return reply(origin,200,await calendar(env,url));
  if(path==='/backoffice/v2/groups'&&request.method==='GET')return reply(origin,200,await groups(env));
  const groupRoute=path.match(/^\/backoffice\/v2\/groups\/([a-f0-9-]{36})$/i);if(groupRoute&&request.method==='GET')return reply(origin,200,await groupDetail(env,groupRoute[1]));
  if(path==='/backoffice/v2/students'&&request.method==='GET')return reply(origin,200,await students(env,url));
  const studentRoute=path.match(/^\/backoffice\/v2\/students\/([a-f0-9-]{36})$/i);if(studentRoute&&request.method==='GET')return reply(origin,200,await studentDetail(env,studentRoute[1],me));
  if(path==='/backoffice/v2/catechists'&&request.method==='GET')return reply(origin,200,await catechists(env));
  if(path==='/backoffice/v2/setup'&&request.method==='GET')return reply(origin,200,await setup(env,me));
  if(path==='/backoffice/v2/students'&&request.method==='POST')return reply(origin,201,await createStudent(env,me,await body(request)));
  if(path==='/backoffice/v2/catechists'&&request.method==='POST')return reply(origin,201,await createCatechist(env,me,await body(request)));
  if(path==='/backoffice/v2/groups'&&request.method==='POST')return reply(origin,201,await createGroup(env,me,await body(request)));
  if(path==='/backoffice/v2/sessions'&&request.method==='POST')return reply(origin,201,await createSession(env,me,await body(request)));
  const sessionRoute=path.match(/^\/backoffice\/v2\/sessions\/([a-f0-9-]{36})$/i);if(sessionRoute&&request.method==='PATCH')return reply(origin,200,await updateSession(env,me,sessionRoute[1],await body(request)));
  return reply(origin,404,{message:'Ruta no disponible.'});
 }catch(error){return reply(origin,error.status||500,{message:error.message||'No pudimos completar la operación.'});}
}
