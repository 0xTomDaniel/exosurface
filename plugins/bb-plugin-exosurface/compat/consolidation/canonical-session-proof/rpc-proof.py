import subprocess,os,json,time,pathlib,select
r=pathlib.Path(os.environ['PROOF_ROOT']);node=os.environ['NODE_PREFIX']+'/bin/node';cli='/tmp/exo-native-source.RVkor2/source/plugins/bb-plugin-exosurface/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'
env={'HOME':str(r/'home'),'TMPDIR':str(r/'tmp'),'PATH':'/usr/bin:/bin','PROOF_ROOT':str(r),'PI_OFFLINE':'1','PI_TELEMETRY':'0','PI_CODING_AGENT_DIR':str(r/'agent'),'NODE_DISABLE_COMPILE_CACHE':'1','NODE_OPTIONS':'--require='+str(r/'guard.cjs')}
args=[node,cli,'--mode','rpc','--offline','--no-extensions','--no-mcp','--no-skills','--no-prompt-templates','--no-context-files','--no-tools','--session-dir',str(r/'sessions'),'-e',str(r/'setup-extension.mjs')]
p=subprocess.Popen(args,cwd=r/'vault',env=env,stdin=subprocess.PIPE,stdout=open(r/'cli-proof.stdout','w'),stderr=open(r/'cli-proof.stderr','w'),text=True)
p.stdin.write(json.dumps({'id':'initialize','type':'prompt','message':'/canonical-setup-proof'})+'\n');p.stdin.flush()
for _ in range(100):
 if (r/'cli-session.json').exists() or p.poll() is not None: break
 time.sleep(.1)
p.terminate()
try: code=p.wait(timeout=5)
except subprocess.TimeoutExpired: p.kill();code=p.wait(timeout=5)
(r/'cli-proof.exit').write_text(str(code))
print('receipt', (r/'cli-session.json').exists(),'exit',code)
