import test from 'node:test';
import assert from 'node:assert/strict';
import {catechistOnboarding} from '../api/catechist-onboarding.mjs';

const request=body=>new Request('https://comarca.kipadmon.com/backoffice/v2/catechists',{method:'POST',headers:{Origin:'https://la-comarca.github.io',Authorization:'Bearer access','Content-Type':'application/json'},body:JSON.stringify(body)});
const created=()=>Response.json({person:{id:'11111111-1111-4111-8111-111111111111'},catechist:{person_id:'11111111-1111-4111-8111-111111111111'},message:'Catequista creado.'},{status:201,headers:{'Access-Control-Allow-Origin':'https://la-comarca.github.io'}});

test('creating a catechist with email provisions access and reports emailed invitation',async()=>{
 let provisioned=null;
 const response=await catechistOnboarding(request({first_name:'Ana',last_name:'Pérez',email:'ANA@example.com'}),{}, {platform:async()=>created(),provision:async(_env,input)=>{provisioned=input;return {invited:true,profileId:'p'};}});
 assert.equal(response.status,201);assert.deepEqual(provisioned,{email:'ana@example.com',name:'Ana Pérez',personId:'11111111-1111-4111-8111-111111111111'});
 const data=await response.json();assert.equal(data.onboarding.status,'invited');assert.match(data.message,/Invitación enviada/i);
});

test('creating a catechist without email keeps a profile-only record and sends nothing',async()=>{
 let called=false;
 const response=await catechistOnboarding(request({first_name:'Ana',last_name:'Pérez'}),{}, {platform:async()=>created(),provision:async()=>{called=true;}});
 assert.equal(response.status,201);assert.equal(called,false);assert.equal((await response.json()).message,'Catequista creado.');
});

test('an email delivery failure never deletes the catechist record and returns a clear retry path',async()=>{
 const response=await catechistOnboarding(request({first_name:'Ana',email:'ana@example.com'}),{}, {platform:async()=>created(),provision:async()=>{throw Error('mail failed');}});
 assert.equal(response.status,201);const data=await response.json();assert.equal(data.onboarding.status,'failed');assert.match(data.message,/Catequista creado/);assert.match(data.message,/Accesos del equipo/);
});
