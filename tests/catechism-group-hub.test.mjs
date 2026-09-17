import test from 'node:test';
import assert from 'node:assert/strict';
import {backofficeHTML} from '../scripts/backoffice.mjs';
import {catechismHub} from '../api/catechism-hub.mjs';
import {catechismHubExtra} from '../api/catechism-hub-extra.mjs';

const env={ALLOWED_ORIGINS:'https://la-comarca.github.io'};
const ids={profile:'11111111-1111-4111-8111-111111111111',catechist:'22222222-2222-4222-8222-222222222222',group:'33333333-3333-4333-8333-333333333333',student:'44444444-4444-4444-8444-444444444444',enrollment:'55555555-5555-4555-8555-555555555555'};
const request=(path,options={})=>new Request('https://comarca.kipadmon.com'+path,{...options,headers:{Origin:'https://la-comarca.github.io',Authorization:'Bearer test-token','Content-Type':'application/json',...(options.headers||{})}});

test('back office loads the group hub UI assets',()=>{const html=backofficeHTML('/','hub-test');assert.match(html,/backoffice-group-hub\.css\?v=hub-test-hub1/);assert.match(html,/backoffice-group-hub\.js\?v=hub-test-hub1/);});

test('catechist with calendar permission can create a class only in an assigned group',async()=>{
 const writes=[];
 const db=async(_env,path,options={})=>{
  if(path.startsWith('rest/v1/profiles?'))return [{id:ids.profile}];
  if(path.includes('catechism_catechists?profile_id='))return [{person_id:ids.catechist}];
  if(path.includes('catechism_group_catechists?catechist_id='))return [{group_id:ids.group}];
  if(path.includes(`catechism_groups?id=eq.${ids.group}`))return [{id:ids.group,room_id:null}];
  if(path==='rest/v1/catechism_sessions'&&options.method==='POST'){writes.push(options.body);return [{id:'66666666-6666-4666-8666-666666666666',...options.body}];}
  return [];
 };
 const identity=async()=>({id:'auth-user',modules:[{key:'catecismo',role:'catechist',scope:{permissions:{calendar:true}}}]});
 const response=await catechismHubExtra(request(`/backoffice/hub/groups/${ids.group}/sessions`,{method:'POST',body:JSON.stringify({title:'Clase demo',kind:'class',starts_at:'2026-09-19T16:00:00.000Z',ends_at:'2026-09-19T17:30:00.000Z'})}),env,{db,identity});
 assert.equal(response.status,201);assert.equal(writes.length,1);assert.equal(writes[0].group_id,ids.group);
});

test('catechist without calendar permission cannot create a class',async()=>{
 const identity=async()=>({id:'auth-user',modules:[{key:'catecismo',role:'catechist',scope:{permissions:{calendar:false}}}]});
 const response=await catechismHubExtra(request(`/backoffice/hub/groups/${ids.group}/sessions`,{method:'POST',body:JSON.stringify({starts_at:'2026-09-19T16:00:00.000Z',ends_at:'2026-09-19T17:30:00.000Z'})}),env,{db:async()=>[],identity});
 assert.equal(response.status,403);
});

test('reader cannot be assigned operational permissions',async()=>{
 const db=async(_env,path)=>{
  if(path.includes('workspaces?key=eq.catecismo'))return [{id:'77777777-7777-4777-8777-777777777777'}];
  if(path.includes('workspace_memberships?workspace_id='))return [{user_id:ids.profile,role:'reader',scope:{}}];
  return [];
 };
 const identity=async()=>({id:'admin-user',modules:[{key:'catecismo',role:'admin',scope:{}}]});
 const response=await catechismHubExtra(request(`/backoffice/hub/access/${ids.profile}/permissions`,{method:'PATCH',body:JSON.stringify({permissions:{grades:true}})}),env,{db,identity});
 assert.equal(response.status,400);
});

test('assigned catechist can open only its group hub and sees resolved permissions',async()=>{
 const db=async(_env,path)=>{
  if(path.startsWith('rest/v1/profiles?'))return [{id:ids.profile}];
  if(path.includes('catechism_catechists?profile_id='))return [{person_id:ids.catechist}];
  if(path.includes('catechism_group_catechists?catechist_id='))return [{group_id:ids.group}];
  if(path.includes(`catechism_groups?id=eq.${ids.group}`))return [{id:ids.group,name:'DEMO',program_id:'88888888-8888-4888-8888-888888888888'}];
  return [];
 };
 const identity=async()=>({id:'auth-user',modules:[{key:'catecismo',role:'catechist',scope:{permissions:{attendance:true,content:true}}}]});
 const response=await catechismHub(request(`/backoffice/hub/groups/${ids.group}`),env,{db,identity});const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.group.id,ids.group);assert.equal(data.permissions.attendance,true);assert.equal(data.permissions.content,true);assert.equal(data.permissions.grades,false);
});
