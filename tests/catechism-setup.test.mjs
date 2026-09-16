import test from 'node:test';
import assert from 'node:assert/strict';
import {catechismSetup} from '../api/catechism-setup.mjs';
import {backofficeHTML} from '../scripts/backoffice.mjs';

const env={ALLOWED_ORIGINS:'https://la-comarca.github.io'};

test('Catecismo setup rejects unknown origins before authentication',async()=>{
 const request=new Request('https://comarca.kipadmon.com/backoffice/setup',{headers:{Origin:'https://evil.example'}});
 const response=await catechismSetup(request,env);
 assert.equal(response.status,403);
});

test('Catecismo setup requires an authenticated team session',async()=>{
 const request=new Request('https://comarca.kipadmon.com/backoffice/setup',{headers:{Origin:'https://la-comarca.github.io'}});
 const response=await catechismSetup(request,env);
 assert.equal(response.status,401);
 assert.match((await response.json()).message,/sesión|Inicia/i);
});

test('Catecismo setup preflight exposes only required methods and headers',async()=>{
 const request=new Request('https://comarca.kipadmon.com/backoffice/setup',{method:'OPTIONS',headers:{Origin:'https://la-comarca.github.io'}});
 const response=await catechismSetup(request,env);
 assert.equal(response.status,204);
 assert.match(response.headers.get('Access-Control-Allow-Methods')||'',/PATCH/);
});

test('back-office shell follows public header pattern and loads configuration editor',()=>{
 const html=backofficeHTML('/', 'abc123');
 assert.match(html,/class="header bo-site-header"/);
 assert.match(html,/class="brand"[^>]*>LC<span class="brand-dot">\.<\/span>/);
 assert.match(html,/>Configuración<\/button>/);
 assert.match(html,/backoffice-setup\.js\?v=abc123/);
 assert.match(html,/backoffice-menu\.css\?v=abc123/);
});
