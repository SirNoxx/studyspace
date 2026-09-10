# Connected community: implementation and release

The community lives alongside the personal workspace, with separate permissions and storage. A workspace save cannot overwrite a community profile or a shared file. No private note, journal entry, attachment, edit event, or AI conversation is automatically posted to Discover.

## Data and access contracts

`20260910164312_connected_community.sql` introduces profiles, blocks, people/topic follows, posts, comments, saves, unique signed-in downloads, conversation requests/messages, shared collections/members/invitations/nodes/versions/assets, moderation reports, audit events, and mutation receipts. Existing publications remain immutable public snapshots with their existing explicit publication flow.

All new tables have RLS. Browser roles receive no direct write permissions. `community_command` takes the current verified database identity, validates each operation, locks the relevant collection or conversation pair, applies quotas, and commits the change and its idempotency receipt together. Client-provided owner IDs or role claims never authorize an operation. `community_query` independently checks permissions before returning data. The API uses the session client, never the service key, for community operations.

Profiles begin private and message requests begin disabled. A public profile exposes only username, avatar, bio, interests, social links, published snapshots, and follower count. Settings, blocked accounts and account statistics are owner-only. Making a profile private hides its community posts and profile; already-published snapshots retain their explicitly published URLs until separately unpublished.

Owners manage membership and invite recipients as Viewer, Editor, or successor Owner. Invitations grant no access until accepted. Ownership transfers only on acceptance; the former owner becomes an editor. Editors create, edit, move and soft-delete shared notes/folders. Viewers only read. Folder cycles and cross-collection moves are rejected. Deleting a folder requires moving or deleting its children first. Shared content is separate from public publishing.

Shared saves submit the last seen revision. Stale saves return `409 REVISION_CONFLICT`. The editor retains the draft and presents the latest version for explicit comparison. Restore creates a new version in the collection root, preserving the previous saved versions. Polling checks permission every five seconds while visible and retrieves content only when the collection revision changes. This provides concurrent editing with explicit conflict resolution; it does not merge simultaneous keystrokes. No community table is added to an unrestricted realtime publication.

Attachments are protected database blobs, downloaded through `/api/social/assets/:id` with a fresh session/RLS check on every request. There are no long-lived signed download URLs. Revocation immediately denies further downloads and requests; an already-downloaded copy cannot be recalled. An open collection clears after its next permission check. Limits: 5 MB per attachment, 50 MB attachments per collection, 20 MB current text per collection, 2,000 files/folders, and 200 items per explicit initial import. Markdown is edited as text; code is never executed by collaborators' shared note viewers.

Conversations have a unique unordered pair of participants. There is one introductory message before acceptance, and an ignored or declined request cannot be repeatedly recreated. Only the recipient accepts, declines or ignores it. Accepted participants can send messages unless either participant blocks the other. A client-generated UUID is retained on a retry; the database returns the original receipt and rejects reuse with changed content. Sequence cursors prevent duplicate pagination entries and read watermarks are monotonic. Message drafts survive request failures while the page remains open.

## API

`GET /api/social?kind=…&id=…` supports `profile`, `people`, `feed`, `comments`, `conversations`, `messages`, `shared`, `collection`, `versions`, `badges`, and moderator-only `reports`.

Feed filters are `q`, `category`, and `feed=latest|following|interests|saved`. Posts, comments and conversations use the pair `before` (timestamp) and `beforeId` (UUID); messages use `sequence`, versions use `revision`. Responses include `viewer` plus the selected resource. Pages contain 30 posts/comments/conversations, 40 messages, or 30 versions. Collection polling can submit its revision and receive `notModified` after permission is checked.

`POST /api/social` accepts `{ action, data, requestId }`. Supported actions: profile; block/follow/topic; post/post-edit/post-delete; comment/comment-edit/comment-delete; save/download; request/conversation/message/read; collection/invite/invitation/member/leave; node-create/node-save/node-delete/node-restore; asset/asset-delete; report/moderate. Node changes include `collection`, `id`, and `revision`. Membership changes include `collection`, `target` and `role`. All non-read operations are authenticated and checked for same-origin requests. JSON uploads are bounded while reading the body. Responses do not include server internals or secrets.

Daily UTC quotas: 5 new conversation requests, 20 posts, 20 collaborator invitations, 200 messages, 1,000 node operations, 10,000 read acknowledgements, and 100 other operations per action/account. Database validation also applies when clients bypass the Next.js API and call Supabase directly.

## Privacy, moderation and operations

Blocking removes follows in both directions, hides the profile and feed content between those accounts, prevents messaging and invitations, and denies a member access to collections owned by the other account. Existing conversation history remains readable for reporting. Reports capture relevant content; conversation reports include the latest 20 messages. Only moderators can inspect other users' reports, hide posts/comments or suspend accounts. Moderator identity comes from the protected existing `profiles.moderator` flag.

Profile preferences independently control message, invitation, comment and follow notifications delivered to the existing Inbox. Unread conversation badges remain available independently of notification preferences. Public posts are deliberate user actions; personal workspace activity is never a notification source for followers.

