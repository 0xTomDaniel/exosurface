import {z} from 'zod';
import {snapshotSchema,deltaSchema,type Snapshot,type Delta} from './workspace.ts';
export const cursorSchema=z.object({epoch:z.string(),revision:z.number().int().nonnegative()}).strict();
export const previewSchema=z.object({toolCallId:z.string(),baseRevision:z.number().int().nonnegative(),messages:z.array(z.any()).max(32)}).strict();
export const deliverySchema=z.object({epoch:z.string(),checkpoint:snapshotSchema.nullable().optional(),updates:z.array(deltaSchema),preview:previewSchema.nullable()}).strict();
export type Delivery=z.infer<typeof deliverySchema>;
export function delivery(projection:{epoch:string;workspace:Snapshot|null;updates:Delta[]},cursor:z.infer<typeof cursorSchema>|null,preview:Delivery['preview']):Delivery{
 const revision=projection.workspace?.revision??0;
 const updates=projection.updates.filter(d=>d.revision>(cursor?.revision??0));
 const continuous=updates.every((d,i)=>d.baseRevision===(i?updates[i-1].revision:cursor?.revision));
 const caught=cursor?.revision===revision||(updates.at(-1)?.revision===revision&&continuous);
 return cursor?.epoch===projection.epoch&&caught?{epoch:projection.epoch,updates,preview}:{epoch:projection.epoch,checkpoint:projection.workspace,updates:[],preview};
}
