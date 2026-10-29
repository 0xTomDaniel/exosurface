// Consolidation only: existing primary controls + unchanged main surface UI.
import {definePluginApp} from '@get-bb/plugin-sdk/app';
import primary from './legacy/primary/app';
import surface from './legacy/surface/app';
export default definePluginApp(app=>{primary.setup(app);surface.setup(app);});
