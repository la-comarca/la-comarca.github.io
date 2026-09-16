import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../api/worker.mjs';

test('Catecismo v2 API is not served as a static asset',async()=>{
 let assetCalled=false;
 const env={ALLOWED_ORIGINS:'https://la-comarca.github.io',ASSETS:{fetch:async()=>{assetCalled=true;return new Response('asset');}}};
 const response=await handle(new Request('https://comarca.kipadmon.com/backoffice/v2/home',{headers:{Origin:'https://la-comarca.github.io'}}),env);
 assert.equal(response.status,401);
 assert.equal(assetCalled,false);
});
