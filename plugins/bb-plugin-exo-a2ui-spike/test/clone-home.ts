// Imported first by tests that load the Pi extension in clone mode. The extension refuses to run
// outside an explicitly cloned home (src/state.ts assertDeployment), so give this test process a
// throwaway home with the clone marker instead of depending on the machine's real home.
import {mkdtempSync,mkdirSync,writeFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
const home=mkdtempSync(join(tmpdir(),'exo-clone-home-'));
mkdirSync(join(home,'.exo-a2ui-spike'),{recursive:true});writeFileSync(join(home,'.exo-a2ui-spike','clone.json'),'{}');
process.env['HOME']=home;process.env['EXO_CONFIG']=join(home,'exosurface.json');
delete process.env['EXOSURFACE_MODE'];
