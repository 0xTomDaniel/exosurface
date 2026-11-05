// One app bundle's own custom element tag names (PR #89 blocker). BB loads a reinstalled or reloaded plugin's new app bundle
// into its long-lived window, and customElements.define cannot be undone: the window's one registry still holds the earlier
// bundle's A2UI element classes under the A2UI tag names, and A2UI throws "Custom element tag name collision" when this
// bundle registers its own classes under the same names (@a2ui/web_core registerUniversalElement), so BB disabled the slot.
// Keeping the earlier bundle's elements instead would render this bundle's pages with that bundle's Lit, signals and
// controllers, and its children would collide again. So every element this bundle renders gets a tag name of its own: the
// A2UI tag name plus a suffix drawn once per bundle evaluation, and a subclass of A2UI's element (one class per tag name).
// The catalogs keep their ids and component APIs; A2UI scopes each element's styles by its tag name.
import {Catalog} from '@a2ui/web_core/v0_9';
import {isWebComponentImplementation} from '@a2ui/web_core/v0_9/universal';

const random=new Uint32Array(1);crypto.getRandomValues(random);
/** This bundle's suffix, e.g. "x3k9fq": lowercase letters and digits, so `<tag>-<suffix>` stays a valid custom element name. */
export const BUNDLE_SUFFIX='x'+random[0].toString(36);
/** The tag name this bundle renders A2UI's element `tag` under. */
export const bundleTag=(tag:string)=>`${tag}-${BUNDLE_SUFFIX}`;

const own=new WeakMap<object,any>();
function scoped(implementation:any){
 if(!isWebComponentImplementation(implementation))return implementation;
 let entry=own.get(implementation);
 if(!entry){const tagName=bundleTag(implementation.tagName),base=implementation.element as any;
  entry={...implementation,tagName,element:class extends base{static tagName=tagName;}};own.set(implementation,entry);}
 return entry;
}
// Every entry stored, including the element entries @a2ui/react's A2uiSurface adds for React components when it prepares a
// catalog (it sets them into this map), takes this bundle's tag name.
class BundleComponents extends Map<string,any>{override set(name:string,implementation:any){return super.set(name,scoped(implementation));}}
/** Copies of `catalogs` (same ids, APIs, functions and theme) whose elements carry this bundle's tag names. */
export function bundleCatalogs(catalogs:Catalog<any>[]):Catalog<any>[]{
 return catalogs.map(c=>{const copy=new Catalog(c.id,c.protocolVersion,[],[...c.functions.values()],c.themeSchema,c.instructions);
  (copy as any).components=new BundleComponents(c.components);return copy;});
}
