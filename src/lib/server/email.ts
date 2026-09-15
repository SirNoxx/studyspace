import { adminClient } from "../supabase/server";
export const emailConfigured=()=>Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export async function deliverEmails(owner?:string) {
 if(!emailConfigured())return;
 const db=adminClient();
 let expired=db.from("email_outbox").update({status:"failed",last_error:"Delivery retry window expired. Review before resending."}).in("status",["pending","sending"]).lt("created_at",new Date(Date.now()-20*3600000).toISOString());if(owner)expired=expired.eq("owner_id",owner);const expiry=await expired;if(expiry.error)throw expiry.error;
 const {data,error}=await db.rpc("claim_email_batch",{p_owner:owner ?? null});if(error)throw error;
 for(const item of data ?? []) {
  try {
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"studyspace-"+item.id},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[item.recipient],subject:item.subject,text:item.body+"\n\n"+(process.env.NEXT_PUBLIC_APP_URL || "https://studyspace-noxx-studios.vercel.app")+"/auth"}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error("Email provider HTTP "+response.status);
   const result=await response.json();
   const saved=await db.from("email_outbox").update({status:"sent",sent_at:new Date().toISOString(),provider_id:result.id,locked_until:null}).eq("id",item.id).eq("locked_until",item.locked_until);if(saved.error)throw saved.error;
  } catch {
   await db.from("email_outbox").update({status:item.attempts>=8?"failed":"pending",last_error:"Delivery was not confirmed; retry scheduled",locked_until:null,next_attempt:new Date(Date.now()+Math.min(3600000,30000*2**item.attempts)).toISOString()}).eq("id",item.id).eq("locked_until",item.locked_until);
  }
 }
}
