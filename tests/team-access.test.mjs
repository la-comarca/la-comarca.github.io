import test from 'node:test';
import assert from 'node:assert/strict';
import {teamAccess} from '../api/team-access.mjs';

const env={ALLOWED_ORIGINS:'https://la-comarca.github.io',FORM_LIMIT:{limit:async()=>({success:true})}};
const request=(path,{method='GET',body,origin='https://la-comarca.github.io'}={})=>new Request('https://comarca.kipadmon.com'+path,{method,headers:{Origin:origin,Authorization:'Bearer token',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});

test('access administration rejects unapproved origins before authentication',async()=>{
 let called=false;const response=await teamAccess(request('/backoffice/v2/access',{origin:'https://evil.example'}),env,{identity:async()=>{called=true;return null;}});
 assert.equal(response.status,403);assert.equal(called,false);
});

test('catechists cannot administer team access',async()=>{
 const identity={id:'11111111-1111-4111-8111-111111111111',modules:[{key:'catecismo',role:'catechist'}]};
 const response=await teamAccess(request('/backoffice/v2/access'),env,{identity:async()=>identity});
 assert.equal(response.status,403);assert.match((await response.json()).message,/administrar accesos/i);
});

test('coordinators cannot promote someone to administrator',async()=>{
 const identity={id:'11111111-1111-4111-8111-111111111111',modules:[{key:'catecismo',role:'coordinator'}]};
 const response=await teamAccess(request('/backoffice/v2/access/invite',{method:'POST',body:{name:'Otra persona',email:'persona@example.com',role:'admin'}}),env,{identity:async()=>identity});
 assert.equal(response.status,400);assert.match((await response.json()).message,/nivel de acceso/i);
});
