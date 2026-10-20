"use client";
import {useState} from "react";
import {Modal,Field} from "./ui";
export default function PastedLink({url,onInsert,onClose}:{url:string;onInsert:(text:string)=>void;onClose:()=>void}) {
  const [title,setTitle]=useState(url),[author,setAuthor]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const escape=(s:string)=>s.replace(/[\\`*_[\]<>]/g,"\\$&").replace(/[\r\n]+/g," ");
  const insert=(plain=false)=>{try{onInsert(plain?url:`[${escape(title.trim()||url)}](${url.replaceAll("(","%28").replaceAll(")","%29")})${author.trim()?" — "+escape(author.trim()):""}`);}catch(e){setError((e as Error).message);}};
  return <Modal title="Add a link" description="Give this source a title and an optional author. You can also paste the original URL." onClose={onClose}>
    <form onSubmit={e=>{e.preventDefault();insert();}}>
      <Field label="Title"><input autoFocus maxLength={500} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
      <Field label="Author (optional)"><input maxLength={300} value={author} onChange={e=>setAuthor(e.target.value)}/></Field>
      <p className="muted" style={{overflowWrap:"anywhere"}}>{url}</p>
      <button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const r=await fetch("/api/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({input:url})});const data=await r.json();if(!r.ok)throw Error(data.error||"Metadata is unavailable. Enter the title and author yourself.");if(data.title)setTitle(t=>!t||t===url?data.title:t);if(Array.isArray(data.authors))setAuthor(a=>a||data.authors.join(", "));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?"Looking up source…":"Look up title and author"}</button>
      {error&&<p role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" onClick={()=>insert(true)}>Paste URL only</button><button className="primary" type="submit">Add link</button></div>
    </form>
  </Modal>;
}
