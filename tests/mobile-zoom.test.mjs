import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('mobile back-office form controls prevent browser auto-zoom without disabling user zoom',async()=>{
 const css=await readFile('public/backoffice-menu.css','utf8');
 assert.match(css,/-webkit-text-size-adjust:100%/);
 assert.match(css,/\.bo-body input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\.bo-body select,\.bo-body textarea\{font-size:16px!important/);
 const html=await readFile('scripts/backoffice.mjs','utf8');
 assert.doesNotMatch(html,/maximum-scale|user-scalable=no/);
});
