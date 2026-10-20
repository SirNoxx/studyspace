"use client";
import { useEffect, useState } from "react";
import WorkspaceApp from "./WorkspaceApp";
import type { CloudAccount } from "@/lib/device";

export default function DeviceWorkspace() {
  const [key, setKey] = useState<string | null>(null);
  const [cloudAccount,setCloudAccount]=useState<CloudAccount | null>(null);
  useEffect(()=>{
    let alive=true,sequence=0;
    const refresh=()=>{const request=++sequence;return fetch("/api/session",{cache:"no-store"}).then((r)=>{if(!r.ok)throw Error("Account unavailable");return r.json();}).then((d)=>{if(alive&&request===sequence)setCloudAccount(d.user ?? null);}).catch(()=>{});};
    const changed=()=>{setCloudAccount(null);void refresh();};
    void refresh();window.addEventListener("focus",refresh);window.addEventListener("studyspace:account-changed",changed);
    return ()=>{alive=false;window.removeEventListener("focus",refresh);window.removeEventListener("studyspace:account-changed",changed);};
  },[]);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("workspace");
    const saved = sessionStorage.getItem("studyspace:device-workspace");
    const selected = requested ?? saved ?? "demo";
    const valid =
      selected === "demo" || /^device:[0-9a-f-]{36}$/.test(selected);
    setKey(valid ? selected : "demo");
  }, []);
  if (!key)
    return <div className="loading-screen">Opening your workspace…</div>;
  return (
    <WorkspaceApp
      key={key}
      demo
      account={key}
      localKey={key}
      cloudAccount={cloudAccount}
      onWorkspaceSwitch={(id) => {
        sessionStorage.setItem("studyspace:device-workspace", id);
        history.replaceState({}, "", "/demo");
        setKey(id);
      }}
    />
  );
}
