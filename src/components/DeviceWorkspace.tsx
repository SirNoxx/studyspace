"use client";
import { useEffect, useState } from "react";
import WorkspaceApp from "./WorkspaceApp";

export default function DeviceWorkspace() {
  const [key, setKey] = useState<string | null>(null);
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
      onWorkspaceSwitch={(id) => {
        sessionStorage.setItem("studyspace:device-workspace", id);
        history.replaceState({}, "", "/demo");
        setKey(id);
      }}
    />
  );
}
