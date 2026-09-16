import test from 'node:test';
import assert from 'node:assert/strict';
import {catechismOps} from '../api/catechism-ops.mjs';
import {backofficeHTML} from '../scripts/backoffice.mjs';

const env={ALLOWED_ORIGINS:'https://la-comarca.github.io'};
const ids={profile:'11111111-1111-4111-8111-111111111111',catechist:'22222222-2222-4222-8222-222222222222',group:'33333333-3333-4333-8333-333333333333',session:'44444444-4444-4444-8444-444444444444',enrollment:'55555555-5555-4555-8555-555555555555',series:'66666666-6666-4666-8666-666666666666'};
const request=(path,options={})=>new Request('https://comarca.kipadmon.com'+path,{...options,headers:{Origin:'https://la-comarca.github.io',Authorization:'Bearer test-token','Content-Type':'application/json',...(options.headers||{})}});

test('ops shell loads attendance/account/series layer',()=>{const html=backofficeHTML('/','ops-test');assert.match(html,/backoffice-ops\.css\?v=ops-test-ops1/);assert.match(html,/backoffice-ops\.js\?v=ops-test-ops1/);});

test('assigned catechist can save attendance only for own group roster',async()=>{
 const writes=[];
 const db=async(_env,path,options={})=>{
  if(path.startsWith('rest/v1/profiles?'))return [{id:ids.profile}];
  if(path.includes('catechism_catechists?profile_id='))return [{person_id:ids.catechist}];
  if(path.includes('catechism_group_catechists?catechist_id='))return [{group_id:ids.group}];
  if(path.includes(`catechism_sessions?id=eq.${ids.session}`))return [{id:ids.session,group_id:ids.group,title:'Clase'}];
  if(path.includes(`catechism_enrollments?group_id=eq.${ids.group}`))return [{id:ids.enrollment}];
  if(path==='rest/v1/catechism_attendance'&&options.method==='POST'){writes.push(options.body);return options.body;}
  return [];
 };
 const identity=async()=>({id:'auth-user',modules:[{key:'catecismo',role:'catechist'}]});
 const response=await catechismOps(request(`/backoffice/ops/sessions/${ids.session}/attendance`,{method:'PATCH',body:JSON.stringify({records:[{enrollment_id:ids.enrollment,status:'present',note:'Llegó a tiempo'}]})}),env,{db,identity});
 assert.equal(response.status,200);assert.equal((await response.json()).saved,1);assert.equal(writes[0][0].status,'present');assert.equal(writes[0][0].updated_by,ids.profile);
});

test('reader cannot save attendance',async()=>{
 const identity=async()=>({id:'reader-user',modules:[{key:'catecismo',role:'reader'}]});
 const db=async()=>{throw Error('reader should be rejected before database mutation');};
 const response=await catechismOps(request(`/backoffice/ops/sessions/${ids.session}/attendance`,{method:'PATCH',body:JSON.stringify({records:[{enrollment_id:ids.enrollment,status:'present'}]})}),env,{db,identity});
 assert.equal(response.status,403);
});

test('attendance rejects unsupported status',async()=>{
 const db=async(_env,path)=>{
  if(path.startsWith('rest/v1/profiles?'))return [{id:ids.profile}];
  if(path.includes('catechism_catechists?profile_id='))return [{person_id:ids.catechist}];
  if(path.includes('catechism_group_catechists?catechist_id='))return [{group_id:ids.group}];
  if(path.includes(`catechism_sessions?id=eq.${ids.session}`))return [{id:ids.session,group_id:ids.group}];
  if(path.includes(`catechism_enrollments?group_id=eq.${ids.group}`))return [{id:ids.enrollment}];
  return [];
 };
 const identity=async()=>({id:'auth-user',modules:[{key:'catecismo',role:'catechist'}]});
 const response=await catechismOps(request(`/backoffice/ops/sessions/${ids.session}/attendance`,{method:'PATCH',body:JSON.stringify({records:[{enrollment_id:ids.enrollment,status:'magic'}]})}),env,{db,identity});
 assert.equal(response.status,400);
});

test('admin can create a recurring class series and generated sessions',async()=>{
 let sessions=[];
 const db=async(_env,path,options={})=>{
  if(path.includes(`catechism_groups?id=eq.${ids.group}`))return [{id:ids.group,room_id:null}];
  if(path==='rest/v1/catechism_session_series'&&options.method==='POST')return [{id:ids.series,...options.body}];
  if(path==='rest/v1/catechism_sessions'&&options.method==='POST'){sessions=options.body;return sessions;}
  return [];
 };
 const identity=async()=>({id:'admin-user',modules:[{key:'catecismo',role:'admin'}]});
 const body={group_id:ids.group,title:'Catecismo',kind:'class',first_starts_at:'2026-09-19T16:00:00.000Z',first_ends_at:'2026-09-19T17:30:00.000Z',starts_on:'2026-09-19',start_time:'10:00',end_time:'11:30',weekday:6,ends_on:'2026-10-17',interval_weeks:1};
 const response=await catechismOps(request('/backoffice/ops/session-series',{method:'POST',body:JSON.stringify(body)}),env,{db,identity});
 const data=await response.json();assert.equal(response.status,201);assert.equal(data.count,5);assert.equal(sessions.length,5);assert.ok(sessions.every(row=>row.series_id===ids.series));
});
