import test from 'node:test';
import assert from 'node:assert/strict';
import {backoffice} from '../api/backoffice.mjs';

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

test('back office delegates Catecismo records but refuses unrelated modules',async()=>{
 let called=0;const dependencies={authenticate:async()=>identity,records:async(_request,_env,_user,key)=>{called++;return {records:[],nextCursor:null,key};}};
 const allowed=await backoffice(request('/backoffice/api/records/students'),env,fetch,dependencies);assert.equal(allowed.status,200);assert.equal(called,1);
 const blocked=await backoffice(request('/backoffice/api/records/materials'),env,fetch,dependencies);assert.equal(blocked.status,404);assert.equal(called,1);
});

test('back office requires a Catecismo membership even with a valid identity',async()=>{
 const user={...identity,modules:[{key:'agenda',role:'admin'}]};const response=await backoffice(request('/backoffice/api/me'),env,fetch,{authenticate:async()=>user});
 assert.equal(response.status,403);assert.match((await response.json()).message,/Catecismo/);
});