Account deletion cascades community identity, posts, comments, owned shared collections and conversations for both participants. Contributions to someone else's shared collection remain with author references set to null. Users should transfer ownership first to preserve a shared collection. Moderation evidence becomes eligible for deletion after 90 days; the existing worker's daily `community_maintenance` call removes expired reports and non-collection audit records. Run `npm run worker` continuously in the deployed environment. No external email, push delivery or third-party monitoring credentials are assumed.

API failures emit `social_operation_failed` with operation/error code only; message bodies, profile fields, tokens and IDs are not logged. Download metric failures emit `social_download_metric_failed`. Worker events `community_maintenance_completed` and `community_maintenance_failed` expose open report count, oldest open report time and cleanup outcome. Alert on elevated failures, repeated `PT409` conflicts, cleanup failure, and oldest open reports exceeding the moderation team's response target. Hosting log retention and alert routing must be configured by the deployment operator.

The Supabase advisor flags the explicitly granted SECURITY DEFINER entry points. These grants are intentional: each is covered by the database permission allowlist and multi-account authorization tests. Private helper/notification/maintenance functions remain unavailable to browser roles. Leaked-password protection is a separate pre-existing Supabase Auth configuration warning.

## Verification and staged acceptance

1. **Database foundation:** apply the additive migration to an isolated Postgres database. Run `npm test`. Require direct-role tests to prove private profiles/statistics are hidden, direct DML is denied, outsider reads fail, and deleted identities cannot use still-valid JWTs.
2. **Profiles and Discover:** test private/public transitions, editing, safe social links, deliberate publishing, all feed filters, following, saving, comments, reports, narrow-screen layout, keyboard labels and dialog focus. Existing private workspace editing and public snapshot browsing must still work.
3. **Shared collections:** use separate owner/editor/viewer accounts. Prove invitations require acceptance, only owners change roles, stale saves retain drafts, folder cycles fail, prior versions restore, and a revoked member immediately loses attachment access. Check an open view clears on the next poll.
4. **Messaging and release:** prove one introduction before acceptance, recipient-only acceptance, no duplicate message after a committed response is lost, unread acknowledgements, pagination, block enforcement, and cleanup of temporary accounts. Run the production webpack build and browser suite on that build before packaging desktop releases.

`tests/community.test.ts` covers the database contracts using PGlite roles. `e2e/community.spec.ts` is opt-in and creates only isolated temporary accounts via the Auth admin API (no invitation email). Run with `RUN_COMMUNITY_HOSTED=1`; it reads the local environment without printing credentials and deletes every temporary account in teardown. Do not run the hosted suite against real user identities.

## Rollback

`20260910165220_community_release_controls.sql` adds a service-only `community_release` row. Its `features` array supports staged enablement of `profiles`, `discover`, `shared`, `messages`, and `moderation`. Removing a feature blocks its commands and reads, including direct database clients. Set its `enabled` field to false for a database-wide emergency pause; guarded RLS helpers also deny new shared attachment reads. Core function entry points are explicitly revoked from browser and service roles.

Set `SOCIAL_ENABLED=false` and restart the web process to return maintenance responses from community endpoints without changing personal workspace routes. Roll back the UI release if needed. Keep the additive schema and its data so collaborators do not lose work. Do not drop the tables or replay workspace snapshots as a rollback. Use the database release row for emergency gating rather than changing grants ad hoc. Re-enable only the previously enabled feature list after verification. Attachment access remains governed by RLS membership checks.

The installed desktop executable is a separate release artifact. Source changes and the web build do not update an already-installed executable; rebuild/package and distribute it through the desktop release process after acceptance.

## Current verification evidence

The complete unit/database suite passes 114 tests. The hosted multi-account browser suite covers public/private profile setup, private statistics, public posts, accessible narrow-screen profiles, invitation acceptance, draft-preserving conflict resolution, protected attachment downloads and revocation, accepted messaging, and idempotent retry after a response is deliberately lost. Temporary accounts are deleted in teardown.

The bounded load scenario uses 200 shared notes, four concurrent readers and 12 measured reads, with a 5-second p95 acceptance threshold. Two simultaneous saves to one revision must produce exactly one success and one conflict. `community-load-results.json` records the measured result. This is a staged-release workload check, not a claim of internet-scale capacity; test against the intended Supabase tier and expected traffic before general availability.

`20260910165842_community_profile_metrics.sql` adds saved-publication counts and navigation identity. `20260910170305_community_rls_query_plans.sql` makes the identity-only parts of RLS policies evaluate once per statement. Remaining pre-existing foreign-key index advice concerns the personal workspace tables, outside these migrations.


The final production browser run passed all four community scenarios. Seven existing module/template browser checks also passed. The bounded load run measured 241 ms p95 against a 5,000 ms threshold; this is a small controlled workload, not a capacity guarantee.

`20260910171104_community_semantic_conflicts.sql` maps stale application revisions to `PT409` at the RPC boundary. The hosted gateway otherwise retries `40001` indefinitely. This behavior is documented in [Supabase's RPC conflict guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Genuine database serialization errors retain their original handling.
