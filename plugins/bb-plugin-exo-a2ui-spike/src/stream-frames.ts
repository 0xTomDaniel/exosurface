// Preview only complete JSON objects, never a repair parser's partial strings:
// whole A2UI messages, plus each completed component inside an updateComponents
// message that is still being written. No effects/authority; final tool
// validation + native result commit.
import {MAX_BYTES} from './workspace.ts';

// Scan from `from` and return each top-level JSON object/array that has closed
// and is followed by a delimiter (`,` or `]`), plus where an unfinished one starts.
function closedValues(text:string,from:number){
 const values:any[]=[];let depth=0,start=-1,quoted=false,escaped=false,open=-1;
 for(let i=from;i<text.length;i++){
  const c=text[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{'||c==='['){if(depth===0)start=i;depth++;}
  if(c==='}'||c===']'){
   if(depth===0)break;
   depth--;if(depth===0){if(!/^\s*[,\]]/.test(text.slice(i+1))){open=start;break;}values.push(JSON.parse(text.slice(start,i+1)));start=-1;}
  }
 }
 if(open<0&&start>=0)open=start;
 return {values,open};
}

// `{"version":"v0.9.1","updateComponents":{"surfaceId":"x","components":[` — surfaceId before components.
const PARTIAL_COMPONENTS=/^\{\s*(?:"version"\s*:\s*"([^"\\]*)"\s*,\s*)?"updateComponents"\s*:\s*\{\s*"surfaceId"\s*:\s*"([^"\\]+)"\s*,\s*"components"\s*:\s*\[/;

export class StreamFrames {
 text=''; consumed=0;
 append(delta:string){
  this.text+=delta;if(this.text.length>MAX_BYTES*2)throw Error('Stream preview exceeds bound');
  const header=/^\s*\{\s*"baseRevision"\s*:\s*(\d+)\s*,\s*"messages"\s*:\s*\[/.exec(this.text);
  if(!header)return null;
  const {values:frames,open}=closedValues(this.text,header[0].length),messages=[...frames];
  let partial=0;
  if(open>=0){
   const frame=this.text.slice(open),m=PARTIAL_COMPONENTS.exec(frame);
   if(m){const components=closedValues(frame,m[0].length).values;partial=components.length;
    if(partial)messages.push({version:m[1]||'v0.9.1',updateComponents:{surfaceId:m[2],components}});}
  }
  // Progress = complete messages, then components of the one being written.
  const progress=frames.length*1000+partial;
  if(progress<=this.consumed)return null;this.consumed=progress;
  return {baseRevision:Number(header[1]),messages};
 }
}
