import { configured, requireUser } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET() {
  const headers={"Cache-Control":"private, no-store"};
  if (!configured()) return Response.json({user:null},{headers});
  try {const {user}=await requireUser();return Response.json({user:{id:user.id,email:user.email}},{headers});}
  catch {return Response.json({user:null},{headers});}
}
