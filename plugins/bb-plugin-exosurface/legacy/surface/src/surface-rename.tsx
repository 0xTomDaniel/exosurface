// The person's rename of a surface (#83, spec N5, N7, S12; story "I can rename it any time"), one for every place it starts:
// the sidebar's rows and the title at the top. Any surface but Home; a double-click or the pencil turns the name into a text
// field; Enter saves through thread_rename, Escape or leaving the field cancels, a refusal shows and keeps the field open.
// The pencil shows faintly at rest and fully on hover or keyboard focus, from this file's own stylesheet (renameStyle): no
// hover media query, as BB's host Tailwind wraps group-hover: in @media (hover:hover), which never matches on a Chromium that
// finds no pointer it calls a mouse (sebox's xrdp "Mouse" device, owner walkthrough of PR #91).
import {useRef,useState} from 'react';
import {useRpc} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';

/** Rename state for one place renaming starts. `onSaved` gets the name the server stored. */
export function useRename(onSaved:(threadId:string,title:string)=>void|Promise<unknown>){
 const rpc=useRpc<typeof rpcContract>();
 const[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),saving=useRef(false);
 const start=(threadId:string,title:string)=>{setEditing(threadId);setDraft(title);setError('');};
 const cancel=()=>{setEditing(null);setError('');},leave=()=>{if(!saving.current)setEditing(null);};
 const save=async()=>{if(editing===null||saving.current)return;saving.current=true;setError('');try{const saved=await rpc.call('thread_rename',{threadId:editing,name:draft});setEditing(null);await onSaved(saved.threadId,saved.title);}catch(e){setError(String(e));}finally{saving.current=false;}};
 return {editing,draft,setDraft,error,start,cancel,leave,save};
}
export type Rename=ReturnType<typeof useRename>;

/** The name as a text field while it is being renamed. */
export function RenameField({rename,className}:{rename:Rename;className?:string}){
 return <input type="text" aria-label="Surface name" autoFocus value={rename.draft} maxLength={80} onChange={e=> { rename.setDraft(e.target.value); }}
  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void rename.save();}else if(e.key==='Escape'){e.preventDefault();rename.cancel();}}}
  onBlur={rename.leave} className={className}/>;
}

/** The pencil beside a surface's name; its holder carries `exo-renamable`, so hovering the holder shows it. */
export function RenameButton({title,onClick}:{title:string;onClick:()=>void}){
 return <button type="button" aria-label={`Rename ${title}`} title="Rename" onClick={onClick} className="exo-rename shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>;
}

export const renameStyle=`
.exo-rename{opacity:.45;transition:opacity .15s}
.exo-renamable:hover .exo-rename,.exo-rename:hover,.exo-rename:focus,.exo-rename:focus-visible{opacity:1}
`;
