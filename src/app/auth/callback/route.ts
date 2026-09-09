import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const u = new URL(request.url);
  const code = u.searchParams.get("code");
  const raw = u.searchParams.get("next") ?? "/w";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/w";
  if (code) {
    const client = await sessionClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, u.origin));
  }
  return NextResponse.redirect(new URL("/auth?error=expired", u.origin));
}
