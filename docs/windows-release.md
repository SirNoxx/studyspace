# Building and publishing Studyspace for Windows

## Reproducible build

Use Windows 11 x64 with Node 24.11.1 or a newer Node 24 patch and Git. Build from a clean checkout without `.env`, `.env.local`, `.env.production`, or `.env.production.local`. The desktop build deliberately rejects these files and gives its local server a restricted environment so deployment credentials cannot be shipped to end users.

```powershell
npm ci
npm ci --prefix desktop
npm run typecheck
npm test
npm run desktop:test
npm run desktop:build
npm run desktop:smoke
npm run desktop:test-update
```

The `desktop/release` directory contains a full NSIS installer, its differential-download blockmap, and `latest.yml`. `win-unpacked/Studyspace.exe` is also produced for verification. Build output is ignored by Git. The desktop process embeds the Next standalone server through Electron's utility process, serves it at a stable loopback origin, and displays it in a sandboxed renderer. Settings use a separate bundled page with a restricted, sender-validated IPC interface.

The smoke test uses `desktop/.smoke` and a separate port/profile; it must never run against a person's real workspace. It verifies the packaged application, renderer isolation, immediate-close saving, persistence across process restarts, settings validation, and the packaged updater configuration. The update transport test downloads the actual release installer into an isolated cache, verifies its SHA512 digest, and checks that a corrupt manifest is rejected; it never executes the installer. An actual future installer upgrade requires a newer published release; initial-release checks cannot demonstrate a nonexistent future upgrade.

## Publish a new version

1. Update `version` in both root and `desktop/package.json`, keeping their lockfiles consistent. Use a higher semantic version, e.g. `1.0.1`.
2. Commit, run the checks/build above, and review the packaged app. Keep the same app ID `com.sirnoxx.studyspace`, package name, local port, and GitHub repository to preserve existing installations and data.
3. Create a tag such as `v1.0.1` at the tested commit. Create a **draft GitHub release** for the tag. Upload the matching `.exe`, `.exe.blockmap`, and **`latest.yml`** from the same build. Include SHA256 checksums and release notes. Do not modify `latest.yml` by hand or omit it; it points electron-updater to the exact installer and SHA512 digest.
4. Publish the release when all assets are uploaded. Installed apps automatically find stable versions through the public `SirNoxx/studyspace` GitHub feed. Drafts and prereleases are not offered. Never replace an existing version with different bytes; publish a higher version.

For a manual GitHub Actions build, run **Windows desktop release** from Actions with a version tag already pushed. The workflow creates a draft release and uploads the complete artifact set. Review and publish the draft in GitHub. It does not trigger on ordinary pushes or overwrite published releases.

## Signing

Version 1 is unsigned because no Windows signing certificate was supplied. For subsequent releases, provision an appropriate Windows code-signing identity and configure electron-builder signing through secure build environment variables, such as `CSC_LINK` and `CSC_KEY_PASSWORD`, or your signing provider's supported integration. Store certificate material/passwords in GitHub Actions secrets or your private build environment, never source control. Enable `build.forceCodeSigning` when the signing pipeline is configured to prevent accidental unsigned releases. Test installer publisher identity and upgrade behavior on a clean Windows VM.

## Preservation and operations

The installed app stores data under `%APPDATA%\Studyspace`. The per-user installer preserves user data; updates do not reset IndexedDB. The source history also retains the original web version on `master` and tag `before-enhancements-20260908`. Code history is not a substitute for local workspace exports, database backups, or Storage backups.

The original browser workspace remains at its original browser origin. Keep its full backup until desktop import is verified. Desktop auto-updates update bundled software, not a hosted Supabase schema: apply future database migrations deliberately on your deployment following the migration runbook.
