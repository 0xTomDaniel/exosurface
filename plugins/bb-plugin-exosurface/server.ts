// Single BB registration, merged existing RPC contract, unchanged primary provider identity.
import {defineRpcContract,type BbPluginApi,type PluginHookHandler,type MessageDispatchHookDecision} from '@get-bb/plugin-sdk';
import primary,{rpcContract as primaryContract} from './legacy/primary/server.ts';
import surface,{rpcContract as surfaceContract} from './legacy/surface/server.ts';
import type {CanonicalSetupPorts} from './legacy/primary/src/canonical-setup.ts';
export const rpcContract=defineRpcContract({...primaryContract,...surfaceContract});
// Match BB's deterministic admission pass: identical context, ordered awaits,
// rejection/throw stops later work; waits do not skip later admission checks.
// Neither retained handler currently returns wait; preserve its first decision if introduced.
export function composeDispatchHooks(hooks:readonly PluginHookHandler<'message.dispatch'>[]):PluginHookHandler<'message.dispatch'>{
 return async context=>{
  let wait:MessageDispatchHookDecision|undefined;
  for(const hook of hooks){const decision=await hook(context);if(decision.action==='reject')return decision;if(decision.action==='wait')wait??=decision;}
  return wait??{action:'proceed'};
 };
}
export default function plugin(bb:BbPluginApi,setupPorts?:CanonicalSetupPorts){
 const handlers:Record<string,unknown>={};
 const dispatch:PluginHookHandler<'message.dispatch'>[]=[];
 const moduleApi:BbPluginApi={...bb,experimental_hooks:{...bb.experimental_hooks,on(_hook,handler){dispatch.push(context=>handler(context));}}};
 const collect=((_contract:unknown,next:Record<string,unknown>)=>{for(const [name,handler] of Object.entries(next)){if(name in handlers)throw Error('Duplicate consolidated RPC: '+name);handlers[name]=handler;}}) as typeof bb.rpc.register;
 primary(moduleApi,collect,setupPorts);surface(moduleApi,collect);
 bb.experimental_hooks.on('message.dispatch',composeDispatchHooks(dispatch));
 bb.rpc.register(rpcContract,handlers as Parameters<typeof bb.rpc.register<typeof rpcContract>>[1]);
}
