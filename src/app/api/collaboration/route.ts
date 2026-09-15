import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/server/repository";
import { deliverEmails,emailConfigured } from "@/lib/server/email";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store"};
function failure(error:unknown) {
 const message=(error as Error).message;
 const known:Record<string,string>={AUTH_REQUIRED:"Sign in to use shared planning and invitations.",EMAIL_VERIFICATION_REQUIRED:"Verify your email address before collaborating.",INVITE_SELF:"Enter the other person's email address.",INVALID_EMAIL:"Enter a valid email address.",ACCESS_DENIED:"You do not have permission for this action.",INVITATION_REVOKED:"This invitation expired or was revoked.",REVISION_CONFLICT:"This task changed. Reload it before saving; your draft is retained.",PLANNER_ACCEPTANCE_REQUIRED:"The other person must accept planner collaboration before you share tasks.",RATE_LIMIT:"Invitation limit reached. Try again tomorrow."};
 return Response.json({error:known[message] || "Could not save this change. Your draft is retained."},{status:message==="REVISION_CONFLICT"?409:message==="AUTH_REQUIRED"?401:message==="ACCESS_DENIED"?403:400,headers});
}
export async function GET() {
 try {const {client}=await requireUser();const {data,error}=await client.rpc("workspace_services",{p_action:"list",p_data:{}});if(error)throw error;return Response.json({...data,emailConfigured:emailConfigured()},{headers});}catch(e){return failure(e);}
}
export async function POST(request:Request) {
 try {
  assertSameOrigin(request);const raw=await request.text();if(raw.length>30000)throw Error("INPUT_TOO_LARGE");
  const input=z.object({action:z.enum(["invite","invitation","disconnect","task-save","task-delete"]),data:z.record(z.string(),z.unknown())}).parse(JSON.parse(raw));
  const {user,client}=await requireUser();
  if(input.action==="invite")input.data.email=z.email().max(254).parse(String(input.data.email ?? "").trim().toLowerCase());
  const {data,error}=await client.rpc("workspace_services",{p_action:input.action,p_data:input.data});if(error)throw error;
  after(()=>deliverEmails(user.id));
  return Response.json({...data,emailConfigured:emailConfigured()},{headers});
 }catch(e){return failure(e);}
}
