import test from 'node:test';import assert from 'node:assert/strict';import {validate,notionPayload,handle} from '../api/worker.mjs';
const input={name:'Prueba local',email:'test@example.com',activity:'Catecismo',privacy:true,token:'test',message:'Preparar materiales'};
test('Registration enforces consent, activity allowlist and field sizes',()=>{assert.throws(()=>validate({...input,privacy:false}));assert.throws(()=>validate({...input,activity:'arbitrary'}));assert.throws(()=>validate({...input,message:'a'.repeat(1801)}));assert.throws(()=>validate({...input,whatsappOptIn:true}));assert.equal(validate(input).emailOptIn,false);});
test('Registration cannot set confirmation, payments, attendance or private relations',()=>{const p=notionPayload(validate({...input,Estado:'Confirmada',Asistencia:true,Agenda:['private']}),'ds');assert.equal(p.properties.Estado.select.name,'Solicitada');for(const key of ['Asistencia','Agenda','Estado del pago','Importe verificado MXN'])assert.equal(p.properties[key],undefined);});
const env={ALLOWED_ORIGINS:'https://la-comarca.github.io',NOTION_TOKEN:'test',TURNSTILE_SECRET_KEY:'test',NOTION_DATA_SOURCE_ID:'ds',FORM_LIMIT:{limit:async()=>({success:true})}};
const request=(origin='https://la-comarca.github.io')=>new Request('https://api.example/solicitudes',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
test('Registration rejects foreign origins and invalid challenge without touching Notion',async()=>{let calls=0;const no=async()=>{calls++;return Response.json({success:false});};assert.equal((await handle(request('https://other.example'),env,no)).status,403);assert.equal(calls,0);assert.equal((await handle(request(),env,no)).status,400);assert.equal(calls,1);});
test('Unknown safe public reads fall back to the same-origin static site',async()=>{
 let served='';const assets={fetch:async request=>{served=new URL(request.url).pathname;return new Response('public site');}};
 const response=await handle(new Request('https://example.com/agenda/'),{...env,ASSETS:assets});
 assert.equal(response.status,200);assert.equal(await response.text(),'public site');assert.equal(served,'/agenda/');
});
test('Team entry remains on the static site instead of redirecting to CMS',async()=>{
 let served='';const assets={fetch:async request=>{served=new URL(request.url).pathname;return new Response('static team page');}};
 const response=await handle(new Request('https://example.com/equipo/'),{...env,ASSETS:assets});
 assert.equal(response.status,200);assert.equal(await response.text(),'static team page');assert.equal(served,'/equipo/');assert.equal(response.headers.get('location'),null);
});
test('Registration reports success only after private storage succeeds',async()=>{const mock=async url=>url.includes('siteverify')?Response.json({success:true,hostname:'la-comarca.github.io',action:'inscripcion'}):new Response('{}',{status:201});assert.equal((await handle(request(),env,mock)).status,201);const bad=async url=>url.includes('siteverify')?Response.json({success:true,hostname:'la-comarca.github.io',action:'inscripcion'}):new Response('{}',{status:500});assert.equal((await handle(request(),env,bad)).status,502);});
test('dynamic event requests are linked only after checking source and publication',async()=>{
 const eventId='11111111-1111-4111-8111-111111111111',source='22222222-2222-4222-8222-222222222222';let saved=0;
 const req=()=>new Request('https://api.example/solicitudes',{method:'POST',headers:{Origin:'https://la-comarca.github.io','Content-Type':'application/json'},body:JSON.stringify({...input,activity:'New event',eventId})});
 const mock=published=>async(url,options)=>{if(url.includes('siteverify'))return Response.json({success:true,hostname:'la-comarca.github.io',action:'inscripcion'});if(options.method==='POST'){const p=JSON.parse(options.body);assert.equal(p.properties.Agenda.relation[0].id,eventId);assert.equal(p.properties.Estado.select.name,'Solicitada');saved++;return Response.json({id:'new'});}return Response.json({id:eventId,parent:{data_source_id:source},properties:{Name:{title:[{plain_text:'Una actividad'}]},Estado:{select:{name:'Confirmada'}},'Publicar en web':{checkbox:published}}});};
 assert.equal((await handle(req(),{...env,NOTION_AGENDA_ID:source},mock(false))).status,400);assert.equal(saved,0);
 assert.equal((await handle(req(),{...env,NOTION_AGENDA_ID:source},mock(true))).status,201);assert.equal(saved,1);
});
