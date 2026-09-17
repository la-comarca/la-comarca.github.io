import baseWorker from './worker.mjs';
import {catechismHub} from './catechism-hub.mjs';
import {catechismHubExtra} from './catechism-hub-extra.mjs';
import {catechismDocuments} from './catechism-documents.mjs';

export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname.replace(/\/$/,'');
  if(path.startsWith('/backoffice/documents/'))return catechismDocuments(request,env);
  if(path==='/backoffice/hub/access'||/^\/backoffice\/hub\/access\/[a-f0-9-]{36}\/permissions$/i.test(path)||/^\/backoffice\/hub\/groups\/[a-f0-9-]{36}\/sessions$/i.test(path))return catechismHubExtra(request,env);
  if(path.startsWith('/backoffice/hub/'))return catechismHub(request,env);
  return baseWorker.fetch(request,env,ctx);
 }
};
