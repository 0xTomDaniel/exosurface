// Interactive, CDP-driven variant kept separate from the reviewed nine-case sanitizer runner.
// Hard 20s deadline, mandatory clean root exit, forced cleanup is NEVER a passing run.
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(url){
 const ws=new WebSocket(url),pending=new Map(),events=[];let id=0;
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id){events.push(message);if(events.length>80)events.shift();return;}const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);message.error?waiter.reject(Error(JSON.stringify(message.error))):waiter.resolve(message.result);});
 ws.addEventListener('close',()=>{for(const waiter of pending.values())waiter.reject(Error('CDP connection closed'));pending.clear();});
 return {events,close:()=>ws.close(),notify(method,params={}){ws.send(JSON.stringify({id:++id,method,params}));},send(method,params={}){return new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}));});}};
}
export async function interactiveChromium(url,control){
 const executable=process.env.EXO_REVIEW_BROWSER;if(!executable?.startsWith('/'))throw Error('Explicit absolute EXO_REVIEW_BROWSER required');
 const dir=mkdtempSync(join(tmpdir(),'exo-interactive-'));let page,browser,child,timer,stderr='',result,lastState,phase='startup',closeRequested=false;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser hard 20s deadline (including shutdown); run FAILED')),20000);});
 const run=async()=>{
  child=spawn(executable,[`--user-data-dir=${join(dir,'profile')}`,'--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--disable-extensions','--disable-breakpad','--disable-crash-reporter','--disable-crashpad-for-testing','--password-store=basic','--use-mock-keychain','--metrics-recording-only','--disable-features=BraveRewards,BraveWallet,OptimizationHints,MediaRouter,Translate','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',url],{detached:true,env:{HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,PATH:process.env.PATH},stdio:['ignore','ignore','pipe']});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});
  let port,path;
  while(!port){try{[port,path]=readFileSync(join(dir,'profile/DevToolsActivePort'),'utf8').trim().split('\n');}catch{}if(child.exitCode!==null||child.signalCode!==null)throw Error('Browser exited before CDP startup');if(!port)await sleep(20);}
  browser=await connect(`ws://127.0.0.1:${port}${path}`);
  let target;
  while(!target){const list=await browser.send('Target.getTargets');target=list.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(url));if(!target)await sleep(20);}
  page=await connect(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);phase='attached';await page.send('Runtime.enable');await page.send('Log.enable');
  const evaluate=async expression=>{const value=await page.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw Error(JSON.stringify(value.exceptionDetails));return value.result.value;};
  result=await control({send:page.send,evaluate,waitFor:async expression=>{phase=expression;while(!await evaluate(expression)){lastState=await evaluate('({text:document.body?.innerText,error:window.__fixture?.error,ready:window.__fixture?.ready,viewError:window.__fixture?.view.error,revision:window.__fixture?.view.committed?.revision})');await sleep(20);}},screenshot:async()=>Buffer.from((await page.send('Page.captureScreenshot',{format:'png'})).data,'base64')});
  const version=await browser.send('Browser.getVersion');
  closeRequested=true;browser.notify('Browser.close');
  const exit=await exited;if(exit.code!==0||exit.signal)throw Error('Browser exit was not clean: '+JSON.stringify(exit));
  for(;;){try{process.kill(-child.pid,0);}catch(error){if(error.code==='ESRCH')break;throw error;}await sleep(20);}
  return {...result,browser:version.product,lifecycle:{deadlineMs:20000,closeRequested,exit,forced:false,processGroupGone:true}};
 };
 let failure;
 try{return await Promise.race([run(),deadline]);}
 catch(error){failure=error;throw Error(JSON.stringify({error:String(error),closeRequested,phase,lastState,result,events:page?.events,stderr}));}
 finally{
  clearTimeout(timer);page?.close();browser?.close();
  let cleanupError;
  if(child){try{process.kill(-child.pid,'SIGKILL');if(!failure)cleanupError=Error('Browser process group still alive after clean root exit; cleanup forced; run FAILED');}catch(error){if(error.code!=='ESRCH')cleanupError=error;}}
  rmSync(dir,{recursive:true,force:true});if(cleanupError)throw cleanupError;
 }
}
