"""Verified private snapshot before the authorized BB owner handoff. No cleanup/pruning."""
from pathlib import Path
import hashlib, json, os, socket, tarfile
from datetime import datetime
ROOT = Path.home()/'.optchat-exocortex-test/profiles/exo-optchat'
DEST = Path.home()/'Sync/Backups/OptChat/exo-optchat'
EVIDENCE = Path(__file__).resolve().parent.parent/'evidence'
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.settimeout(2)
try:
    s.connect(str(ROOT/'lock.sock')); raise RuntimeError('Original profile still has an owner; no snapshot/handoff')
except (FileNotFoundError, ConnectionRefusedError): pass
finally: s.close()
assert not (ROOT/'imports/pending.json').exists(), 'Pending import must be reconciled first'
def inventory():
    return {str(p.relative_to(ROOT)): {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(ROOT.rglob('*')) if p.is_file() and not p.is_symlink()}
before = inventory(); stamp = datetime.now().astimezone().strftime('%Y-%m-%dT%H-%M-%S%z')
DEST.mkdir(exist_ok=True, parents=True)
archive = DEST/f'bb-handoff-{stamp}.tar.gz'
assert not archive.exists()
with tarfile.open(archive, 'w:gz') as tar:
    for p in sorted(ROOT.rglob('*')):
        if p.is_file() or p.is_dir() or p.is_symlink(): tar.add(p, arcname='exo-optchat/'+str(p.relative_to(ROOT)), recursive=False)
os.chmod(archive, 0o600)
verified = {}
with tarfile.open(archive, 'r:gz') as tar:
    for item in tar:
        if item.isfile():
            data = tar.extractfile(item).read()
            verified[item.name.removeprefix('exo-optchat/')] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
assert verified == before, 'Archive content mismatch'
assert inventory() == before, 'Source changed during snapshot'
receipt = {'captured': datetime.now().astimezone().isoformat(), 'archive': str(archive),
           'archiveBytes': archive.stat().st_size, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
           'files': len(before), 'sourceBytes': sum(v['bytes'] for v in before.values()),
           'fileManifest': before, 'sourceStableDuringCapture': True, 'archiveEveryFileVerified': True,
           'remoteRestoreVerified': False, 'note': 'Private existing Syncthing backup destination. No credential files copied, no pruning, no remote acknowledgement asserted.'}
receiptPath = archive.with_suffix('.receipt.json'); receiptPath.write_text(json.dumps(receipt,indent=2)+'\n'); os.chmod(receiptPath,0o600)
(EVIDENCE/'canonical-before-handoff.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='fileManifest'},indent=2))
