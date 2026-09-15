import { adminClient } from "../supabase/server";
import { seal,unseal } from "./credentials";
export interface GoogleTokens {access_token:string;refresh_token?:string;expires_at:number}
export const googleConfigured=()=>Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const callbackUrl=()=>new URL("/api/google/callback",process.env.NEXT_PUBLIC_APP_URL!).href;
export async function calendarConnection(owner:string) {
 const db=adminClient();const {data,error}=await db.from("google_connections").select("payload,calendar_id").eq("owner_id",owner).maybeSingle();if(error)throw error;if(!data)return null;
 let tokens=unseal<GoogleTokens>(data.payload);
 if(tokens.expires_at<Date.now()+60000){
  if(!tokens.refresh_token)throw Error("Reconnect Google Calendar to renew access.");
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,grant_type:"refresh_token",refresh_token:tokens.refresh_token}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error("Google Calendar access expired or was revoked. Disconnect and reconnect it.");const next=await r.json();tokens={...tokens,...next,expires_at:Date.now()+next.expires_in*1000};
  const saved=await db.from("google_connections").update({payload:seal(tokens),updated_at:new Date().toISOString()}).eq("owner_id",owner);if(saved.error)throw saved.error;
 }
 return {tokens,calendarId:data.calendar_id};
}
export async function googleRequest(tokens:GoogleTokens,path:string,options:RequestInit={}) {
 const response=await fetch("https://www.googleapis.com/calendar/v3/"+path,{...options,headers:{Authorization:"Bearer "+tokens.access_token,"Content-Type":"application/json",...options.headers},signal:AbortSignal.timeout(15000)});
 if(!response.ok){const e=new Error(response.status===401 || response.status===403?"Google Calendar access is unavailable. Reconnect your account.":"Google Calendar could not complete this request. Retry shortly.") as Error & {status:number};e.status=response.status;throw e;}
 return response.status===204?{}:response.json();
}
