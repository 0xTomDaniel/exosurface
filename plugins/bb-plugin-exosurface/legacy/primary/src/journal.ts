import { openSync, readSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
const contentSchema = z.object({ type: z.string(), id: z.string().optional(), name: z.string().optional(), arguments: z.unknown().optional() }).catchall(z.unknown());
const messageSchema = z.object({ role: z.string(), stopReason: z.string().optional(), content: z.union([z.string(), z.array(contentSchema)]).optional(),
  toolCallId: z.string().optional(), toolName: z.string().optional(), isError: z.boolean().optional(), display: z.boolean().optional() }).catchall(z.unknown());
const entrySchema = z.object({ type: z.string(), message: messageSchema.optional(), customType: z.string().optional(),
  content: z.unknown().optional(), display: z.boolean().optional(), details: z.unknown().optional() });
/** Restore a bounded suffix of Pi's authoritative JSONL journal, not context. */
export function replayJournalSuffix(file: string, offset: number, through: number, emit: (e: Record<string, unknown>) => void) {
  if (offset > through || offset < 0) throw new Error('Native journal cursor invalid; refusing unsafe projection');
  const fd = openSync(file, 'r'); const decoder = new StringDecoder('utf8');
  let at = offset, buffer = '', opened = false, aborted = false;
  const begin = () => { if (!opened) { opened = true; emit({ type: 'agent_start', replayed: true }); } };
  try {
    while (at < through) {
      const bytes = Buffer.alloc(Math.min(65536, through-at)); const n=readSync(fd,bytes,0,bytes.length,at);if(!n)break;
      at+=n; buffer+=decoder.write(bytes.subarray(0,n));let newline:number;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line)continue;
        const entry=entrySchema.parse(JSON.parse(line));
        if(entry.type==='custom_message'){
          if(entry.display){begin();emit({type:'message_end',message:{role:'custom',customType:entry.customType,content:entry.content,display:entry.display,details:entry.details}});}
          continue;
        }
        const m=entry.type==='message'?entry.message:undefined;
        if(!m)continue;
        if(m.role==='assistant'){
          begin();aborted=m.stopReason==='aborted';emit({type:'message_start',message:m});emit({type:'message_end',message:m});
          for(const call of typeof m.content==='string'?[]:m.content??[])if(call.type==='toolCall')emit({type:'tool_execution_start',toolCallId:call.id,toolName:call.name,args:call.arguments});
        }else if(m.role==='toolResult'){
          begin();emit({type:'tool_execution_end',toolCallId:m.toolCallId,toolName:m.toolName,isError:m.isError,result:{content:m.content}});
        }else if(m.role==='custom'&&m.display){begin();emit({type:'message_end',message:m});}
      }
      if(buffer.length>64*1024*1024)throw new Error('Individual native journal record exceeds presentation bound');
    }
    if(buffer.trim())throw new Error('Native journal snapshot has an incomplete record');
    return {opened,aborted};
  }finally{closeSync(fd);}
}
