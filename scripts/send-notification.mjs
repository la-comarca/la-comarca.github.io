import {createHash} from 'node:crypto';
const {ONESIGNAL_APP_ID:appId,ONESIGNAL_REST_API_KEY:apiKey,NOTIFICATION_TITLE:title,NOTIFICATION_MESSAGE:message,GITHUB_RUN_ID:runId,GITHUB_REPOSITORY:repo}=process.env;
if(!appId||!apiKey)throw Error('Configura OneSignal antes de enviar avisos.');
if(!title?.trim()||title.length>80||!message?.trim()||message.length>240)throw Error('Título de 1–80 y mensaje de 1–240 caracteres.');
// Same workflow rerun => same UUID. OneSignal deduplicates retries for 30 days.
const hex=createHash('sha256').update(`${repo}:${runId}`).digest('hex').slice(0,32).split('');hex[12]='4';hex[16]='8';const h=hex.join(''),key=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
const r=await fetch('https://api.onesignal.com/notifications',{method:'POST',headers:{Authorization:`Key ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({app_id:appId,target_channel:'push',included_segments:['Subscribed Users'],headings:{en:title,es:title},contents:{en:message,es:message},url:'https://comarca.kipadmon.com/agenda/',idempotency_key:key}),signal:AbortSignal.timeout(30000)});
if(!r.ok)throw Error(`No se enviaron los avisos: HTTP ${r.status}. Revisa la configuración en OneSignal.`);
const result=await r.json();if(result.errors||!result.id)throw Error('OneSignal no confirmó el envío. Revisa que haya suscriptores y una configuración válida.');console.log('OneSignal aceptó el aviso. Revisa la entrega en su panel.');
