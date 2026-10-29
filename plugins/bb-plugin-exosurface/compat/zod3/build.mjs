// Deterministic, integrity-locked repack; no lifecycle scripts or provider calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
const here=new URL('./',import.meta.url), pin=JSON.parse(readFileSync(new URL('upstream.json',here),'utf8'));
const sha=(b,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(b).digest(encoding);
const input=process.argv[2];
if(!input)throw Error('Pass verified upstream .tgz path or --fetch');
let archive;
if(input==='--fetch'){
 const response=await fetch(pin.tarball,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Registry HTTP ${response.status}`);archive=Buffer.from(await response.arrayBuffer());
}else archive=readFileSync(input);
if(`sha512-${sha(archive,'sha512','base64')}`!==pin.integrity)throw Error('Upstream integrity mismatch; no artifact written');
const tar=gunzipSync(archive), entries=[], seen=new Set(), changes=[];
const text=(header,start,length)=>header.subarray(start,start+length).toString().replace(/\0.*$/s,'');
function replacement(source,path,key,invalid){
 const ts=path.endsWith('.ts'),indent=ts?'        ':'                ';
 const before=`message: def.${key}.message,\n${indent}});\n${indent}status.dirty();`;
 const after=`message: def.${key}.message,\n${indent}});\n${indent}${key==='exactLength'?`if (tooBig) return ${invalid};\n${indent}status.dirty();`:`return ${invalid};`}`;
 if(source.split(before).length!==2)throw Error(`Pinned-source patch anchor changed: ${path} ${key}`);
 return source.replace(before,after);
}
let licenseHeader;
for(let offset=0;offset<tar.length;){
 const header=Buffer.from(tar.subarray(offset,offset+512));if(header.every(b=>b===0))break;
 const name=text(header,0,100),prefix=text(header,345,155),path=prefix?`${prefix}/${name}`:name;
 if(!path.startsWith('package/')||path.split('/').includes('..')||seen.has(path))throw Error('Unexpected upstream archive path');
 if(!['0',''].includes(text(header,156,1)))throw Error('Unexpected non-regular archive entry');
 seen.add(path);const size=parseInt(text(header,124,12).trim(),8);if(!Number.isSafeInteger(size)||size<0)throw Error('Invalid archive size');
 let data=Buffer.from(tar.subarray(offset+512,offset+512+size));if(data.length!==size)throw Error('Truncated archive');
 const original=data;
 if(['package/src/v3/types.ts','package/v3/types.js','package/v3/types.cjs'].includes(path)){
  let source=data.toString();const invalid=path.endsWith('.cjs')?'parseUtil_js_1.INVALID':'INVALID';
  for(const key of ['exactLength','maxLength','maxSize'])source=replacement(source,path,key,invalid);
  data=Buffer.from(source);
 }else if(path==='package/package.json'){
  const pkg=JSON.parse(data);if(pkg.version!==pin.version)throw Error('Unexpected package version');
  pkg.version=pin.localVersion;data=Buffer.from(JSON.stringify(pkg,null,2)+'\n');
 }
 if(!data.equals(original))changes.push({path,upstreamSha256:sha(original),patchedSha256:sha(data)});
 if(path==='package/LICENSE')licenseHeader=header;
 entries.push({header,path,data});offset+=512+Math.ceil(size/512)*512;
}
if(changes.length!==4||!licenseHeader)throw Error('Incomplete or excessive patch surface');
const noticeHeader=Buffer.from(licenseHeader),noticePath='package/EXOSURFACE_BACKPORT.md';
noticeHeader.fill(0,0,100);noticeHeader.write(noticePath,0,'utf8');noticeHeader.fill(0,345,500);
entries.push({header:noticeHeader,path:noticePath,data:readFileSync(new URL('NOTICE.md',here))});
const blocks=[];
for(const {header,data}of entries){
 header.fill(0,124,136);header.write(data.length.toString(8).padStart(11,'0')+'\0',124,'ascii');header.fill(32,148,156);
 let sum=0;for(const byte of header)sum+=byte;header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,'ascii');
 blocks.push(header,data,Buffer.alloc((512-data.length%512)%512));
}
blocks.push(Buffer.alloc(1024));
const packed=gzipSync(Buffer.concat(blocks),{level:9,mtime:0});
const artifact='zod-3.25.76-exosurface.1.tgz';writeFileSync(new URL(artifact,here),packed);
const manifest={schema:'exosurface-zod3-backport/1',name:pin.name,version:pin.localVersion,artifact,sha256:sha(packed),integrity:`sha512-${sha(packed,'sha512','base64')}`,bytes:packed.length,upstream:pin,changes,notice:noticePath,scope:'Only v3 constrained-container mechanism backport. Existing v4 subpaths are unchanged and outside this candidate\'s approved consumed graph. No upstream fixed-version or scanner-clearance claim.'};
writeFileSync(new URL('artifact.json',here),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({artifact,integrity:manifest.integrity,sha256:manifest.sha256,bytes:manifest.bytes},null,2));
