#!/usr/bin/env python3
"""Private verified snapshot before reverting. Does not delete/move live evidence or copy credentials."""
from pathlib import Path
import hashlib, io, json, os, tarfile
from datetime import datetime
root=Path(__file__).resolve().parents[1]; home=Path.home(); state=home/'.exo-a2ui-spike'
owner=json.loads((state/'owner/state.json').read_text()); current=json.loads((state/'workspace/latest.json').read_text())
if not owner['ready'] or owner.get('streaming') or owner.get('composing') or current.get('observer',{}).get('running'): raise SystemExit('Idle clone required; no active work touched')
stamp=datetime.now().astimezone().strftime('%Y%m%dT%H%M%S%z'); destination=state/'experiments'/stamp; destination.mkdir(parents=True,exist_ok=False); os.chmod(destination,0o700)
archive=destination/'jev-observer-experiments.tar.gz'; records=[]; excluded=[]; inputs=[]
for prefix,base in [('plugin',root),('clone-home',home/'.optchat-exo-a2ui')]:
 for p in sorted(base.rglob('*')):
  rel=p.relative_to(base)
  if any(x in {'node_modules','dist','.git'} for x in rel.parts): continue
  if p.is_symlink() or not p.is_file(): continue
  name=p.name.lower()
  if name.startswith('.env') or name in {'auth.json','credentials.json','secrets.json'} or name.endswith(('.sock','.lock')):
   excluded.append(str(Path(prefix)/rel));continue
  if p.suffix=='.json' and not str(rel).startswith('evidence/'):
   try:
    def secret(v):
     if isinstance(v,dict):return any(''.join(c for c in k.lower() if c.isalpha()) in {'apikey','password','secret','accesstoken','refreshtoken','authorization','credentials'} and bool(x) or secret(x) for k,x in v.items())
     if isinstance(v,list):return any(map(secret,v))
     return False
    if secret(json.loads(p.read_text())):excluded.append(str(Path(prefix)/rel));continue
   except (ValueError,UnicodeError):pass
  inputs.append((str(Path(prefix)/rel),p))
for rel in ['clone.json','canonical-thread.json','workspace/latest.json','workspace/context-receipts.jsonl','owner/state.json','owner/projection.json']:
 p=state/rel
 if p.is_file():inputs.append(('runtime/'+rel,p))
with tarfile.open(archive,'w:gz') as t:
 for name,p in inputs:
  data=p.read_bytes(); info=tarfile.TarInfo(name); info.size=len(data);info.mode=0o600; t.addfile(info,io.BytesIO(data));records.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 manifest={'created':datetime.now().astimezone().isoformat(),'reason':'Tom authorized archive and reversion to direct Exo→A2UI','nativeRevision':current['workspace']['revision'],'sessionFile':owner['sessionFile'],'files':records,'excluded':excluded,'dependencies':'node_modules/dist/.git and credentials not copied; live originals untouched; lockfiles included'}
 data=json.dumps(manifest,indent=2).encode();info=tarfile.TarInfo('MANIFEST.json');info.size=len(data);info.mode=0o600;t.addfile(info,io.BytesIO(data))
os.chmod(archive,0o600)
with tarfile.open(archive,'r:gz') as t:
 for r in records:
  data=t.extractfile(r['path']).read()
  if len(data)!=r['bytes'] or hashlib.sha256(data).hexdigest()!=r['sha256']:raise RuntimeError('Archive readback mismatch')
session=Path(owner['sessionFile']); native=next(r for r in records if r['path']=='clone-home/'+str(session.relative_to(home/'.optchat-exo-a2ui')))
if hashlib.sha256(session.read_bytes()).hexdigest()!=native['sha256']:raise RuntimeError('Native journal changed during archive; snapshot retained, do not call it consistent')
result={'verified':True,'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'filesVerified':len(records),'nativeRevision':current['workspace']['revision'],'nativeBytes':native['bytes'],'nativeSha256':native['sha256'],'excludedCount':len(excluded)}
(destination/'receipt.json').write_text(json.dumps(result,indent=2));os.chmod(destination/'receipt.json',0o600);(root/'evidence/revert').mkdir(exist_ok=True);(root/'evidence/revert/archive.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
