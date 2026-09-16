const defaultEndpoint='https://comarca.kipadmon.com/calendario.ics';
export function subscriptionURL({types=[],circles=[],allTypes=true,allCircles=true},endpoint=defaultEndpoint){
 const url=new URL(endpoint);if(!allTypes)for(const t of [...new Set(types)].sort())url.searchParams.append('type',t);
 if(!allCircles){url.searchParams.set('circles','selected');for(const id of [...new Set(circles)].sort())url.searchParams.append('circle',id);}
 return url.href;
}
export function initSubscription(events,endpoint=defaultEndpoint){
 const form=document.querySelector('#subscription-form');if(!form)return;
 const output=document.querySelector('#subscription-output'),urlField=document.querySelector('#subscription-url'),status=document.querySelector('#subscription-status');
 form.querySelectorAll('fieldset,button[type=submit]').forEach(x=>x.disabled=false);
 const choices=document.querySelector('#subscription-circles');
 choices.replaceChildren(...events.filter(e=>e.type==='Círculo').map(e=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='circle';input.value=e.id;label.append(input,document.createTextNode(e.title+' · '+e.location));return label;}));
 const toggle=()=>{const allTypes=form.elements.allTypes.checked,allCircles=form.elements.allCircles.checked;form.querySelectorAll('[name=type]').forEach(x=>x.disabled=allTypes);form.querySelectorAll('[name=circle]').forEach(x=>x.disabled=allCircles);output.hidden=true;status.textContent='';};
 form.addEventListener('change',toggle);toggle();
 form.addEventListener('submit',event=>{event.preventDefault();const f=new FormData(form),allTypes=f.has('allTypes'),types=f.getAll('type');if(!allTypes&&!types.length){status.textContent='Elige al menos un tipo de actividad.';return;}const url=subscriptionURL({types,allTypes,circles:f.getAll('circle'),allCircles:f.has('allCircles')},endpoint);urlField.value=url;document.querySelector('#subscription-apple').href=url.replace(/^https:/,'webcal:');output.hidden=false;status.textContent='Enlace listo. Añádelo como suscripción, no como archivo importado.';});
 document.querySelector('#subscription-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(urlField.value);status.textContent='Enlace copiado. Pégalo en la opción Desde URL o Suscribirse de tu calendario.';}catch{urlField.focus();urlField.select();status.textContent='Selecciona y copia el enlace que aparece arriba.';}});
}
