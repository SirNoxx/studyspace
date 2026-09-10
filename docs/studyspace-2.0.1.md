# Studyspace 2.0.1

Fixes the missing Supabase project URL/API key error when signing in from another computer.

- New desktop installations open the official connected Studyspace sign-in page automatically. Users do not need project keys or a manually entered website address.
- Existing local notes and the last workspace choice are preserved. Previously saved custom server addresses are retained.
- The local sign-in page offers **Open connected workspace** instead of an unusable login form. The desktop opens it in the same window after saving local work.
- Desktop settings are prefilled with the official server address. Local workspace remains available from the Studyspace menu, including when offline.
- Collaboration invitations work with existing account IDs even before recipients create social profiles. Your profile page shows your account ID; invitation errors explain invalid IDs and attempts to invite yourself.

Install `Studyspace-Setup-2.0.1-x64.exe`, or use **Help → Check for updates** in Studyspace. Save your notes before restarting. The installer remains unsigned and retains the same data directory as previous versions.

The release includes the Windows installer, matching update blockmap, `latest.yml`, and SHA256 checksums. No private API keys are included in the installer.

Validation includes fresh-install hosted sign-in, preserved legacy local mode, in-window cloud switching, packaged save/restart persistence, and startup failure handling. The account-invitation migration was tested locally and against the hosted database with disposable owner, recipient, and outsider accounts: invitations, acceptance, editor writes, idempotent retries, ownership enforcement and revocation passed. All temporary accounts were removed.
