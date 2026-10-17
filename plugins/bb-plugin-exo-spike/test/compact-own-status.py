"""One-time BB0.45 repair of this adapter's redundant status metadata only.
No conversation trimming, schema/index/bundle patch, or recurring DB integration.
Private consistent backup + tested-copy preservation are required before --apply.
"""
from pathlib import Path
from datetime import datetime
import sqlite3, hashlib, json, sys, time
BASE = Path(__file__).resolve().parent.parent
DB = Path.home()/'.bb/bb.db'
DEST = Path.home()/'.exo-bb-spike/backups'
DEST.mkdir(parents=True,exist_ok=True,mode=0o700)
assert json.loads(Path('/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/package.json').read_text())['version']=='0.45.0','Version-specific one-time repair; re-review before other versions'
KIND = 'exo-spike/pi-ui'
DELETE = """DELETE FROM events WHERE type='thread/extensionState/updated'
AND json_extract(data,'$.kind')=? AND id NOT IN
(SELECT e.id FROM events e WHERE e.type='thread/extensionState/updated'
AND json_extract(e.data,'$.kind')=? AND e.sequence=(SELECT MAX(n.sequence) FROM events n
WHERE n.thread_id=e.thread_id AND n.type=e.type AND json_extract(n.data,'$.kind')=?))"""
def fingerprint(c):
    h=hashlib.sha256();count=0
    for row in c.execute("SELECT id,thread_id,sequence,type,data FROM events WHERE NOT(type='thread/extensionState/updated' AND COALESCE(json_extract(data,'$.kind'),'')=?) ORDER BY thread_id,sequence",(KIND,)):
        h.update(json.dumps(row,separators=(',',':')).encode());count+=1
    return {'rows':count,'sha256':h.hexdigest()}
def latest(c):
    return c.execute("SELECT thread_id,MAX(sequence) FROM events WHERE type='thread/extensionState/updated' AND json_extract(data,'$.kind')=? GROUP BY thread_id",(KIND,)).fetchall()
def shrink(c):
    before=fingerprint(c); heads=latest(c);ids={r[0] for r in c.execute("SELECT id FROM events WHERE type='thread/extensionState/updated' AND json_extract(data,'$.kind')=?",(KIND,))}
    assert not c.execute('SELECT 1 FROM retained_event_outputs WHERE event_id IN ('+','.join('?' for _ in ids)+') LIMIT 1',list(ids)).fetchone() if ids else True
    with c:
        c.execute('PRAGMA foreign_keys=ON')
        n=c.execute(DELETE,(KIND,KIND,KIND)).rowcount
        assert fingerprint(c)==before,'Non-owned-state event changed'
        assert latest(c)==heads,'Latest state/high-water mark changed'
    return {'removedSupersededOwnStatusSnapshots':n,'nonStatusEvents':before,'latestOwnStatePerThreadPreserved':True}
source=sqlite3.connect(f'file:{DB}?mode=ro',uri=True,timeout=5);source.execute('pragma query_only=on')
stamp=datetime.now().astimezone().strftime('%Y%m%dT%H%M%S%z')
backup=DEST/f'bb-before-status-repair-{stamp}.sqlite';target=sqlite3.connect(backup);source.backup(target);target.close();source.close();backup.chmod(0o600)
assert sqlite3.connect(backup).execute('pragma integrity_check').fetchone()[0]=='ok'
copy=DEST/f'bb-status-repair-dry-run-{stamp}.sqlite';s=sqlite3.connect(backup);d=sqlite3.connect(copy);s.backup(d);s.close();dry=shrink(d);d.close();copy.chmod(0o600)
result={'captured':datetime.now().astimezone().isoformat(),'databaseBackup':str(backup),'backupSha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'copyResult':dry,'applied':False,'scope':'Only exo-spike/pi-ui superseded latest-state metadata; all conversation/tool/foreign events preserved'}
if '--apply' in sys.argv:
    live=sqlite3.connect(DB,timeout=5);actual=shrink(live);live.close();result['liveResult']=actual;result['applied']=True
(BASE/'evidence/status-repair.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
