# Free AI chat

AI chat accepts requests from signed-out local workspaces. Users still explicitly enable selected-context sharing. Anonymous requests cannot load private cloud workspaces. Provider credentials remain on the server.

The default allowance is 100 study requests per device per UTC day, with 8 requests per minute. A request may contain several study batches; its complete processing allowance is reserved before contacting the provider. Signed-in accounts also have an account allowance. Failed or cancelled provider requests retain their reservation to prevent repeated expensive retries.

## Production setup

1. Apply `supabase/migrations/20260929010000_free_ai_usage.sql` to the hosting project's database before deploying the new API. This creates service-role-only counters and an atomic reservation function. No prompts, note bodies, or raw IP addresses are stored in these counters.
2. Set server-only `AI_API_KEY`, `AI_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` on the hosting service. `AI_BASE_URL` remains optional for compatible providers. Prefer a separate stable `AI_QUOTA_SECRET` for hashing identities; it otherwise uses the service key. Do not put secret keys in public environment variables or desktop bundles.
3. Review the `AI_FREE_*`, `AI_NETWORK_*`, and `AI_GLOBAL_*` limits in `.env.example`. The defaults include 2,000 requests and 20 million conservative processing units per day across the app. These are not dollar budgets. Set provider billing controls separately. Studyspace pays the provider; the experience is free to users.
4. Deploy the web API and distribute a desktop build containing the updated cloud bridge. Desktop installations must point at that hosted backend; they do not need individual provider keys or a Studyspace sign-in.
5. Verify a signed-out request, selected-context consent, a quota rejection, a missing-limiter failure, and a signed-out attempt to access private cloud material. Automated route, database and desktop bridge tests cover these cases locally; they do not prove a deployment is configured.

Production always reserves quota in Postgres and returns 503 if its limiter is unavailable. It never silently falls back to unlimited usage. The device identifier is resettable and is not authentication; network and app-wide limits remain in force when it changes. Shared school networks may reach network limits, so tune those with real usage.

On Vercel, the API uses the platform-overwritten `x-vercel-forwarded-for` header ([Vercel request headers](https://vercel.com/docs/headers/request-headers)). Other hosts must configure `AI_TRUSTED_IP_HEADER` only when their trusted ingress overwrites it; otherwise guests share one fallback network budget. IPv6 addresses are grouped by /64 before hashing. Rate limiting cannot prevent every kind of distributed abuse; retain provider spending limits and monitor 429/503 rates.

The processing budget reserves UTF-8 request bytes plus maximum output tokens and overhead for every provider call. This is intentionally conservative rather than measured billing usage. Large folders can reach the processing cap before the request count. Expired database counters are removed during successful reservations after two days.

## Local development and rollback

The September 29 local smoke request passed anonymous access and quota reservation, but OpenAI returned `credit_balance_exhausted`. Add credits in the operator's [API billing settings](https://platform.openai.com/settings/organization/billing/) to enable actual answers. Studyspace now distinguishes that failure from an interrupted response; users are not asked to provide their own keys. See the [official error-code guidance](https://developers.openai.com/api/docs/guides/error-codes). Hosted deployment was not performed as part of this change.

`npm run dev` uses an atomic, locked ledger in `.next/cache/studyspace-ai-usage.json` so local testing works before applying the migration. Set `AI_QUOTA_BACKEND=database` to exercise the production limiter locally. If development crashes leaving a `.lock` file, stop all local servers before removing that stale lock. Production ignores the disk backend.

To roll back, deploy the preceding authenticated API and desktop bridge; retain the new database table/function until all callers have been rolled back. This migration is additive. No workspace content is changed by it.
