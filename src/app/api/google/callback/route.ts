import { adminClient } from "@/lib/supabase/server";
import { hash,seal,unseal } from "@/lib/server/credentials";
import { callbackUrl } from "@/lib/server/google-calendar";
export async function GET(request:Request) {
 try {
  const params=new URL(request.url).searchParams,state=params.get("state"),code=params.get("code");if(!state || !code)throw Error("Authorization was cancelled.");
  const db=adminClient();const {data,error}=await db.from("google_oauth_states").delete().eq("state_hash",hash(state)).gt("expires_at",new Date().toISOString()).select().maybeSingle();
  if(error || !data)throw Error("Authorization expired. Start again from Calendar.");
  const {verifier}=unseal<{verifier:string}>(data.payload);
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,code,code_verifier:verifier,grant_type:"authorization_code",redirect_uri:callbackUrl()}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("Google authorization failed. Please try again.");const tokens=await response.json();
  if(!tokens.refresh_token)throw Error("Google did not grant ongoing access. Reconnect and allow Calendar access.");
  const result=await db.from("google_connections").upsert({owner_id:data.owner_id,payload:seal({...tokens,expires_at:Date.now()+tokens.expires_in*1000}),updated_at:new Date().toISOString()});if(result.error)throw result.error;
  return new Response("Google Calendar is connected. Return to Studyspace and refresh Calendar.",{headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
 }catch(e){return new Response((e as Error).message,{status:400,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});}
}
