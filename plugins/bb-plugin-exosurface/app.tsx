// The Exo tab (#128, spec pages-and-activity T1): the surfaces UI only; the legacy proof tab is no longer registered.
import {definePluginApp} from '@get-bb/plugin-sdk/app';
import surface from './legacy/surface/app';
export default definePluginApp(app=>{surface.setup(app);});
