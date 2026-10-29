// Prepare only disposable diagnostic fixtures. Does not install/adopt any packaging route.
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const [kind,targetArg]=process.argv.slice(2);
assert.ok(['workspace','standalone','markdown'].includes(kind),'case: workspace | standalone | markdown');
assert.ok(targetArg,'absolute disposable target required');
const target=resolve(targetArg);
assert.ok(!existsSync(target)||readdirSync(target).length===0,'refusing nonempty fixture target');
mkdirSync(target,{recursive:true});cpSync(join(here,'repro',kind),target,{recursive:true});
if(kind!=='markdown'){
 const dest=join(target,kind==='workspace'?'surface':'','vendor/zod3');mkdirSync(dest,{recursive:true});
 cpSync(join(here,'../zod3/zod-3.25.76-exosurface.1.tgz'),join(dest,'zod-3.25.76-exosurface.1.tgz'));
}
console.log(JSON.stringify({kind,target,productionRouteChanged:false,installed:false}));
