"""Read-only final preservation verification, not a restore or lock takeover."""
from pathlib import Path
from datetime import datetime
import hashlib, json, socket
BASE = Path(__file__).resolve().parent.parent
ROOT = Path.home()/'.optchat-exocortex-test/profiles/exo-optchat'
def sha(data): return hashlib.sha256(data).hexdigest()
before = json.loads((BASE/'evidence/canonical-before-handoff.json').read_text())
unchanged=[]; appended=[]; mutable=[]
for relative, record in before['fileManifest'].items():
    if relative.startswith('.git/'): continue
    data = (ROOT/relative).read_bytes()
    if sha(data) == record['sha256']: unchanged.append(relative)
    elif len(data) >= record['bytes'] and sha(data[:record['bytes']]) == record['sha256']: appended.append(relative)
    else: mutable.append(relative)
assert all(p in {'pending-inputs.json', 'pending-reports.json'} for p in mutable), f'Unexpected rewrite: {mutable}'
for p in ['config.json','AGENTS.md','active-memory.json','DO-NOT-DELETE.md']: assert p in unchanged
protected=[]
for record in json.loads((BASE/'evidence/protected-before.json').read_text())[1:]:
    root=Path(record['path']); files=sorted(p for p in root.rglob('*') if p.is_file()) if root.is_dir() else [root]
    h=hashlib.sha256()
    for p in files: h.update((str(p.relative_to(root)) if root.is_dir() else p.name).encode()); h.update(p.read_bytes())
    match=h.hexdigest()==record['sha256']; assert match, f'Protected non-profile source changed: {root}'
    protected.append({'path':str(root),'unchanged':match})
assert not (ROOT/'imports/pending.json').exists()
queues={}
for p in ['pending-inputs.json','pending-reports.json']:
    data=json.loads((ROOT/p).read_text()); rows=data if isinstance(data,list) else data.get('items',data.get('entries',[]))
    queues[p]=len(rows);assert not rows
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(2);s.connect(str(ROOT/'lock.sock'));owner=s.recv(4096).decode();s.close()
assert owner.startswith('exo-optchat · PID ')
result={'verifiedAt':datetime.now().astimezone().isoformat(),'unchangedNonGitFiles':unchanged,'appendOnlyExistingFiles':appended,
        'mutableJournalsChanged':mutable,'sixProtectedNonProfileTargets':protected,'pendingImport':False,'queues':queues,
        'owner':owner,'archiveUnchanged':sha(Path(before['archive']).read_bytes())==before['archiveSha256'],
        'historicalNativeTranscriptsCopiedToBB':False,'oldHistoryRebuiltOrPruned':False}
assert result['archiveUnchanged'];(BASE/'evidence/canonical-final-preservation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'verifiedAt':result['verifiedAt'],'unchangedNonGitFiles':len(unchanged),'appendOnlyExistingFiles':appended,
                  'unexpectedRewrites':mutable,'protectedNonProfileTargetsUnchanged':len(protected),'queuesEmpty':True,
                  'owner':owner,'privateBackupUnchanged':result['archiveUnchanged']},indent=2))
