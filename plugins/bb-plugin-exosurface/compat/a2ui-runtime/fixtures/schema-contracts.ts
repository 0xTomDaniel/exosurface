// Compile-only, unchanged legacy schema API alongside the SDK's separate Zod4.
import {z} from 'zod';
import {z as v3} from 'zod/v3';
import {Catalog,ComponentIdSchema,DynamicStringSchema} from '@a2ui/web_core/v0_9';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import type {ReactCatalogComponent} from '@a2ui/react/v0_9';
import {renderMarkdown} from '@a2ui/markdown-it';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {defineRpcContract} from '@get-bb/plugin-sdk';
const shape=z.object({child:ComponentIdSchema,text:DynamicStringSchema});
const component:Pick<ReactCatalogComponent,'name'|'schema'>={name:'ReviewFixture',schema:shape};
const catalog=new Catalog('urn:exosurface:review-fixture','0.9',[component],[]);
const sameSchema:v3.ZodTypeAny=shape;
const converted=zodToJsonSchema(sameSchema);
const sdkContract=defineRpcContract({});
export {catalog,converted,sdkContract,basicCatalog,renderMarkdown};
