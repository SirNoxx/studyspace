# Studyspace operator setup checklist

The editor and offline Learning features run without new provider accounts. The integrations below need operator-owned configuration before the next public release. Do not paste secrets into chat or include them in the desktop installer.

## Actions for the app owner

1. **Reconnect Supabase management access.** Complete the browser authentication when a fresh Supabase MCP login is started. The prior login expired. The prepared `20260910210612_unified_workspace_services.sql` migration still needs to be applied to the hosted project, followed by isolated multi-account verification. Existing account access alone does not apply new database migrations.
2. **Create a Google Cloud project and OAuth consent screen.** Add Studyspace branding, support contact, authorized domain, privacy policy and terms. Add test users during development; complete any verification required for public access.
3. **Enable Google Sign-In in Supabase.** Create a Web application OAuth client and add `https://nnlhqstucyjoioyraxpf.supabase.co/auth/v1/callback` as its redirect URI. Enter that client ID and secret in Supabase's Google provider settings. Set the production Site URL and `/auth/callback` allowlist. Follow [the detailed guide](google-and-email-setup.md).
4. **Configure Google Calendar separately.** Enable Google Calendar API. Use a Web OAuth client with `https://studyspace-noxx-studios.vercel.app/api/google/callback` as the redirect. Set server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a stable `INTEGRATION_ENCRYPTION_KEY` in Vercel. Set `NEXT_PUBLIC_APP_URL` to the production origin. Calendar access requires its own consent even when Google Sign-In is enabled.
5. **Configure transactional email.** Create a Resend account, verify the sending domain using the DNS records it provides, and set server-only `RESEND_API_KEY` and `EMAIL_FROM`. Run the prepared worker on a continuously running service with the required Supabase and email credentials so pending invitations and planner notifications are retried. Until configured, an invitation can exist in Studyspace without an email being delivered. Supabase authentication email/SMTP is a separate setting; configure it for production sign-up and password-reset delivery too.
6. **Confirm hosted AI configuration.** Keep your existing OpenAI key on the hosted server and verify the account has API billing and access to the selected model. Users should not enter your operator API key into their desktop apps. The desktop transport has automated coverage; a provider-backed test against the deployed API is still required.
7. **Test with designated accounts before distribution.** Verify Google sign-in, desktop sign-in handoff, calendar consent/revocation, an email invitation, a shared planner task, and a real AI response. Use accounts you control. After the hosted API and migration pass these checks, build and distribute the updated desktop release. The existing public release has not been replaced by this development work.

## Optional Learning work (currently hidden)

The Learning navigation tab is hidden at the owner’s request; its existing data and implementation are retained for future development.

- **Wikipedia:** the optional topic search uses the public MediaWiki REST API. The 320-topic starter catalog and Learning Paths work offline. No Wikipedia API key is needed.
- **Definition and Use cases modules, the Learned Vault, and whiteboard navigation:** no external accounts or paid APIs are required.

Provider setup details: [Google and email](google-and-email-setup.md). Product scope and expansion plan: [Learning experience engineering brief](learning-experience-brief.md). Release gates and rollback: [verification record](unified-workspace-verification.md).

## Shared workspace update (September 12)

Apply `20260912010000_shared_live_workspace.sql`, deploy the matching web APIs, validate live editing with designated accounts, and rebuild the desktop installer. The migration has been tested locally but has not been applied to the hosted project in this task. See [shared workspace release gates](shared-workspace-release.md) for attachment cleanup, rollback and validation requirements. Grammar corrections require no additional provider configuration.
