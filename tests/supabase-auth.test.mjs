import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAuth} from '../api/supabase-auth.mjs';

const env={
 SUPABASE_URL:'https://example.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'server-secret',
 ALLOWED_ORIGINS:'https://la-comarca.github.io',
 FORM_LIMIT:{limit:async()=>({success:true})}
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('rejects auth from unapproved origins',async()=>{
 const response=await supabaseAuth(new Request('https://comarca.kipadmon.com/auth/me',{headers:{Origin:'https://evil.example',Authorization:'Bearer x'}}),env);
 assert.equal(response.status,403);
});

test('signs in with Supabase Auth and resolves memberships',async()=>{
 const original=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  calls.push([String(url),options]);
  const u=String(url);
  if(u.includes('/auth/v1/token?grant_type=password'))return json({access_token:'access',refresh_token:'refresh',expires_in:3600,token_type:'bearer'});
  if(u.endsWith('/auth/v1/user'))return json({id:'11111111-1111-1111-1111-111111111111',email:'admin@example.com',user_metadata:{display_name:'Admin'}});
  if(u.includes('/rest/v1/profiles?auth_user_id='))return json([]);
  if(u.includes('/rest/v1/profiles?email='))return json([{id:'22222222-2222-2222-2222-222222222222',email:'admin@example.com',display_name:'Andrea',auth_user_id:null}]);
  if(u.includes('/rest/v1/profiles?id=eq.'))return json([{id:'22222222-2222-2222-2222-222222222222',email:'admin@example.com',display_name:'Andrea',auth_user_id:'11111111-1111-1111-1111-111111111111'}]);
  if(u.includes('/rest/v1/workspace_memberships?'))return json([{role:'admin',scope:{},workspaces:{key:'agenda',name:'Agenda',description:'Actividades',active:true}}]);
  throw Error('Unexpected fetch '+u);
 };
 try{
  const request=new Request('https://comarca.kipadmon.com/auth/token',{method:'POST',headers:{Origin:'https://la-comarca.github.io','Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify({email:'admin@example.com',password:'password1234'})});
  const response=await supabaseAuth(request,env),data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.user.name,'Andrea');
  assert.equal(data.user.modules[0].key,'agenda');
  assert.equal(data.access_token,'access');
  assert.ok(calls.some(([url])=>url.includes('/auth/v1/token?grant_type=password')));
 }finally{globalThis.fetch=original;}
});

test('does not attach a Supabase identity to a profile already linked elsewhere',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes('/auth/v1/token?grant_type=password'))return json({access_token:'access',refresh_token:'refresh',expires_in:3600});
  if(u.endsWith('/auth/v1/user'))return json({id:'11111111-1111-1111-1111-111111111111',email:'admin@example.com'});
  if(u.includes('/rest/v1/profiles?auth_user_id='))return json([]);
  if(u.includes('/rest/v1/profiles?email='))return json([{id:'22222222-2222-2222-2222-222222222222',email:'admin@example.com',display_name:'Andrea',auth_user_id:'33333333-3333-3333-3333-333333333333'}]);
  throw Error('Unexpected fetch '+u);
 };
 try{
  const request=new Request('https://comarca.kipadmon.com/auth/token',{method:'POST',headers:{Origin:'https://la-comarca.github.io','Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify({email:'admin@example.com',password:'password1234'})});
  const response=await supabaseAuth(request,env),data=await response.json();
  assert.equal(response.status,403);
  assert.match(data.message,/acceso/);
 }finally{globalThis.fetch=original;}
});
