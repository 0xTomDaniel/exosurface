// Installed agent-browser native client emits selector:null (daemon rejects it).
// Speak its documented JSON command directly to OUR disposable session's Unix socket.
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
const path = resolve(process.argv[2]);
const socket = createConnection('/tmp/nls-stage/home/.agent-browser/nls-staging.sock');
socket.setTimeout(15000, () => socket.destroy(new Error('Screenshot timeout')));
socket.on('connect', () => socket.write(JSON.stringify({id:'nls-screenshot',action:'screenshot',path,fullPage:false})+'\n'));
let buf='';
socket.on('data', d => { buf+=d; if(buf.includes('\n')) { const result=JSON.parse(buf.split('\n')[0]); console.log(JSON.stringify(result)); socket.end(); if(!result.success) process.exitCode=1; } });
socket.on('error', e => { console.error(e.message); process.exitCode=1; });
