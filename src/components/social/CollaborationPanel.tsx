"use client";
import { useEffect,useState,useRef } from "react";
import { serviceCommand } from "@/lib/services";
export default function CollaborationPanel({kind,collection,canInvite=false,onChange}:{kind:"planner"|"collection";collection?:string;canInvite?:boolean;onChange?:()=>void}) {
 const [data,setData]=useState<any>(null),[email,setEmail]=useState(""),[role,setRole]=useState("editor"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const pending=useRef<{key:string;id:string}|null>(null);
 const reload=()=>fetch("/api/collaboration",{cache:"no-store"}).then(async(r)=>{const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}).catch(e=>setError(e.message));
 useEffect(()=>{void reload();const timer=setInterval(()=>{if(document.visibilityState==="visible")void reload();},15000);return()=>clearInterval(timer);},[]);
 const run=async(action:string,payload:Record<string,unknown>)=>{setBusy(true);setError("");try{const r=await serviceCommand(action,payload);await reload();onChange?.();return r;}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section className="social-form" aria-label={kind==="planner"?"Planner collaboration":"Email invitations"}>
  {canInvite && <form onSubmit={async(e)=>{e.preventDefault();const key=JSON.stringify([kind,collection,role,email.trim().toLowerCase()]);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};const r=await run("invite",{id:pending.current.id,kind,collection,role,email});if(r){pending.current=null;setEmail("");setMessage(r.emailConfigured?"Invitation created. Email delivery is queued.":"Invitation created and available in Studyspace. Email delivery awaits the app operator's email setup.");}}}>
   <h3>Invite by email</h3><label>Email address<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} /></label>
   {kind==="collection" && <label>Permission<select value={role} onChange={e=>setRole(e.target.value)}><option value="editor">Editor</option><option value="viewer">Viewer</option></select></label>}
   <p className="muted">They can accept after signing in with this verified email address, including after creating a new account.</p>
   <button className="primary" disabled={busy || !email.trim()}>Send invitation</button>
  </form>}
  {data?.invitations?.filter((i:any)=>i.kind===kind && (collection ? i.collection_id===collection : true)).map((i:any)=><div className="social-card" key={i.id}>
   <strong>{i.collection_title || "Planner collaboration"}</strong><p>{i.sender_id===data.viewer?i.recipient_email:"You have a collaboration invitation"} · {i.role}</p>
   <div className="social-row">{i.sender_id===data.viewer?<button disabled={busy} onClick={()=>void run("invitation",{id:i.id,status:"revoked"})}>Revoke invitation</button>:<><button disabled={busy} onClick={()=>void run("invitation",{id:i.id,status:"accepted"})}>Accept invitation</button><button disabled={busy} onClick={()=>void run("invitation",{id:i.id,status:"declined"})}>Decline</button></>}</div>
  </div>)}
  {kind==="planner" && data?.connections?.map((p:any)=><div className="social-row" key={p.id}><span>{p.name}</span><button disabled={busy} onClick={()=>void run("disconnect",{target:p.id})}>Remove planner access</button></div>)}
  {error && <p role="alert">{error} <button onClick={()=>void reload()}>Retry</button></p>}{message && <p role="status">{message}</p>}
 </section>;
}
