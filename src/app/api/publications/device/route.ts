import {z} from "zod";
import {requireUser,adminClient} from "@/lib/supabase/server";
import {assertSameOrigin,apiError,loadWorkspace} from "@/lib/server/repository";
import {DeviceSnapshot} from "@/lib/public-snapshot-schema";
import {sha256} from "@/lib/transfer";
export const maxDuration=120;
export async function POST(request:Request) {
 try {
  assertSameOrigin(request);const {user}=await requireUser();
  if(!user.email_confirmed_at)throw Error("Verify your email before publishing.");
  const text=await request.text();if(new TextEncoder().encode(text).length>4*1024*1024)throw Error("Split this publication into smaller selections (maximum 4 MB of text).");
  const {action,snapshot}=z.object({action:z.enum(["stage","publish"]),snapshot:DeviceSnapshot}).parse(JSON.parse(text));
  const db=adminClient();
  const {data:quota,error:quotaError}=await db.rpc("consume_quota",{p_owner:user.id,p_bucket:"device-publication",p_limit:100});if(quotaError)throw quotaError;if(!quota)throw Error("Daily publishing limit reached.");
  const {data:profile,error:profileError}=await db.from("profiles").select("suspended").eq("id",user.id).maybeSingle();if(profileError)throw profileError;if(profile?.suspended)throw Error("Public posting is suspended for this account.");
  const reserved=await db.from("publications").upsert({id:snapshot.publicationId,owner_id:user.id,container_id:null,status:"unpublished"},{onConflict:"id",ignoreDuplicates:true});if(reserved.error)throw reserved.error;
  const {data:publication,error}=await db.from("publications").select("owner_id,hidden").eq("id",snapshot.publicationId).single();if(error)throw error;if(publication.owner_id!==user.id||publication.hidden)throw Error("You cannot publish this selection.");
  const prior=await db.from("publication_versions").select("publication_id,payload").eq("id",snapshot.id).maybeSingle();if(prior.error)throw prior.error;
  if(prior.data){if(prior.data.publication_id!==snapshot.publicationId)throw Error("This version identifier is already in use.");return Response.json({snapshot:prior.data.payload,alreadyPublished:true});}
  const key=(id:string)=>`${snapshot.publicationId}/${snapshot.id}/${id}`;
  if(action==="stage") {
   const uploads=[];
   for(const asset of snapshot.attachments){const signed=await db.storage.from("publication-assets").createSignedUploadUrl(key(asset.id));if(signed.error)throw signed.error;uploads.push({id:asset.id,url:signed.data.signedUrl});}
   return Response.json({uploads},{headers:{"Cache-Control":"private, no-store"}});
  }
  for(const asset of snapshot.attachments){
   const result=await db.storage.from("publication-assets").download(key(asset.id));if(result.error||!result.data)throw Error(`Upload ${asset.filename} before publishing.`);
   const bytes=new Uint8Array(await result.data.arrayBuffer());if(bytes.length!==asset.size || await sha256(bytes)!==asset.hash)throw Error(`The uploaded ${asset.filename} did not match the reviewed file. Create a fresh publication preview.`);
  }
  const {data:identity}=await db.from("community_profiles").select("username").eq("id",user.id).maybeSingle();
  const w=await loadWorkspace(user.id);
  snapshot.author=identity?.username || w.settings.displayName || "Studyspace member";
  const saved=await db.rpc("publish_snapshot",{p_owner:user.id,p_id:snapshot.publicationId,p_container:null,p_snapshot:snapshot,p_expected:w.revision});if(saved.error)throw saved.error;
  return Response.json({snapshot},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return apiError(e);}
}
