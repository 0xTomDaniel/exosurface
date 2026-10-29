// Disposable Chromium runner: explicit executable, scrubbed child env, no live profile.
// Same-account isolation is not an OS sandbox. Server binds loopback only.
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {createServer} from 'node:http';
export async function browserFixture({routes,roots={},timeout=20000}){
 const browser=process.env.EXO_REVIEW_BROWSER;
 if(!browser||!browser.startsWith('/'))throw Error('Set EXO_REVIEW_BROWSER to an absolute installed Chromium executable; no live profile is used');
 const dir=mkdtempSync(join(tmpdir(),'exo-browser-'));
 let report,reportError;
 async function closeBrowser(){
  try{
   const [port,path]=readFileSync(join(dir,'profile/DevToolsActivePort'),'utf8').trim().split('\n');
   const ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);
   await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
   ws.send(JSON.stringify({id:1,method:'Browser.close'}));
  }catch(e){reportError='Could not close disposable browser: '+String(e);try{process.kill(-child.pid,'SIGTERM');}catch{}}
 }
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://127.0.0.1').pathname;
   if(req.method==='POST'&&path==='/__results'){
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1024*1024)throw Error('Oversized fixture result');}
    if(report)throw Error('Duplicate fixture result');report=JSON.parse(body);res.end('ok');setTimeout(()=>void closeBrowser(),50);return;
   }
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   const route=routes[path];let content,type;
   if(route){({content,type='text/javascript'}=typeof route==='function'?await route():route);}
   else{
    const base=Object.keys(roots).find(p=>path.startsWith(p+'/'));if(!base){res.writeHead(404).end();return;}
    const root=resolve(roots[base]),file=resolve(root,decodeURIComponent(path.slice(base.length+1)));
    if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
    content=readFileSync(file);type=({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[extname(file)]??'application/octet-stream';
   }
   res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'");res.end(content);
  }catch(e){reportError=String(e);res.writeHead(500).end('Fixture error');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/`;
 const child=spawn(browser,[`--user-data-dir=${join(dir,'profile')}`,'--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--disable-extensions','--disable-breakpad','--disable-crash-reporter','--password-store=basic','--use-mock-keychain','--metrics-recording-only','--disable-features=BraveRewards,BraveWallet,OptimizationHints,MediaRouter,Translate','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','--virtual-time-budget=5000','--dump-dom',url],{detached:true,env:{HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stdout.resume();child.stderr.on('data',x=>{stderr=(stderr+x).slice(-12000);});
 const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},timeout);
 try{
  const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>accept({code,signal}));});
  if(result.code!==0||!report||reportError)throw Error(JSON.stringify({result,reportError,missingReport:!report,stderr}));
  return report;
 }finally{clearTimeout(timer);await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
