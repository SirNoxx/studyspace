import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
export async function sessionClient() {
  if (!configured())
    throw new Error(
      "Supabase is not configured. Set the public URL and anon key in .env.local.",
    );
  const authorization = (await headers()).get("authorization");
  if (authorization?.startsWith("Bearer ")) return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}},
  );
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server component cookies are refreshed by the next authenticated request. */
          }
        },
      },
    },
  );
}
export function adminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error(
      "Server configuration is incomplete: SUPABASE_SERVICE_ROLE_KEY is required.",
    );
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function requireUser() {
  const client = await sessionClient();
  const token = (await headers()).get("authorization")?.replace(/^Bearer /,"");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  return { user: data.user, client };
}
