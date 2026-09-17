import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {catechismDocuments} from '../api/catechism-documents.mjs';

const origin='https://la-comarca.github.io';
const ids={
 student:'11111111-1111-4111-8111-111111111111',
 group:'33333333-3333-4333-8333-333333333333',
 cycle:'44444444-4444-4444-8444-444444444444',
 profile:'55555555-5555-4555-8555-555555555555',
 workspace:'66666666-6666-4666-8666-666666666666',
 batch:'77777777-7777-4777-8777-777777777777'
};
const env={ALLOWED_ORIGINS:origin,SUPABASE_URL:'https://fake.supabase.co',SUPABASE_SECRET_KEY:'test-service-key'};
const identity=async()=>({id:'auth-admin',email:'admin@example.test',modules:[{key:'catecismo',role:'admin'}]});
const request=(path,options={})=>new Request('https://comarca.kipadmon.com'+path,{...options,headers:{Origin:origin,Authorization:'Bearer e2e-token',...(options.headers||{})}});

const nestedStudent={person_id:ids.student,status:'active',catechism_people:{first_name:'Ana',last_name:'Demo',preferred_name:''}};

function memoryDatabase(){
 const documents=new Map(),batches=new Map(),batchItems=[];
 const now=()=>new Date().toISOString();
 const projectDocument=(doc,path)=>{
  if(path.includes('storage_path'))return {...doc};
  const {storage_path,...safe}=doc;return safe;
 };
 const db=async(_env,path,{method='GET',body}={})=>{
  if(path.startsWith('rest/v1/profiles?auth_user_id='))return [{id:ids.profile,email:'admin@example.test',display_name:'Admin E2E'}];
  if(path.startsWith('rest/v1/workspaces?key=eq.catecismo'))return [{id:ids.workspace,key:'catecismo'}];
  if(path==='rest/v1/audit_events'&&method==='POST')return [{id:crypto.randomUUID(),...body}];

  if(path.startsWith(`rest/v1/catechism_students?person_id=eq.${ids.student}`))return [nestedStudent];
  if(path.startsWith('rest/v1/catechism_students?person_id=in.('))return [nestedStudent];

  if(path==='rest/v1/catechism_student_documents'&&method==='POST'){
   const row={...body,uploaded_at:now(),verified_at:null};documents.set(row.id,row);return [{...row}];
  }
  if(path.startsWith(`rest/v1/catechism_student_documents?student_id=eq.${ids.student}`))return [...documents.values()].map(doc=>projectDocument(doc,path));
  if(path.startsWith('rest/v1/catechism_student_documents?id=eq.')){
   const id=path.match(/id=eq\.([a-f0-9-]{36})/i)?.[1],doc=documents.get(id);if(!doc)return [];
   if(method==='PATCH'){const updated={...doc,...body};documents.set(id,updated);return [{...updated}];}
   return [projectDocument(doc,path)];
  }
  if(path.startsWith('rest/v1/catechism_student_documents?student_id=in.(')){
   return [...documents.values()].filter(doc=>['pending','verified'].includes(doc.status)).map(doc=>projectDocument(doc,path));
  }
  if(path.startsWith('rest/v1/catechism_student_documents?id=in.(')){
   const inside=path.match(/id=in\.\(([^)]+)\)/)?.[1]||'',wanted=new Set(inside.split(','));
   return [...documents.values()].filter(doc=>wanted.has(doc.id)).map(doc=>projectDocument(doc,path));
  }

  if(path.startsWith(`rest/v1/catechism_groups?id=eq.${ids.group}`))return [{id:ids.group,name:'DEMO · Confirmación A',cycle_id:ids.cycle}];
  if(path.startsWith(`rest/v1/catechism_enrollments?group_id=eq.${ids.group}`)){
   if(path.includes('catechism_students'))return [{student_id:ids.student,catechism_students:nestedStudent}];
   return [{student_id:ids.student}];
  }

  if(path==='rest/v1/catechism_document_batches'&&method==='POST'){
   const row={id:ids.batch,...body,created_at:now(),updated_at:now(),catechism_groups:{name:'DEMO · Confirmación A'},catechism_cycles:{name:'DEMO · Ciclo'}};
   batches.set(row.id,row);return [{...row}];
  }
  if(path.startsWith('rest/v1/catechism_document_batches?id=eq.')){
   const id=path.match(/id=eq\.([a-f0-9-]{36})/i)?.[1],row=batches.get(id);if(!row)return [];
   if(method==='PATCH'){const updated={...row,...body};batches.set(id,updated);return [{...updated}];}
   return [{...row}];
  }
  if(path.startsWith('rest/v1/catechism_document_batches?select='))return [...batches.values()].map(x=>({...x}));

  if(path==='rest/v1/catechism_document_batch_items'&&method==='POST'){
   const rows=Array.isArray(body)?body:[body];
   for(const row of rows){const doc=documents.get(row.document_id);for(let i=batchItems.length-1;i>=0;i--){const old=documents.get(batchItems[i].document_id);if(batchItems[i].batch_id===row.batch_id&&old?.student_id===doc?.student_id&&old?.document_type===doc?.document_type)batchItems.splice(i,1);}if(!batchItems.some(x=>x.batch_id===row.batch_id&&x.document_id===row.document_id))batchItems.push({...row,added_at:now()});}
   return rows;
  }
  if(path.startsWith(`rest/v1/catechism_document_batch_items?batch_id=eq.${ids.batch}`))return batchItems.filter(x=>x.batch_id===ids.batch).map(x=>({...x}));
  if(path.startsWith('rest/v1/catechism_document_batch_items?select='))return batchItems.map(x=>({...x}));

  throw new Error(`Unhandled E2E DB path: ${method} ${path}`);
 };
 return {db,documents,batches,batchItems};
}

