import { NextRequest,NextResponse } from "next/server";
import { assertRequestOrigin } from "@/lib/server/same-origin";
const allowed=/^\/api\/(session|social|shared|attachments|ai|community|publications|public-assets|journal-templates|jobs|metadata|extract|reader|transcripts|account|moderation|google|planner|collaboration|device\/cloud-workspace|device\/cloud-assets)(\/|$)/;
export function proxy(request: NextRequest) {
 const bridge=process.env.STUDYSPACE_BRIDGE_URL,secret=process.env.STUDYSPACE_BRIDGE_SECRET;
 if(!bridge || !secret || !allowed.test(request.nextUrl.pathname))return NextResponse.next();
 try {assertRequestOrigin(request);}catch{return Response.json({error:"Request origin rejected."},{status:403});}
 const headers=new Headers(request.headers);headers.set("x-studyspace-bridge",secret);
 return NextResponse.rewrite(new URL(request.nextUrl.pathname+request.nextUrl.search,bridge),{request:{headers}});
}
export const config={matcher:"/api/:path*"};
