import {writeFileSync} from 'node:fs';
export default function setupProof(pi){
 pi.on('before_provider_request',()=>{writeFileSync(process.env.PROOF_ROOT+'/UNEXPECTED-INFERENCE','blocked');throw Error('No inference permitted')});
 pi.registerCommand('canonical-setup-proof',{description:'Authorized disposable session initialization only',handler:async(_args,ctx)=>{
  const result=await ctx.newSession({setup:async manager=>{
   const text='Exosurface disposable setup initialization. User-authorized session creation only; no inference requested.';
   manager.appendMessage({role:'user',content:[{type:'text',text}],timestamp:Date.now()});
   writeFileSync(process.env.PROOF_ROOT+'/cli-session.json',JSON.stringify({id:manager.getSessionId(),file:manager.getSessionFile(),entries:manager.getEntries()}));
  }});
  if(result.cancelled)throw Error('Setup cancelled');
 }});
}
