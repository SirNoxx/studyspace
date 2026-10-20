"use client";
import { useRef,useState } from "react";
import { Modal } from "./ui";
import Markdown from "./Markdown";
import { downloadBytes } from "@/lib/transfer";
import type { Note,Attachment } from "@/lib/model";
const printStyles=`body{font:12pt/1.55 Arial,sans-serif;color:#17251e;margin:25mm;overflow-wrap:anywhere}h1,h2,h3{break-after:avoid}h1{font-size:24pt}pre{white-space:pre-wrap;font:10pt/1.4 Consolas,monospace;background:#f2f4f2;padding:12px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #aaa;padding:7px;vertical-align:top}img,svg{max-width:100%;height:auto}a{color:#245e50}.whiteboard-tools,.whiteboard-footer,.whiteboard-navigation,button,select,.module-controls{display:none!important}.module-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.calendar-day{min-height:70px;border:1px solid #aaa;padding:5px}.module-text{white-space:pre-wrap}.study-whiteboard,.note-module{break-inside:avoid;margin:16px 0}@page{margin:18mm}@media print{body{margin:0}}`;
export default function DocumentExport({note,attachments=[],demo,onClose}:{note:Pick<Note,"title"|"body">;attachments?:Attachment[];demo:boolean;onClose:()=>void}) {
 const preview=useRef<HTMLDivElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const name=(note.title || "Untitled note").replace(/[<>:"/\\|?*]/g,"-");
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const html=async()=>{
  const clone=preview.current!.cloneNode(true) as HTMLElement;
  for(const img of Array.from(clone.querySelectorAll("img")))if(img.src.startsWith("blob:")){
   const blob=await (await fetch(img.src)).blob();img.src=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});
  }
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'"><title>'+name.replace(/[&<>]/g,"")+"</title><style>"+printStyles+"</style></head><body>"+clone.innerHTML+"</body></html>";
 };
 const print=()=>run(async()=>{
  const source=await html();const frame=document.createElement("iframe");frame.title="Printable note";frame.style.cssText="position:fixed;left:-10000px;width:800px;height:1100px;";
  await new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(Error("Print preview could not open."));frame.srcdoc=source;document.body.appendChild(frame);});
  try{await frame.contentDocument?.fonts.ready;await Promise.all(Array.from(frame.contentDocument?.images ?? []).map(img=>img.decode().catch(()=>{})));frame.contentWindow?.focus();frame.contentWindow?.print();}finally{setTimeout(()=>frame.remove(),60000);}
 });
 return <Modal title="Print & export note" onClose={onClose} wide><div className="social-row">
  <button disabled={busy} onClick={()=>void print()}>Print / Save as PDF</button>
  <button disabled={busy} onClick={()=>void run(async()=>{const {wordDocument}=await import("@/lib/document-conversion");const blob=await wordDocument(note.title,note.body);downloadBytes(new Uint8Array(await blob.arrayBuffer()),name+".docx",blob.type);})}>Word (.docx)</button>
  <button disabled={busy} onClick={()=>downloadBytes(new TextEncoder().encode(note.body),name+".md","text/markdown")}>Markdown</button>
  <button disabled={busy} onClick={()=>downloadBytes(new TextEncoder().encode(preview.current?.innerText ?? note.body),name+".txt","text/plain")}>Text</button>
  <button disabled={busy} onClick={()=>void run(async()=>downloadBytes(new TextEncoder().encode(await html()),name+".html","text/html"))}>HTML</button>
 </div><p className="muted">Choose Save as PDF (or Microsoft Print to PDF) in the print dialog. Word preserves editable text, lists and tables; use PDF or HTML for drawings and visual modules. Review the preview before exporting.</p>
 {error&&<p role="alert">{error}</p>}<div ref={preview} className="document-export-preview"><h1>{note.title}</h1><Markdown body={note.body} attachments={attachments} demo={demo}/></div></Modal>;
}
