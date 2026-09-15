# Google and email setup for Studyspace

These integrations need credentials owned by the app operator. Do not put client secrets, service-role keys, or email API keys into the desktop installer, public environment variables, source control, or chat messages. Add server credentials through your hosting provider's environment settings.

## Google Sign-In

1. Create a Google Cloud project for Studyspace. Configure the OAuth consent screen with your support email, app name, authorized domain, privacy policy and terms. While the app is in testing, add the accounts you will test with as test users.
2. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI for Supabase authentication:

   `https://nnlhqstucyjoioyraxpf.supabase.co/auth/v1/callback`

3. In Supabase → Authentication → Sign In / Providers → Google, enable Google and enter the client ID and client secret. Keep email verification and redirect restrictions enabled.
4. Set the Supabase Site URL to `https://studyspace-noxx-studios.vercel.app`. Allow the app's `/auth/callback` redirect URL. Development callbacks should only be added when needed; avoid broad production wildcard redirects.
5. Test **Continue with Google** in a separate browser session. For desktop, start sign-in from Studyspace, complete browser authentication, and confirm **Connect this desktop**. The desktop handoff uses a short-lived, single-use code bound to that app's sign-in attempt.

Google Sign-In and Google Calendar are separate connections. Signing in does not grant calendar access.

## Google Calendar

1. Enable **Google Calendar API** in the Google Cloud project.
2. Create a separate Web application OAuth client (recommended for independent rotation), or add the following redirect URI to your existing client:

   `https://studyspace-noxx-studios.vercel.app/api/google/callback`

3. In Vercel → Studyspace → Settings → Environment Variables, add server-only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Production. Set `NEXT_PUBLIC_APP_URL` to the production origin above.
4. Configure the consent screen for the requested scopes: `calendar.readonly` and `calendar.events.owned`. Complete Google's required verification before opening the integration to the public; testing-mode restrictions and token expiration can affect test users.
5. Redeploy, open Studyspace → Calendar → **Connect Google Calendar**, authorize in your browser, then refresh Calendar. Choose a calendar you own.
6. Verify all-day events and timed events, copying an event into a private task, and saving one task twice to Google Calendar without duplication. Disconnect and reconnect; also test access revoked from your Google account.

Calendar refresh tokens are encrypted on the server. Set a stable, randomly generated `INTEGRATION_ENCRYPTION_KEY` in server environment settings before enabling the integration; retain it securely for recovery. If omitted, the implementation derives encryption from the Supabase service-role key, so rotating that key requires reconnecting integrations. Changing the dedicated encryption key also requires a planned token migration or reconnection.

## Collaboration email

The implementation uses Resend for transactional invitation and planner emails. Supabase authentication emails are configured separately in Supabase SMTP settings.

1. Create a Resend account, add a sending domain you own, and complete its DNS verification (including the records Resend provides for email authentication).
2. Create a sending API key. Add server-only `RESEND_API_KEY` to Vercel and the background worker environment.
3. Set `EMAIL_FROM` to a verified sender, for example `Studyspace <notifications@your-domain.example>`. Use your actual verified domain.
4. Configure `NEXT_PUBLIC_APP_URL` in the worker environment so emails link to the correct deployed app.
5. Run the durable background worker with the same Supabase service credentials and email environment variables. Monitor delivery failures; receiving a queued response does not prove that an email reached the inbox.
6. Test with two accounts you control: invite by email, verify the recipient's address, accept the invitation, and create a shared task. Confirm that an unrelated account cannot accept the invitation or view the task. Check duplicate retries, revoked invitations, blocked users and notification preferences.

Without email credentials, invitations remain available in the app and the UI explains that email delivery is not configured. Do not advertise email delivery until a real test message has arrived successfully.

## Before public release

Apply the reviewed unified-workspace migration, deploy the API and UI together, and verify the packaged desktop against the deployed API. Use isolated test accounts and test calendars. Record Google consent verification status, worker uptime, email delivery outcomes and the deployed version. Keep previous installers and database backups available; rollback must preserve local notes and shared data.

Provider references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Calendar event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Resend email API](https://resend.com/docs/api-reference/emails/send-email).
