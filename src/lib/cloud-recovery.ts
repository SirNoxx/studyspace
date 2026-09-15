import {localDB} from "./store";
import {normalizeWorkspace} from "./enhancements";
import {validateWorkspace} from "./domain";
import {sha256} from "./transfer";
import {uid,type Workspace} from "./model";

/** Copy only after every asset is available. Never overwrite the source workspace. */
export async function recoverCloudWorkspace(account:string) {
  const db=await localDB(),marker="cloud-recovery:"+account;
  const prior=await db.get("navigation",marker);
  if(typeof prior==="string" && await db.get("workspaces",prior))return prior;
  const desktop=!!window.studyspaceDevice;
  const response=await fetch(desktop?"/api/device/cloud-workspace":"/api/workspace",{cache:"no-store"});
  if(!response.ok)throw Error("Could not read your previous cloud notes. Reconnect your account and retry.");
  const w=normalizeWorkspace(await response.json() as Workspace);validateWorkspace(w);
  const blobs=new Map<string,Blob>();
  for(const asset of w.attachments) {
    const existing=await db.get("assets",asset.id) as Blob|undefined;
    if(existing) {
      if(await sha256(new Uint8Array(await existing.arrayBuffer()))!==asset.hash)throw Error("An attachment identifier conflicts with a local file. Your existing files were preserved.");
      continue;
    }
    const r=await fetch((desktop?"/api/device/cloud-assets/":"/api/attachments/")+asset.id+"?includeTrashed=1");
    if(!r.ok)throw Error(`Could not recover ${asset.filename}. The cloud workspace is unchanged; retry when this file is available.`);
    const blob=await r.blob();if(await sha256(new Uint8Array(await blob.arrayBuffer()))!==asset.hash)throw Error("An attachment checksum did not match. Retry recovery.");
    blobs.set(asset.id,blob);
  }
  const session=await fetch("/api/session",{cache:"no-store"}).then(r=>r.json());
  if(session.user?.id!==account)throw Error("The signed-in account changed. Start recovery again.");
  w.settings.workspaceName=(w.settings.workspaceName||"My workspace")+" · recovered";
  w.settings.onboardingComplete=true;
  const id="device:"+uid(),tx=db.transaction(["workspaces","assets","navigation"],"readwrite");
  // Serialize simultaneous recovery attempts from separate browser tabs.
  const winner=await tx.objectStore("navigation").get(marker);
  if(typeof winner==="string" && await tx.objectStore("workspaces").get(winner)){await tx.done;return winner;}
  for(const [asset,blob] of blobs)await tx.objectStore("assets").put(blob,asset);
  await tx.objectStore("workspaces").put(w,id);await tx.objectStore("navigation").put(id,marker);await tx.done;
  return id;
}
