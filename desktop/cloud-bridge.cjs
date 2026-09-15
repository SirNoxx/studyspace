const http=require("node:http");
const fs=require("node:fs/promises");
const path=require("node:path");
const {randomBytes,createHash}=require("node:crypto");
const {Readable}=require("node:stream");
const {pipeline}=require("node:stream/promises");
const allowed=/^\/api\/(session|social|shared|attachments|ai|community|publications|public-assets|journal-templates|jobs|metadata|extract|reader|transcripts|account|moderation|google|planner|collaboration|device\/cloud-workspace|device\/cloud-assets)(\/|\?|$)/;
const digest=(s)=>createHash("sha256").update(s).digest("base64url");
class CloudBridge {
 constructor({origin,folder,safeStorage,openExternal,onConnected}) {Object.assign(this,{origin,folder,safeStorage,openExternal,onConnected});this.secret=randomBytes(32).toString("hex");this.tokens=null;this.pending=null;this.generation=0;this.writes=Promise.resolve();}
 async start() {
  this.file=path.join(this.folder,"cloud-session.enc");
  try {const saved=JSON.parse(this.safeStorage.decryptString(await fs.readFile(this.file)));if(saved.origin===this.origin()){this.tokens=saved.tokens;this.tokenOrigin=saved.origin;}}catch{}
  this.server=http.createServer((req,res)=>this.handle(req,res).catch(()=>{if(!res.headersSent){res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Cloud connection unavailable. Your notes are saved locally."}));}else res.destroy();}));
  await new Promise((resolve,reject)=>{this.server.once("error",reject);this.server.listen(0,"127.0.0.1",resolve);});
  this.url="http://127.0.0.1:"+this.server.address().port;
  return {STUDYSPACE_BRIDGE_URL:this.url,STUDYSPACE_BRIDGE_SECRET:this.secret};
 }
 async store(tokens,origin=this.origin(),generation=this.generation) {
  if(!this.safeStorage.isEncryptionAvailable())throw Error("Secure account storage is unavailable on this device.");
  const current=()=>generation===this.generation && origin===this.origin();
  const operation=this.writes.catch(()=>{}).then(async()=>{
   if(!current())throw Error("Account connection changed.");
   await fs.mkdir(this.folder,{recursive:true});
   await fs.writeFile(this.file+".tmp",this.safeStorage.encryptString(JSON.stringify({origin,tokens})));
   if(!current()){await fs.rm(this.file+".tmp",{force:true});throw Error("Account connection changed.");}
   await fs.rename(this.file+".tmp",this.file);
   if(!current())throw Error("Account connection changed.");
   this.tokens=tokens;this.tokenOrigin=origin;
  });this.writes=operation;await operation;
 }
 async clearSession() {
  this.generation++;this.tokens=null;this.pending=null;this.tokenOrigin=null;
  this.writes=this.writes.catch(()=>{}).then(()=>fs.rm(this.file,{force:true}));await this.writes;this.onConnected();
 }
 async signIn() {
  this.generation++;
  const verifier=randomBytes(32).toString("base64url"),state=randomBytes(32).toString("base64url");
  this.pending={verifier,state,origin:this.origin(),expires:Date.now()+10*60*1000};
  const next="/desktop/connect?"+new URLSearchParams({challenge:digest(verifier),state,redirect:this.url+"/callback"});
  await this.openExternal(this.origin()+"/auth?next="+encodeURIComponent(next));
 }
 async signOut() {
  const tokens=this.tokens,origin=this.tokenOrigin;
  await this.clearSession();
  if(tokens && origin){try {const cfg=await this.config(origin);await fetch(cfg.url+"/auth/v1/logout?scope=local",{method:"POST",headers:{apikey:cfg.key,Authorization:"Bearer "+tokens.access_token},signal:AbortSignal.timeout(5000)});}catch{}}
 }
 async config(origin=this.origin()) {
  const r=await fetch(origin+"/api/desktop/config",{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error("Cloud setup unavailable");const cfg=await r.json();
  if(new URL(cfg.url).protocol!=="https:" || !cfg.key)throw Error("Invalid cloud setup");return cfg;
 }
 async accessToken() {
  if(this.tokens && this.tokenOrigin!==this.origin())await this.clearSession();
  if(!this.tokens)return null;
  if(this.tokens.expires_at*1000>Date.now()+60000)return this.tokens.access_token;
  if(!this.refreshing)this.refreshing=(async()=>{
   const origin=this.tokenOrigin,generation=this.generation,refresh=this.tokens.refresh_token;
   const cfg=await this.config(origin);
   const r=await fetch(cfg.url+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:cfg.key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refresh}),signal:AbortSignal.timeout(15000)});
   if(!r.ok){if((r.status===400||r.status===401)&&generation===this.generation)await this.clearSession();throw Error("Sign in again.");}
   const tokens=await r.json();await this.store({...tokens,expires_at:tokens.expires_at || Math.floor(Date.now()/1000)+tokens.expires_in},origin,generation);return tokens.access_token;
  })().finally(()=>{this.refreshing=null;});
  return this.refreshing;
 }
 async handle(req,res) {
  const u=new URL(req.url,this.url);
  if(u.pathname==="/callback") {
   const pending=this.pending;
   if(req.method!=="GET" || !pending || pending.origin!==this.origin() || pending.expires<Date.now() || u.searchParams.get("state")!==pending.state){res.writeHead(400);res.end("This connection expired. Start sign-in from Studyspace.");return;}
   const generation=this.generation+1;
   await this.clearSession();
   if(generation!==this.generation)throw Error("Account connection changed.");
   const r=await fetch(pending.origin+"/api/desktop/handoff",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:u.searchParams.get("code"),verifier:pending.verifier}),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error("Connection failed");await this.store(await r.json(),pending.origin,generation);
   res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'","Cache-Control":"no-store"});
   res.end("<h1>Studyspace is connected</h1><p>Return to the desktop app. You can close this tab.</p>");this.onConnected();return;
  }
  if(req.headers["x-studyspace-bridge"]!==this.secret || !allowed.test(u.pathname+u.search) || !["GET","POST","PUT","PATCH","DELETE"].includes(req.method)){res.writeHead(403);res.end();return;}
  if(u.pathname.startsWith("/api/device/") && req.method!=="GET"){res.writeHead(405);res.end();return;}
  let body; if(!["GET","HEAD"].includes(req.method)) {
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}body=Buffer.concat(chunks);
  }
  const origin=this.origin(),token=await this.accessToken();
  if(origin!==this.origin()){res.writeHead(409);res.end();return;}
  if(!token && u.pathname==="/api/session"){res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end('{"user":null}');return;}
  const remotePath=u.pathname==="/api/device/cloud-workspace"?"/api/workspace":u.pathname.replace(/^\/api\/device\/cloud-assets\//,"/api/attachments/");
  const headers={Origin:origin};
  if(token)headers.Authorization="Bearer "+token;
  for(const name of ["content-type","x-studyspace-compressed"])if(req.headers[name])headers[name]=req.headers[name];
  const abort=new AbortController();res.on("close",()=>{if(!res.writableEnded)abort.abort();});
  const response=await fetch(origin+remotePath+u.search,{method:req.method,headers,body,signal:abort.signal,redirect:"manual"});
  // Prevent the local Next server from buffering streamed AI output in its
  // compression layer. Preserve incremental delivery through the proxy.
  const output={"Cache-Control":"private, no-store, no-transform"};
  for(const name of ["content-type","content-disposition"])if(response.headers.has(name))output[name]=response.headers.get(name);
  res.writeHead(response.status,output);
  if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
 }
 close(){this.server?.close();}
}
module.exports={CloudBridge,allowed};
