exec(open(__file__.replace('reopen.py','rpc-proof.py')).read().split('p=subprocess.Popen')[0])
s=json.loads((r/'cli-session.json').read_text());args+=['--session',s['file']]
p=subprocess.Popen(args,cwd=r/'vault',env=env,stdin=subprocess.PIPE,stdout=open(r/'cli-reopen.stdout','w'),stderr=open(r/'cli-reopen.stderr','w'),text=True)
for req in [{'id':'state','type':'get_state'},{'id':'entries','type':'get_entries'}]: p.stdin.write(json.dumps(req)+'\n')
p.stdin.flush()
for _ in range(100):
 if '"id":"entries"' in (r/'cli-reopen.stdout').read_text() or p.poll() is not None: break
 time.sleep(.1)
p.terminate()
try: code=p.wait(timeout=5)
except subprocess.TimeoutExpired: p.kill();code=p.wait(timeout=5)
(r/'cli-reopen.exit').write_text(str(code))
print((r/'cli-reopen.stdout').read_text())
