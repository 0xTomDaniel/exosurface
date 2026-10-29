import DOMPurify from 'dompurify';
import baselinePurify from '/baseline.js';
import {renderMarkdown} from '/runtime/@a2ui/markdown-it/src/markdown.js';
import {rawMarkdownRenderer} from '/runtime/@a2ui/markdown-it/src/raw-markdown.js';
const rows=[];
const check=(value,message)=>{if(!value)throw Error(message);};
async function run(name,fn){try{const details=await fn();rows.push({name,pass:true,...(details?{details}:{})});}catch(e){rows.push({name,pass:false,error:String(e)});}}
await run('Actual browser ESM sanitizer versions',()=>{check(DOMPurify.version==='3.4.17','patched version');check(baselinePurify.version==='3.4.11','baseline version');});
await run('Default markdown output/accepted formatting/classes equal old sanitizer and actual Node raw renderer',async()=>{
 const samples=await(await fetch('/samples.json')).json();
 for(const {value,options,raw}of samples){
  const html=await renderMarkdown(value,options);check(typeof html==='string','returned string');
  check(rawMarkdownRenderer.render(value,options?.tagClassMap)===raw,'Browser markdown-it UMD matches actual Node renderer');
  check(html===baselinePurify.sanitize(raw),'default accepted/safe markdown output unchanged');
 }
});
await run('Actual default sanitizer rejects unsafe attributes/protocols; ordinary formatting retained',async()=>{
 const {sanitize}=await import('/runtime/@a2ui/markdown-it/src/sanitizer.js');
 const html=sanitize('<p class="keep">Good <strong>bold</strong><img src="/missing" onerror="0"><a href="javascript:0">bad</a><script>0</script></p>');
 const box=document.createElement('div');box.innerHTML=html;
 check(box.querySelector('strong')?.textContent==='bold','formatting');check(box.querySelector('p')?.className==='keep','class');
 check(!box.querySelector('script,[onerror],[href^="javascript:"]'),'unsafe material removed');
});
await run('GHSA-55q2-fjhq-7xh7: hook-detached descendants neutralized',()=>{
 for(const hook of ['beforeSanitizeElements','uponSanitizeElement']){
  const p=DOMPurify(window),root=document.createElement('div');root.innerHTML='<footer><img onload="0"></footer><div>safe</div>';const img=root.querySelector('img');
  p.addHook(hook,node=>{if(node.nodeName==='FOOTER')node.remove();});p.sanitize(root,{IN_PLACE:true,ALLOWED_TAGS:['div','footer','#text']});
  check(!img.hasAttribute('onload'),hook);p.removeAllHooks();
 }
});
await run('GHSA-c2j3-45gr-mqc4: allowed custom elements pass afterSanitizeElements policy',()=>{
 const p=DOMPurify(window);let seen=false;
 p.addHook('afterSanitizeElements',node=>{if(node.nodeName==='EXO-TEST')seen=true;node.removeAttribute?.('data-inert');});
 const html=p.sanitize('<exo-test data-inert="not executable">safe</exo-test>',{CUSTOM_ELEMENT_HANDLING:{tagNameCheck:/^exo-test$/}});
 check(seen&&!html.includes('data-inert'),'custom-element policy applied');p.removeAllHooks();
});
await run('GHSA-6688-9rhm-gjv2: rawtext root fails closed or returns non-reparseable output',()=>{
 const p=DOMPurify(window),root=document.createElement('style');root.setAttribute('onclick','0');root.textContent='</style><img onerror="0">';document.body.append(root);
 let returned;try{returned=p.sanitize(root,{IN_PLACE:true});}catch(e){
  check(e instanceof TypeError,'only fail-closed TypeError accepted');root.remove();
  return {outcome:'Fail-closed TypeError; original dirty input is not a sanitizer result and must not be rendered'};
 }
 const probe=document.createElement('div');probe.innerHTML=returned.outerHTML;
 check(!probe.querySelector('[onclick],[onerror]'),'no reparse handler');root.remove();return {outcome:'Returned result contains no reparse handler'};
});
await run('GHSA-cg2g-xh64-v4q7: shadow-root split template fragments scrubbed',()=>{
 const p=DOMPurify(window),host=document.createElement('div'),shadow=host.attachShadow({mode:'open'});
 shadow.append(document.createTextNode('$'),document.createElement('object'),document.createTextNode('{7*7}'));
 p.sanitize(host,{IN_PLACE:true,SAFE_FOR_TEMPLATES:true});
 check(!shadow.textContent.includes('${7*7}'),'shadow expression scrubbed without evaluating any template');
});
await run('GHSA-mrv2-3pqr-j5jr: hook-removed parent/sibling neutralized',()=>{
 for(const mode of ['parent','nextSibling']){
  const p=DOMPurify(window),root=document.createElement('div');root.innerHTML='<figure><img class="trigger"><img id="inert" onerror="0"></figure><p>ok</p>';const img=root.querySelector('#inert');
  p.addHook('afterSanitizeAttributes',node=>{if(node.getAttribute?.('class')==='trigger'){if(mode==='parent')node.parentNode.remove();else node.nextElementSibling.remove();}});
  p.sanitize(root,{IN_PLACE:true});check(!img.hasAttribute('onerror'),mode);p.removeAllHooks();
 }
});
await run('GHSA-c6gr-qvv4-5v3f: XHTML SMIL href attributeName guard',()=>{
 const p=DOMPurify(window),html=p.sanitize('<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="x;javascript:0" dur="0.01s" fill="freeze"/></a></svg>',{PARSER_MEDIA_TYPE:'application/xhtml+xml',ALLOWED_TAGS:['svg','a','animate'],ALLOWED_ATTR:['attributeName','values','dur','fill']});
 const xml=new DOMParser().parseFromString(html,'application/xhtml+xml');
 check(!xml.querySelector('animate')?.hasAttribute('attributeName'),'href mutation rejected; no click/evaluation performed');
});
await fetch('/__results',{method:'POST',body:JSON.stringify({browser:navigator.userAgent,patchedVersion:DOMPurify.version,baselineVersion:baselinePurify.version,nonDefaultAdvisoryTestsAreNotApplicationReachabilityProof:true,tests:rows})});
