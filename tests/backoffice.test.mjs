import test from 'node:test';
import assert from 'node:assert/strict';
import {backoffice} from '../api/backoffice.mjs';
import {modules} from '../api/cms-records.mjs';

const env={ALLOWED_ORIGINS:'https://la-comarca.github.io',CMS_CONNECTED_MODULES:'students,attendance,lessons,grades,topics,shifts,materials',FORM_LIMIT:{limit:async()=>({success:true})}};
const identity={id:'11111111-1111-1111-1111-111111111111',name:'Administrador',email:'admin@example.com',modules:[{key:'catecismo',role:'admin'}]};
const request=(path,{method='GET',body,origin='https://la-comarca.github.io'}={})=>new Request('https://comarca.kipadmon.com'+path,{method,headers:{Origin:origin,Authorization:'Bearer access',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});

test('back office rejects unapproved origins before authentication',async()=>{
 let authenticated=false;const response=await backoffice(request('/backoffice/api/me',{origin:'https://evil.example'}),env,fetch,{authenticate:async()=>{authenticated=true;return identity;}});
 assert.equal(response.status,403);assert.equal(authenticated,false);
});

test('back office exposes only Catecismo schema to authorized users',async()=>{
 const response=await backoffice(request('/backoffice/api/schema'),env,fetch,{authenticate:async()=>identity});
 assert.equal(response.status,200);const data=await response.json();
 assert.deepEqual(data.modules.map(module=>module.key),['students','attendance','lessons','grades','topics','shifts']);
 assert.equal(data.modules.find(module=>module.key==='shifts').fields.some(field=>field.name==='Necesita ride'),false);
 assert.ok(data.modules.every(module=>module.canWrite===true));
});

test('record list applies approved filters and sorting while unrelated modules stay unavailable',async()=>{
 let queryBody;const fetcher=async(url,options={})=>{
  if(String(url).includes('/data_sources/'+modules.students.id+'/query')){queryBody=JSON.parse(options.body);return Response.json({results:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',last_edited_time:'2026-09-16T12:00:00.000Z',properties:{Alumno:{title:[{plain_text:'Ana'}]},Estatus:{select:{name:'Activo'}},'Grupo o nivel':{rich_text:[{plain_text:'1º'}]},Edad:{number:10},'Catequista referente':{rich_text:[{plain_text:'María'}]}}}],has_more:false,next_cursor:null});}
  throw Error('Unexpected fetch '+url);
 };
 const allowed=await backoffice(request('/backoffice/api/records/students?filter=Estatus%3AActivo&sort=Alumno&direction=ascending'),env,fetcher,{authenticate:async()=>identity});
 assert.equal(allowed.status,200);const data=await allowed.json();assert.equal(data.records[0].values.Alumno,'Ana');
 assert.deepEqual(queryBody.filter,{property:'Estatus',select:{equals:'Activo'}});assert.deepEqual(queryBody.sorts,[{property:'Alumno',direction:'ascending'}]);
 const blocked=await backoffice(request('/backoffice/api/records/materials'),env,fetcher,{authenticate:async()=>identity});assert.equal(blocked.status,404);
});

test('related-record smart buttons are scoped to Catecismo relations',async()=>{
 const studentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let relationQueries=0;
 const fetcher=async(url,options={})=>{
  const value=String(url);
  if(value.endsWith('/pages/'+studentId))return Response.json({id:studentId,archived:false,in_trash:false,parent:{data_source_id:modules.students.id},properties:{Alumno:{title:[{plain_text:'Ana'}]}}});
  if(value.includes('/data_sources/'+modules.attendance.id+'/query')){relationQueries++;const body=JSON.parse(options.body);assert.equal(body.filter.property,'Alumno');return Response.json({results:[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',last_edited_time:'2026-09-16T12:00:00.000Z',properties:{Registro:{title:[{plain_text:'Ana · Sesión 1'}]}}}],has_more:false});}
  if(value.includes('/data_sources/'+modules.grades.id+'/query')){relationQueries++;return Response.json({results:[],has_more:false});}
  throw Error('Unexpected fetch '+url);
 };
 const response=await backoffice(request('/backoffice/api/related/students/'+studentId),env,fetcher,{authenticate:async()=>identity});
 assert.equal(response.status,200);const data=await response.json();assert.equal(relationQueries,2);assert.equal(data.related.find(group=>group.key==='attendance').count,1);assert.equal(data.related.find(group=>group.key==='grades').count,0);
});

test('back office requires a Catecismo membership even with a valid identity',async()=>{
 const user={...identity,modules:[{key:'agenda',role:'admin'}]};const response=await backoffice(request('/backoffice/api/me'),env,fetch,{authenticate:async()=>user});
 assert.equal(response.status,403);assert.match((await response.json()).message,/Catecismo/);
});
