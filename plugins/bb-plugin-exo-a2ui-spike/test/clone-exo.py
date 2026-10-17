#!/usr/bin/env python3
"""One explicit clone, never handoff/rebind the original. Private receipt only."""
from pathlib import Path
import json, hashlib, shutil, uuid, datetime, os
H=Path.home(); source=H/'.optchat-exocortex-test'; dest=H/'.optchat-exo-a2ui'; profile='exo-optchat'
owner=json.loads((H/'.exo-bb-spike/owner/state.json').read_text())
assert owner['ready'] and not owner['streaming'], 'Wait for main idle; never stop it to clone'
p=source/'profiles'/profile
for q in ('pending-inputs.json','pending-reports.json'):
 assert json.loads((p/q).read_text())==[],f'Unsettled {q}'
for r in (p/'runs').glob('*.optchat.json'):
 assert json.loads(r.read_text())['state'] in ('completed','stopped','failed'), 'Active/unknown native job; wait'
assert not dest.exists(), 'Clone already exists; never replace paid trial history'
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def manifest():
 return {str(f.relative_to(source)):digest(f) for f in p.rglob('*') if f.is_file() and not f.is_symlink() and '.git' not in f.relative_to(p).parts}
before=manifest(); journal=Path(owner['sessionFile']); journal_hash=digest(journal); raw=journal.read_bytes();assert raw.endswith(b'\n')
dest.mkdir(mode=0o700); target=dest/'profiles'/profile; target.mkdir(parents=True,mode=0o700)
for rel in before:
 src=source/rel; out=dest/rel;out.parent.mkdir(parents=True,exist_ok=True,mode=0o700);shutil.copyfile(src,out);out.chmod(0o600)
assert all(digest(dest/rel)==sha for rel,sha in before.items()), 'Clone verification failed'
assert manifest()==before and digest(journal)==journal_hash, 'Source changed during clone; do not launch this copy'
# Preserve the original native branch bytes; only session header gets a new identity.
header,body=raw.split(b'\n',1); header=json.loads(header); old_id=header['id'];new_id=str(uuid.uuid4());header['id']=new_id
sessions=dest/'pi-sessions';sessions.mkdir(mode=0o700); session=sessions/f'clone-{new_id}.jsonl';session.write_bytes(json.dumps(header).encode()+b'\n'+body);session.chmod(0o600)
# Full old worker evidence retained, but native spawn/tell and unrelated tools
# are disabled by the trial extension. Their original absolute pointers are not
# execution routes in this trial; no paid worker is resumed here.
with (target/'AGENTS.md').open('a') as f:f.write('\n\n# A2UI isolated clone\nThis is a private UI integration clone, not the canonical profile. Synthetic modules/actions are not real commitments. Do not edit vault/tax/source data, access accounts, or spawn/tell workers. Only publish_workspace and read_workspace tools are permitted in this trial.\n')
root=H/'.exo-a2ui-spike';root.mkdir(mode=0o700);(root/'clone.json').write_text(json.dumps({'sourceHome':str(source),'cloneHome':str(dest),'profile':profile,'sourceSession':str(journal),'sessionFile':str(session),'sourceSessionId':old_id,'cloneSessionId':new_id,'sourceJournalSha256':journal_hash,'copiedFiles':len(before),'bytes':sum((source/r).stat().st_size for r in before),'sourceManifest':before,'verifiedAt':datetime.datetime.now().astimezone().isoformat()},indent=2)+'\n');(root/'clone.json').chmod(0o600)
print(json.dumps({'cloneHome':str(dest),'sessionFile':str(session),'cloneSessionId':new_id,'copiedFiles':len(before),'mainOwnerPid':owner['ownerPid'],'mainPiPid':owner['piPid'],'sourceUnchanged':True},indent=2))