test('E2E: private PDF -> verified expediente -> diocesan batch -> ZIP export',async()=>{
 const memory=memoryDatabase(),objects=new Map(),originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const value=String(url),prefix='https://fake.supabase.co/storage/v1/object/catechism-private/';
  if(!value.startsWith(prefix))throw new Error(`Unexpected network request: ${value}`);
  const storagePath=value.slice(prefix.length).split('/').map(decodeURIComponent).join('/'),method=options.method||'GET';
  if(method==='POST'){
   const bytes=new Uint8Array(await options.body.arrayBuffer());objects.set(storagePath,{bytes,type:options.headers?.['Content-Type']||'application/octet-stream'});return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(method==='GET'){
   const object=objects.get(storagePath);return object?new Response(object.bytes,{status:200,headers:{'Content-Type':object.type}}):new Response('missing',{status:404});
  }
  if(method==='DELETE'){objects.delete(storagePath);return new Response('{}',{status:200});}
  throw new Error(`Unhandled storage method ${method}`);
 };
 try{
  const pdfBytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n');
  const form=new FormData();form.set('document_type','birth_certificate');form.set('notes','Documento sintético E2E; no contiene datos reales.');form.set('file',new File([pdfBytes],'acta-demo-e2e.pdf',{type:'application/pdf'}));

  let response=await catechismDocuments(request(`/backoffice/documents/students/${ids.student}/upload`,{method:'POST',body:form}),env,{identity,db:memory.db});
  assert.equal(response.status,201);let data=await response.json();const documentId=data.document.id,storagePath=data.document.storage_path;
  assert.equal(data.document.status,'pending');assert.ok(objects.has(storagePath));assert.ok(!storagePath.includes('acta-demo-e2e'));

  response=await catechismDocuments(request(`/backoffice/documents/students/${ids.student}`),env,{identity,db:memory.db});
  assert.equal(response.status,200);data=await response.json();assert.equal(data.documents.length,1);assert.equal(data.documents[0].original_filename,'acta-demo-e2e.pdf');

  response=await catechismDocuments(request(`/backoffice/documents/${documentId}/download`),env,{identity,db:memory.db});
  assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),pdfBytes);assert.match(response.headers.get('content-disposition')||'',/acta-demo-e2e\.pdf/);

  response=await catechismDocuments(request(`/backoffice/documents/${documentId}`,{method:'PATCH',body:JSON.stringify({status:'verified'}),headers:{'Content-Type':'application/json'}}),env,{identity,db:memory.db});
  assert.equal(response.status,200);data=await response.json();assert.equal(data.document.status,'verified');assert.ok(data.document.verified_at);

  response=await catechismDocuments(request('/backoffice/documents/batches',{method:'POST',body:JSON.stringify({name:'Confirmaciones E2E',requested_for:'Diócesis · E2E',group_id:ids.group,required_types:['birth_certificate']}),headers:{'Content-Type':'application/json'}}),env,{identity,db:memory.db});
  assert.equal(response.status,201);data=await response.json();assert.equal(data.batch.id,ids.batch);assert.equal(memory.batchItems.length,1);assert.equal(memory.batchItems[0].document_id,documentId);

  response=await catechismDocuments(request(`/backoffice/documents/batches/${ids.batch}`),env,{identity,db:memory.db});
  assert.equal(response.status,200);data=await response.json();assert.equal(data.documents.length,1);assert.equal(data.coverage.length,1);assert.equal(data.coverage[0].required[0].document.id,documentId);

  response=await catechismDocuments(request(`/backoffice/documents/batches/${ids.batch}/export`),env,{identity,db:memory.db});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');const zip=new Uint8Array(await response.arrayBuffer()),text=new TextDecoder('latin1').decode(zip);
  assert.match(text,/Confirmaciones E2E\/manifesto\.csv/);assert.match(text,/Confirmaciones E2E\/Demo Ana\/acta-nacimiento-/);assert.match(text,/acta-demo-e2e\.pdf/);assert.match(text,/%PDF-1\.4/);
 }finally{globalThis.fetch=originalFetch;}
});
