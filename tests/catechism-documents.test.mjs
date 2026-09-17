import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {File} from 'node:buffer';
import {catechismDocuments} from '../api/catechism-documents.mjs';
import {backofficeHTML} from '../scripts/backoffice.mjs';

const origin='https://la-comarca.github.io';
const env={ALLOWED_ORIGINS:origin};
const ids={student:'11111111-1111-4111-8111-111111111111',document:'22222222-2222-4222-8222-222222222222'};
const request=(path,options={})=>new Request('https://comarca.kipadmon.com'+path,{...options,headers:{Origin:origin,Authorization:'Bearer test-token',...(options.headers||{})}});

test('back office loads secure document assets',()=>{
 const html=backofficeHTML('/','docs-test');
 assert.match(html,/backoffice-documents\.css\?v=docs-test-docs1/);
 assert.match(html,/backoffice-documents\.js\?v=docs-test-docs1/);
});

test('Wrangler routes document endpoints through Worker',async()=>{
 const text=await readFile(new URL('../api/wrangler.jsonc',import.meta.url),'utf8');
 assert.match(text,/"\/backoffice\/documents\/\*"/);
 assert.match(text,/"main": "worker-entry\.mjs"/);
});

test('document batch migration keeps files separate from GitHub and behind private metadata',async()=>{
 const text=await readFile(new URL('../supabase/migrations/0004_catechism_document_batches.sql',import.meta.url),'utf8');
 assert.match(text,/create table if not exists public\.catechism_document_batches/);
 assert.match(text,/catechism_document_batch_items/);
 assert.match(text,/admin','coordinator/);
});

test('catechist cannot list private student documents',async()=>{
 const identity=async()=>({id:'auth-catechist',modules:[{key:'catecismo',role:'catechist'}]});
 const db=async()=>{throw Error('database must not be touched for forbidden role');};
 const response=await catechismDocuments(request(`/backoffice/documents/students/${ids.student}`),env,{identity,db});
 assert.equal(response.status,403);
});

test('admin can list document metadata for an existing student',async()=>{
 const identity=async()=>({id:'auth-admin',modules:[{key:'catecismo',role:'admin'}]});
 const db=async(_env,path)=>{
  if(path.includes(`catechism_students?person_id=eq.${ids.student}`))return [{person_id:ids.student,catechism_people:{first_name:'Ana',last_name:'Demo'}}];
  if(path.includes(`catechism_student_documents?student_id=eq.${ids.student}`))return [{id:ids.document,student_id:ids.student,document_type:'birth_certificate',original_filename:'acta.pdf',mime_type:'application/pdf',file_size:100,status:'verified'}];
  return [];
 };
 const response=await catechismDocuments(request(`/backoffice/documents/students/${ids.student}`),env,{identity,db});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.documents.length,1);assert.equal(data.documents[0].original_filename,'acta.pdf');
});

test('upload rejects a file whose bytes do not match its declared PDF mime type',async()=>{
 const identity=async()=>({id:'auth-admin',modules:[{key:'catecismo',role:'admin'}]});
 const db=async(_env,path)=>path.includes(`catechism_students?person_id=eq.${ids.student}`)?[{person_id:ids.student}]:[];
 const form=new FormData();form.set('document_type','birth_certificate');form.set('file',new File([new TextEncoder().encode('this is not a pdf')],'acta.pdf',{type:'application/pdf'}));
 const response=await catechismDocuments(request(`/backoffice/documents/students/${ids.student}/upload`,{method:'POST',body:form}),env,{identity,db});
 assert.equal(response.status,400);assert.match((await response.json()).message,/contenido del archivo/i);
});
