export {};
// Release entry adapter only. The existing owner/session/projection implementation is unchanged.
// These probes deliberately do not import config/state/owner modules or touch credentials/state.
if(process.argv.includes('--release-selftest')){
 console.log(JSON.stringify({ok:true,contract:'exosurface-package/0',runtimeImplemented:true,implementation:'existing-primary-owner',releaseReady:false}));
}else if(process.argv.includes('--readiness')){
 console.log(JSON.stringify({schema:'exosurface-readiness/0',authentication:{status:'unverified'},connectivity:{status:'unverified'},runtime:{ready:false},ready:false}));process.exitCode=2;
}else{
 await import('./src/owner-service.ts');
}
