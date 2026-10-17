import { openSync, readSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
/** Restore a bounded suffix of Pi's authoritative JSONL journal, not context. */
export function replayJournalSuffix(file: string, offset: number, through: number, emit: (e: any) => void) {
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
        const entry=JSON.parse(line);
        const m=entry.type==='message'?entry.message:entry.type==='custom_message'?{role:'custom',customType:entry.customType,content:entry.content,display:entry.display,details:entry.details}:undefined;
        if(!m)continue;
        if(m.role==='assistant'){
          begin();aborted=m.stopReason==='aborted';emit({type:'message_start',message:m});emit({type:'message_end',message:m});
          for(const call of m.content??[])if(call.type==='toolCall')emit({type:'tool_execution_start',toolCallId:call.id,toolName:call.name,args:call.arguments});
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
