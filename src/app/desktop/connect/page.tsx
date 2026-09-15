"use client";
import { useState } from "react";
export default function ConnectDesktop() {
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 return <main className="auth-page"><section className="auth-panel"><h1>Connect your desktop</h1><p>Connect the Studyspace desktop app you just opened to this account. Your personal notes stay on your device.</p>
 <button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try {
  const p=new URLSearchParams(location.search);
  const r=await fetch("/api/desktop/handoff",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challenge:p.get("challenge"),state:p.get("state"),redirect:p.get("redirect")})});
  const d=await r.json();if(!r.ok)throw Error(d.error);location.assign(d.redirect);
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Connect Studyspace desktop</button>
 {message && <p role="alert">{message}</p>}</section></main>;
}
