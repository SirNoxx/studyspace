# Unified workspace verification and release gate

Development version: 2.1.0. The existing public 2.0.1 deployment and release have not been replaced.

The subsequent Learning/editor expansion passed 130 unit/database tests, 15 desktop tests, and 14 Chromium tests against an isolated production build. See [the latest verification record](learning-experience-verification.md) and [complete owner setup checklist](operator-setup-checklist.md). The packaging observations below refer to the earlier unified-workspace build; the latest Learning additions are not in a public installer.

## Verified locally

- TypeScript check passed.
- 126 tests across 23 unit/database test files passed, including migration execution in isolated PostgreSQL-compatible fixtures, invitation access, planner revisions, single-use desktop handoffs, publication selection validation and legacy pin restoration.
- 15 desktop tests passed, including account changes, sign-out races, credential isolation, bridge authorization and update behavior.
- Four Chromium integration tests passed: whiteboard text placement/formatting/resizing/persistence/undo/export; private planner persistence and offline editing; link title/author metadata; Word/PDF import and Word export.
- Production webpack build and isolated Windows packaging completed without cloud credentials in the bundled app.
- Packaged desktop transport smoke passed with a mocked cloud endpoint: local startup, native sign-in handoff, bearer-authenticated Next proxy, incremental AI streaming, renderer isolation, sign-out and encrypted credential removal. The test exercises real local HTTP transport; it does not establish that hosted OAuth or AI provider configuration is live.
- Packaged persistence, fresh/legacy connection and startup smoke tests passed. Immediate-close edits survived restart. Slow startup and occupied-port errors remained visible and closable. On this machine, the normal-run loading screen appeared at 187 ms and the workspace loaded at 1,541 ms; these are local observations, not a startup guarantee for other machines.

The whiteboard supports click placement, wrapped multiline text, font size, bold, italic, color, movement, deletion and undo. Its corner resize control maintains a 24-pixel target when the note or board zoom changes, and supports arrow keys (Shift for larger steps).

## Release gates still requiring external access

1. Reconnect Supabase management authentication and apply `20260910210612_unified_workspace_services.sql`. It has been tested locally but has not been applied to the hosted project.
2. Run isolated hosted multi-account tests for new email invitations, shared planner tasks and desktop handoff exchange. Do not use real users as test recipients.
3. Deploy the API before distributing the desktop version that depends on its handoff routes. Verify actual hosted authentication and provider-backed AI, beyond a mocked remote transport check.
4. Configure and verify Google OAuth and transactional email as described in [the setup guide](google-and-email-setup.md). These providers are currently unconfigured; queued email does not imply delivery.

The Supabase management session expired during verification. The reconnect attempt timed out without completing browser authentication. No hosted migration or deployment was attempted afterward.

## Rollback

Keep the existing installer and deployment available until all release gates pass. Roll back application code without dropping the additive integration tables or deleting device data. Preserve the integration encryption key and encrypted calendar tokens. Disable new entry points and email dispatch if a rollout is interrupted; retain queued records for investigation. Export local workspaces before reverting to an older desktop version: newer module content remains in Markdown, but older interfaces may not expose its controls. Recovery from an existing cloud workspace makes a separate local copy and leaves the cloud original intact.
