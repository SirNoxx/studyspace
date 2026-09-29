const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const {CloudBridge}=require("../cloud-bridge.cjs");
test("guest AI forwards quota identity and allowance without requiring a token",async t=>{
 let received;
 const f=await fixture(t,(url,init)=>{received=init;return new Response("free chat",{headers:{"X-AI-Remaining":"99","X-AI-Daily-Limit":"100"}});});
 const response=await f.request("/api/ai",{method:"POST",headers:{"x-studyspace-ai-client":"test-device"},body:"{}"});
 assert.equal(received.headers["x-studyspace-ai-client"],"test-device");assert.equal(received.headers.Authorization,undefined);
 assert.equal(response.headers.get("x-ai-remaining"),"99");assert.equal(await response.text(),"free chat");
});
async function fixture(t,handler=()=>null){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),"studyspace-bridge-test-"));
 let origin="https://cloud.example.test",external;
 const realFetch=global.fetch;
 global.fetch=async(url,init)=>{if(String(url).startsWith("http://127.0.0.1:"))return realFetch(url,init);const r=await handler(String(url),init);if(r)return r;if(String(url).endsWith("/api/desktop/config"))return Response.json({url:"https://auth.example.test",key:"test-public-key"});return Response.json({});};
 const bridge=new CloudBridge({folder,origin:()=>origin,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from("encrypted-test:"+s),decryptString:b=>b.toString().slice(15)},openExternal:async u=>{external=u;},onConnected:()=>{}});
 await bridge.start();
 t.after(async()=>{bridge.close();bridge.server.closeAllConnections();global.fetch=realFetch;await bridge.writes.catch(()=>{});assert.equal(path.dirname(path.resolve(folder)),path.resolve(os.tmpdir()));assert.ok(path.basename(folder).startsWith("studyspace-bridge-test-"));await fs.rm(folder,{recursive:true,force:true});});
 return {bridge,external:()=>external,setOrigin:o=>{origin=o;},request:(route,init={})=>realFetch(bridge.url+route,{...init,headers:{"x-studyspace-bridge":bridge.secret,...init.headers}})};
}
test("binds desktop sign-in to state and proxies streams without exposing credentials or personal workspace writes",async t=>{
 const seen=[];
 const f=await fixture(t,(url,init)=>{seen.push({url,init});if(url.endsWith("/api/desktop/handoff"))return Response.json({access_token:"test-access",refresh_token:"test-refresh",expires_at:Math.floor(Date.now()/1000)+3600});if(url.endsWith("/api/ai"))return new Response("data: first\n\ndata: second\n\n",{headers:{"Content-Type":"text/event-stream"}});return null;});
 await f.bridge.signIn();const next=new URL(new URL(f.external()).searchParams.get("next"),"https://cloud.example.test");
 assert.equal(next.pathname,"/desktop/connect");assert.equal(next.searchParams.get("challenge").length,43);
 assert.equal((await f.request("/callback?state=wrong&code=test")).status,400);
 const callback=new URL(next.searchParams.get("redirect"));callback.searchParams.set("state",next.searchParams.get("state"));callback.searchParams.set("code","test-code");
 assert.equal((await fetch(callback)).status,200);
 assert.equal((await fetch(callback)).status,400);
 assert.equal((await f.request("/api/workspace",{method:"PUT",body:"{}"})).status,403);
 assert.equal((await f.request("/api/device/cloud-workspace",{method:"PUT",body:"{}"})).status,405);
 assert.equal((await fetch(f.bridge.url+"/api/ai")).status,403);
 const stream=await f.request("/api/ai",{method:"POST",body:"{}",headers:{"Content-Type":"application/json"}});
 assert.match(stream.headers.get("content-type"),/event-stream/);assert.match(stream.headers.get("cache-control"),/no-transform/);assert.match(await stream.text(),/first[\s\S]*second/);
 assert.equal(seen.find(r=>r.url.endsWith("/api/ai")).init.headers.Authorization,"Bearer test-access");
 await f.request("/api/device/cloud-assets/abc");assert.ok(seen.some(r=>r.url.endsWith("/api/attachments/abc")));
});
test("changing the configured cloud cannot forward the old account token",async t=>{
 const seen=[];const f=await fixture(t,(url,init)=>{seen.push({url,init});return null;});
 await f.bridge.store({access_token:"old-private-token",refresh_token:"refresh",expires_at:Math.floor(Date.now()/1000)+3600});
 f.setOrigin("https://other.example.test");
 await f.request("/api/social");assert.equal(f.bridge.tokens,null);
 assert.equal(seen.find(r=>r.url.endsWith("/api/social")).init.headers.Authorization,undefined);
 await assert.rejects(fs.readFile(f.bridge.file));
});
test("a refresh completing after sign-out cannot restore the account",async t=>{
 let complete,started;const began=new Promise(r=>{started=r;});
 const f=await fixture(t,async url=>{if(url.includes("grant_type=refresh_token")){started();return new Promise(r=>{complete=r;});}return null;});
 await f.bridge.store({access_token:"expired",refresh_token:"old-refresh",expires_at:0});
 const refresh=f.bridge.accessToken();const rejected=assert.rejects(refresh,/connection changed/);
 await began;await f.bridge.signOut();
 complete(Response.json({access_token:"late-access",refresh_token:"late-refresh",expires_in:3600}));
 await rejected;assert.equal(f.bridge.tokens,null);await assert.rejects(fs.readFile(f.bridge.file));
});

test("sign-out during callback cleanup cancels the handoff before tokens are exchanged",async t=>{
 const seen=[];const f=await fixture(t,(url)=>{seen.push(url);return null;});
 await f.bridge.signIn();
 const state=f.bridge.pending.state;
 let resume,entered;const started=new Promise(r=>{entered=r;});
 const original=f.bridge.clearSession.bind(f.bridge);
 f.bridge.clearSession=async()=>{await original();entered();await new Promise(r=>{resume=r;});};
 const callback=f.request("/callback?state="+state+"&code=test");
 await started;
 await original(); // The user signs out while callback cleanup is in flight.
 resume();
 assert.equal((await callback).status,503);
 assert.equal(f.bridge.tokens,null);
 assert.ok(!seen.some(url=>url.endsWith("/api/desktop/handoff")));
});

test("a newer sign-in attempt invalidates an in-flight handoff",async t=>{
 let complete,entered;const started=new Promise(r=>{entered=r;});
 const f=await fixture(t,async url=>{if(url.endsWith("/api/desktop/handoff")){entered();return new Promise(r=>{complete=r;});}return null;});
 await f.bridge.signIn();const state=f.bridge.pending.state;
 const callback=f.request("/callback?state="+state+"&code=test");
 await started;await f.bridge.signIn();
 complete(Response.json({access_token:"stale-signin",refresh_token:"stale",expires_at:9999999999}));
 assert.equal((await callback).status,503);
 assert.equal(f.bridge.tokens,null);
 assert.notEqual(f.bridge.pending.state,state);
});

test("shared documents and attachments use the signed-in cloud connection",async t=>{
 const seen=[];const f=await fixture(t,(url,init)=>{seen.push({url,init});return null;});
 await f.bridge.store({access_token:"shared-access",refresh_token:"refresh",expires_at:Math.floor(Date.now()/1000)+3600});
 for(const route of ["/api/shared/live?id=test","/api/shared/history?collection=test","/api/shared/assets","/api/attachments/test"]){
  await f.request(route);const forwarded=seen.find(r=>r.url.endsWith(route));assert.ok(forwarded);assert.equal(forwarded.init.headers.Authorization,"Bearer shared-access");
 }
});
