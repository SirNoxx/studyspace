import type {Snapshot} from "./model";
import {localDB} from "./store";
export async function publishDeviceSnapshot(snapshot:Snapshot, loadAsset?: (id:string)=>Promise<Blob>):Promise<Snapshot> {
 const send=async(action:string)=>{const response=await fetch("/api/publications/device",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,snapshot})});const data=await response.json();if(!response.ok)throw Error(data.error||"Publishing failed. Your local notes are unchanged.");return data;};
 const stage=await send("stage");if(stage.alreadyPublished)return stage.snapshot;
 const db=await localDB();
 for(const upload of stage.uploads) {
  const asset=snapshot.attachments?.find(a=>a.id===upload.id),blob=loadAsset ? await loadAsset(upload.id) : await db.get("assets",upload.id) as Blob|undefined;
  if(!asset||!blob)throw Error("A selected attachment is unavailable on this device.");
  const url=new URL(upload.url);if(url.protocol!=="https:"||!url.hostname.endsWith(".supabase.co"))throw Error("Upload destination was rejected.");
  const form=new FormData();form.append("cacheControl","0");form.append("",blob,asset.filename);
  const r=await fetch(url,{method:"PUT",body:form});
  if(!r.ok){const error=await r.json().catch(()=>({}));if(r.status!==409 && error.error!=="Duplicate" && error.statusCode!=="409")throw Error("Attachment upload failed. Retry publishing; your notes remain saved locally.");}
 }
 return (await send("publish")).snapshot;
}
