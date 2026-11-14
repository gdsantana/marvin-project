const node=id=>document.querySelector(`[data-node-id="2042:${id}"]`);
const repo='https://github.com/gdsantana/marvin-project';
function link(id,url){const el=node(id);if(!el)return;const a=document.createElement('a');for(const attr of el.attributes)a.setAttribute(attr.name,attr.value);a.href=url;a.innerHTML=el.innerHTML;el.replaceWith(a)}
function button(id,label,action){const el=node(id),b=document.createElement('button');for(const attr of el.attributes)b.setAttribute(attr.name,attr.value);b.type='button';b.setAttribute('aria-label',label);b.innerHTML=el.innerHTML;b.addEventListener('click',action);el.replaceWith(b);return b}
const command='curl -fsSL https://github.com/gdsantana/marvin-project/releases/latest/download/install.sh | bash';
node(54).querySelector('p').textContent=command;
const status=document.createElement('p');status.id='copy-status';status.setAttribute('role','status');node(35).append(status);
async function copy(text){try{await navigator.clipboard.writeText(text);status.textContent='Comando copiado.'}catch{status.textContent='Não foi possível copiar. Selecione o comando e copie manualmente.'}}
button(55,'Copiar comando de instalação',()=>copy(command));
for(const id of [23,410])link(id,'#instalar');node(35).id='instalar';node(274).id='recursos';
for(const id of [28,484,440])link(id,repo);
for(const id of [416,489,452])link(id,repo+'/blob/main/docs/deployment.md');
link(478,'#recursos');link(480,repo+'/blob/main/ARCHITECTURE.md');link(482,'#instalar');link(446,repo+'/releases');link(454,repo+'/blob/main/ARCHITECTURE.md');link(456,repo+'/blob/main/docs/data-model.md');link(458,repo+'/blob/main/docs/deployment.md');link(466,repo+'/blob/main/docs/deployment.md');link(468,repo+'/issues');link(472,'./');
const skip=document.createElement('a');skip.className='skip';skip.href='#recursos';skip.textContent='Pular para o conteúdo';document.body.prepend(skip);
const social=document.createElement('a');social.href='https://www.instagram.com/gdsantana.dev/';social.textContent='Instagram';social.style.cssText='font:12px/16px Geist;color:#a1a1aa';node(463).append(social);
