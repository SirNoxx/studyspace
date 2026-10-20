import { z } from "zod";
import { randomBytes } from "node:crypto";
import { adminClient,requireUser } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/server/repository";
import { calendarConnection,googleConfigured,googleRequest,callbackUrl } from "@/lib/server/google-calendar";
import { hash,seal,unseal } from "@/lib/server/credentials";
const headers={"Cache-Control":"private, no-store"};
export const dynamic="force-dynamic";
function failure(e:unknown){return Response.json({error:(e as Error).message || "Calendar is unavailable."},{status:(e as Error).message==="AUTH_REQUIRED"?401:400,headers});}
export async function GET(request:Request) {
 try {
  const {user}=await requireUser();if(!googleConfigured())return Response.json({configured:false,connected:false},{headers});
  const connection=await calendarConnection(user.id);if(!connection)return Response.json({configured:true,connected:false},{headers});
  const params=new URL(request.url).searchParams;
  const from=z.iso.datetime().parse(params.get("from") || new Date().toISOString()),to=z.iso.datetime().parse(params.get("to") || new Date(Date.now()+31*86400000).toISOString());
  if(new Date(to)<=new Date(from) || new Date(to).getTime()-new Date(from).getTime()>100*86400000)throw Error("Choose a forward calendar range shorter than 100 days.");
  const calendars=await googleRequest(connection.tokens,"users/me/calendarList?minAccessRole=owner&maxResults=250");
  const events=[];let pageToken:string|undefined;
  do {const q=new URLSearchParams({timeMin:from,timeMax:to,singleEvents:"true",orderBy:"startTime",maxResults:"250",...(pageToken?{pageToken}:{})});const result=await googleRequest(connection.tokens,"calendars/"+encodeURIComponent(connection.calendarId)+"/events?"+q);events.push(...(result.items ?? []));pageToken=result.nextPageToken;}while(pageToken && events.length<2000);
  return Response.json({configured:true,connected:true,calendarId:connection.calendarId,calendars:calendars.items,events,truncated:!!pageToken},{headers});
 }catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {
  assertSameOrigin(request);const {user}=await requireUser();
  const raw=await request.text();if(raw.length>30000)throw Error("Request too large.");const input=JSON.parse(raw);
  const action=z.enum(["connect","disconnect","select","sync-task"]).parse(input.action);const db=adminClient();
  if(action!=="disconnect" && !googleConfigured())throw Error("The app operator must configure Google OAuth before connecting Calendar.");
  if(action==="connect") {
   const state=randomBytes(32).toString("base64url"),verifier=randomBytes(32).toString("base64url");
   const stored=await db.from("google_oauth_states").insert({state_hash:hash(state),owner_id:user.id,payload:seal({verifier}),expires_at:new Date(Date.now()+600000).toISOString()});if(stored.error)throw stored.error;
   const url="https://accounts.google.com/o/oauth2/v2/auth?"+new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:callbackUrl(),response_type:"code",scope:"https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.owned",access_type:"offline",prompt:"consent",state,code_challenge:hash(verifier),code_challenge_method:"S256"});return Response.json({url},{headers});
  }
  if(action==="disconnect") {
   const result=await db.from("google_connections").delete().eq("owner_id",user.id).select("payload").maybeSingle();if(result.error)throw result.error;
   if(result.data){try{const tokens=unseal<{refresh_token?:string;access_token:string}>(result.data.payload);await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",body:new URLSearchParams({token:tokens.refresh_token || tokens.access_token}),signal:AbortSignal.timeout(10000)});}catch{/* Local access is removed even when Google has already revoked the token. */}}
   return Response.json({connected:false},{headers});
  }
  const connection=await calendarConnection(user.id);
  if(!connection)throw Error("Connect Google Calendar first.");
  if(action==="select") {
   const id=z.string().min(1).max(1024).parse(input.calendarId);
   const calendar=await googleRequest(connection.tokens,"users/me/calendarList/"+encodeURIComponent(id));if(calendar.accessRole!=="owner")throw Error("Choose a calendar you own.");
   const result=await db.from("google_connections").update({calendar_id:id}).eq("owner_id",user.id);if(result.error)throw result.error;return Response.json({calendarId:id},{headers});
  }
  const task=z.object({id:z.uuid(),title:z.string().min(1).max(240),description:z.string().max(20000),due_date:z.iso.date(),due_time:z.string().nullable(),timezone:z.string().max(100)}).parse(input.task);
  new Intl.DateTimeFormat("en",{timeZone:task.timezone});
  const id="ss"+task.id.replaceAll("-",""),base="calendars/"+encodeURIComponent(connection.calendarId)+"/events";
  const time=task.due_time?z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).parse(task.due_time).slice(0,5):null;
  const start=time?{dateTime:task.due_date+"T"+time+":00",timeZone:task.timezone}:{date:task.due_date};
  const end=time?{dateTime:new Date(new Date(task.due_date+"T"+time+":00Z").getTime()+3600000).toISOString().slice(0,19),timeZone:task.timezone}:{date:new Date(new Date(task.due_date+"T00:00:00Z").getTime()+86400000).toISOString().slice(0,10)};
  const body={summary:task.title,description:task.description,start,end,extendedProperties:{private:{studyspaceTask:task.id}}};
  try {await googleRequest(connection.tokens,base,{method:"POST",body:JSON.stringify({id,...body})});}
  catch(e){if((e as Error & {status:number}).status!==409)throw e;await googleRequest(connection.tokens,base+"/"+id,{method:"PATCH",body:JSON.stringify(body)});}
  return Response.json({id},{headers});
 }catch(e){return failure(e);}
}
