import { z } from "zod";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { seal,unseal,hash } from "@/lib/server/credentials";
import { assertSameOrigin } from "@/lib/server/repository";
export const dynamic="force-dynamic";
const redirectSchema=z.string().url().refine((value) => {const u=new URL(value);return u.protocol==="http:" && u.hostname==="127.0.0.1" && !!u.port && u.pathname==="/callback" && !u.username && !u.password && !u.search && !u.hash;});
export async function POST(request: Request) {
 try {
  assertSameOrigin(request);
  const body=await request.text();if(body.length>4096)throw Error("Invalid connection request");
  const input=z.object({challenge:z.string().regex(/^[\w-]{43}$/),state:z.string().regex(/^[\w-]{43}$/),redirect:redirectSchema}).parse(JSON.parse(body));
  const {user}=await requireUser();
  if(!user.email || !user.email_confirmed_at) return Response.json({error:"Verify your email before connecting."},{status:401});
  const quota=await adminClient().rpc("consume_quota",{p_owner:user.id,p_bucket:"desktop-handoff",p_limit:30});
  if(quota.error || !quota.data)return Response.json({error:"Too many connection attempts. Try again later."},{status:429});
  // Issue a separate device session so desktop refresh rotation cannot invalidate
  // the browser session. generateLink does not send an email.
  const generated=await adminClient().auth.admin.generateLink({type:"magiclink",email:user.email});
  if(generated.error) throw generated.error;
  const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error:sessionError}=await auth.auth.verifyOtp({type:"magiclink",token_hash:generated.data.properties.hashed_token});
  if(sessionError || !data.session) throw Error("Session unavailable");
  const code=randomBytes(32).toString("base64url");
  const {error}=await adminClient().from("desktop_handoffs").insert({code_hash:hash(code),owner_id:user.id,challenge:input.challenge,payload:seal({access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at}),expires_at:new Date(Date.now()+60000).toISOString()});
  if(error) throw error;
  const redirect=new URL(input.redirect);redirect.searchParams.set("code",code);redirect.searchParams.set("state",input.state);
  return Response.json({redirect:redirect.href},{headers:{"Cache-Control":"no-store"}});
 } catch {return Response.json({error:"Could not connect this desktop. Restart sign-in from the app."},{status:400});}
}
export async function PUT(request: Request) {
 try {
  const body=await request.text();if(body.length>1024)throw Error("Invalid connection request");
  const input=z.object({code:z.string().regex(/^[\w-]{43}$/),verifier:z.string().regex(/^[\w-]{43}$/)}).parse(JSON.parse(body));
  const {data,error}=await adminClient().rpc("consume_desktop_handoff",{p_hash:hash(input.code),p_challenge:hash(input.verifier)});
  if(error || !data) return Response.json({error:"Connection expired. Sign in again."},{status:401});
  return Response.json(unseal(data),{headers:{"Cache-Control":"no-store"}});
 } catch {return Response.json({error:"Connection could not be verified."},{status:400});}
}
