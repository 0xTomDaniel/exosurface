from pathlib import Path
import json,hashlib,datetime,time
h=Path.home();root=h/'.exo-a2ui-spike';receipt=json.loads((root/'clone.json').read_text());source=Path(receipt['sourceHome'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def original_prefix(path, digest):
 # The source owner can independently append while this clone is tested. Find
 # the exact captured SHA at a JSONL boundary; never tolerate a rewrite.
 data=path.read_bytes(); hsh=hashlib.sha256(); size=0;count=0
 for line in data.splitlines(keepends=True):
  hsh.update(line);size+=len(line);count+=1
  if hsh.hexdigest()==digest:return size,count
 raise AssertionError(f'Original captured prefix missing: {path}')
unchanged=[];appended=[]
for rel,digest in receipt['sourceManifest'].items():
 p=source/rel;assert p.exists(),f'Main file missing: {rel}'
 if sha(p)==digest:unchanged.append(rel);continue
 assert rel.endswith('.jsonl') and ('/memories/' in rel or rel.endswith('/usage.jsonl')),f'Unexpected changed file: {rel}'
 original_prefix(p,digest);appended.append(rel)
source_bytes,old_entries=original_prefix(Path(receipt['sourceSession']),receipt['sourceJournalSha256'])
# Capture a complete LF-delimited prefix while the independent owner may append.
# str.splitlines() incorrectly splits valid literal U+2028 inside JSON strings.
for attempt in range(10):
 main_data=Path(receipt['sourceSession']).read_bytes()
 if main_data.endswith(b'\n'):break
 time.sleep(0.05)
else:raise AssertionError('Main native writer has an incomplete tail; coverage remains open, no repair attempted')
main_text=main_data.decode('utf-8');assert 'UI_mv7dzoj2' not in main_text and 'UI_mv7e1146' not in main_text,'Synthetic trial token contaminated main' 
owner=json.loads((h/'.exo-bb-spike/owner/state.json').read_text());clone=json.loads((root/'owner/state.json').read_text());assert owner['ready'] and owner['piPid']==24389
assert clone['ready'] and clone['piPid']!=owner['piPid'] and clone['sessionFile']!=owner['sessionFile']
base=Path(__file__).resolve().parent.parent
if (base/'evidence/generative-ui.json').exists():
 token=json.loads((base/'evidence/generative-ui.json').read_text())['token'];assert token not in main_text,'Generative trial token appeared in main; inspect source before claiming isolation'
if (base/'evidence/incremental/baseline.json').exists():
 token=json.loads((base/'evidence/incremental/baseline.json').read_text())['token'];assert token not in main_text,'Incremental trial token appeared in main'
main_entries=[json.loads(line) for line in main_text.split('\n') if line]
assert not any(e.get('message',{}).get('toolName') in {'publish_workspace','apply_workspace','configure_composition'} for e in main_entries),'UI publication/update/configuration found in main'
assert not any(e.get('customType') in {'exosurface-composition-commit','exosurface-composition-offer','exosurface-composition-run'} for e in main_entries),'Composition native entry found in main'
for name,field in [('configure.json','token'),('live-timed.json','token')]:
 p=base/'evidence/jev'/name
 if p.exists():assert json.loads(p.read_text())[field] not in main_text,'Jev trial token appeared in main' 
adapter=json.loads((base/'evidence/adapter-source.json').read_text());assert all(sha(Path(adapter['source'])/f)==digest for f,digest in adapter['files'].items()), 'Main plugin source changed'
# Trial-only catalog estimates, not provider billing. Includes the failed assertion
# and every actual UI composition/awareness assistant call after cloning.
es=[json.loads(l) for l in Path(receipt['sessionFile']).read_text().split('\n') if l];fresh=es[old_entries:]
assistant=[e['message'] for e in fresh if e.get('message',{}).get('role')=='assistant'];models=sorted({f"{m['provider']}/{m['model']}" for m in assistant});assert models==['anthropic/claude-opus-5-5']
result={'verifiedAt':datetime.datetime.now().astimezone().isoformat(),'mainProfileFilesHashIdentical':len(unchanged),'mainProfileFilesExactAppendOnly':appended,'mainJournalCapturedPrefixHashIdentical':True,'mainIndependentAppendBytes':len(main_data)-source_bytes,'mainLfRecordsValidated':len(main_entries),'mainOwnerIndependentlyStreaming':owner['streaming'],'trialMarkersAbsentFromMain':True,'nativeUiPublicationsAbsentFromMain':True,'mainPiPidUnchanged':owner['piPid'],'mainAdapterFilesHashIdentical':len(adapter['files']),'clonePiPid':clone['piPid'],'cloneSessionId':receipt['cloneSessionId'],'actualModels':models,'freshAssistantMessages':len(assistant),'catalogCostEstimateAllUIProofsMainOnly':sum(m.get('usage',{}).get('cost',{}).get('total',0) for m in assistant),'notVendorBilling':True,'cloneOnly':True,'migratedToMain':False}
(base/'evidence/preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
