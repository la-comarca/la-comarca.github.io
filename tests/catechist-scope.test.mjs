import test from 'node:test';
import assert from 'node:assert/strict';
import {catechismPlatform} from '../api/catechism-platform.mjs';

const AUTH_ID='11111111-1111-4111-8111-111111111111';
const PROFILE_ID='22222222-2222-4222-8222-222222222222';
const CATECHIST_ID='33333333-3333-4333-8333-333333333333';
const GROUP_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GROUP_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}

test('catechist sees only assigned groups even though server credentials can read all rows',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.endsWith('/auth/v1/user'))return json({id:AUTH_ID,email:'catequista@example.com',user_metadata:{display_name:'Catequista'}});
  if(url.includes('/rest/v1/profiles?auth_user_id='))return json([{id:PROFILE_ID,email:'catequista@example.com',display_name:'Catequista',auth_user_id:AUTH_ID}]);
  if(url.includes('/rest/v1/workspace_memberships?user_id='))return json([{role:'catechist',scope:{},workspaces:{key:'catecismo',name:'Catecismo',description:'',active:true}}]);
  if(url.includes('/rest/v1/catechism_catechists?profile_id='))return json([{person_id:CATECHIST_ID}]);
  if(url.includes('/rest/v1/catechism_group_catechists?catechist_id='))return json([{group_id:GROUP_A}]);
  if(url.includes('/rest/v1/catechism_groups?select='))return json([
   {id:GROUP_A,name:'Grupo asignado',level:'1',active:true},
   {id:GROUP_B,name:'Grupo ajeno',level:'2',active:true}
  ]);
  if(url.includes('/rest/v1/catechism_enrollments?status='))return json([{group_id:GROUP_A},{group_id:GROUP_B}]);
  if(url.includes('/rest/v1/catechism_group_catechists?active=eq.true&select=group_id,role,catechist_id'))return json([{group_id:GROUP_A,catechist_id:CATECHIST_ID,role:'catechist'},{group_id:GROUP_B,catechist_id:'44444444-4444-4444-8444-444444444444',role:'catechist'}]);
  throw new Error('Unexpected request: '+url);
 };
 try{
  const env={ALLOWED_ORIGINS:'https://la-comarca.github.io',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-secret'};
  const request=new Request('https://comarca.kipadmon.com/backoffice/v2/groups',{headers:{Origin:'https://la-comarca.github.io',Authorization:'Bearer user-token'}});
  const response=await catechismPlatform(request,env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.groups.map(group=>group.id),[GROUP_A]);
  assert.equal(data.groups[0].name,'Grupo asignado');
 }finally{globalThis.fetch=originalFetch;}
});

test('catechist cannot open an unassigned group by guessing its id',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.endsWith('/auth/v1/user'))return json({id:AUTH_ID,email:'catequista@example.com'});
  if(url.includes('/rest/v1/profiles?auth_user_id='))return json([{id:PROFILE_ID,email:'catequista@example.com',display_name:'Catequista',auth_user_id:AUTH_ID}]);
  if(url.includes('/rest/v1/workspace_memberships?user_id='))return json([{role:'catechist',scope:{},workspaces:{key:'catecismo',name:'Catecismo',description:'',active:true}}]);
  if(url.includes('/rest/v1/catechism_catechists?profile_id='))return json([{person_id:CATECHIST_ID}]);
  if(url.includes('/rest/v1/catechism_group_catechists?catechist_id='))return json([{group_id:GROUP_A}]);
  throw new Error('Unexpected request: '+url);
 };
 try{
  const env={ALLOWED_ORIGINS:'https://la-comarca.github.io',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'server-secret'};
  const request=new Request(`https://comarca.kipadmon.com/backoffice/v2/groups/${GROUP_B}`,{headers:{Origin:'https://la-comarca.github.io',Authorization:'Bearer user-token'}});
  const response=await catechismPlatform(request,env);
  assert.equal(response.status,404);
 }finally{globalThis.fetch=originalFetch;}
});
