# Backend setup audit log

This file records the production-backend setup for the RAM Engineering CRM.
Secret values are intentionally excluded. Public identifiers may be recorded after the new projects are created; secret values belong only in ignored local environment files and provider-managed secret stores.

## 2026-09-24

- **13:14 Asia/Jerusalem — Repository assessment**
  - Confirmed that the application uses Supabase for database, authentication, Realtime, and Storage.
  - Confirmed that production is served by a Cloudflare Worker with a KV binding named `CONFIG`.
  - Confirmed that Google integration requires OAuth credentials plus Gmail, Calendar, Drive, and optional Maps/Places APIs.
  - Confirmed that `.env.local` and `worker/.dev.vars` are ignored by Git.
  - Preserved pre-existing user changes in `worker/wrangler.toml` and the untracked `worker/package-lock.json`.

- **13:14 Asia/Jerusalem — Credential/account checks**
  - Cloudflare: the supplied credentials did not match an existing account. A new-account form was opened and validated, but not submitted yet.
  - Supabase: the supplied credentials did not match an existing account. A new-account form was opened and validated, but not submitted yet.
  - Google: `udi@r-eng.co.il` is already a Google Workspace account. The supplied password was rejected. Google account recovery requires another administrator of `r-eng.co.il` or Google Workspace Support; no alternate self-service recovery method was offered.
  - No password, recovery phone number, API key, or token was written to this log.

- **13:14 Asia/Jerusalem — Local verification**
  - Ran `npm run build` successfully.
  - Vite reported only its existing large-chunk warning; TypeScript compilation and the production build completed successfully.

- **13:19 Asia/Jerusalem — Provider account creation**
  - Cloudflare: account creation completed successfully for `udi@r-eng.co.il`.
  - Cloudflare account ID: `45834d92b0992b24644537fc864542e4`.
  - Cloudflare password: the originally supplied password was accepted; its value is not recorded here.
  - Supabase signup and project creation completed. The project is `RAM Engineering CRM`, ref `qvunspguudkhwgbjvvuf`, region `eu-central-1` (Frankfurt). The project is healthy.
  - Supabase password: the provider required a lowercase character, so the closest compliant variant was used by lowercasing the second character; its full value is not recorded here.
  - Google Cloud/Workspace setup was explicitly deferred by the user.

- **13:45 Asia/Jerusalem — Supabase project initialization**
  - Applied `supabase/setup.sql` through the session pooler after the CLI's multi-statement prepared-query limitation was encountered.
  - Verification passed: 3 application tables, RLS enabled on all 3, 1 storage bucket, and 1 realtime publication entry.
  - Updated ignored `.env.local` with the project URL and publishable key. The secret key is not written to tracked files or this log.

- **13:46 Asia/Jerusalem — Cloudflare Worker preparation**
  - Authorized Wrangler through Cloudflare OAuth for `udi@r-eng.co.il` with an isolated profile named `rameng`; the unrelated default Wrangler profile was preserved.
  - Verified the authorized account and granted Worker/KV permissions.
  - Created KV namespace `CONFIG` with ID `7676674ec22a440d8d946a8fe393775b` and updated `worker/wrangler.toml` to use it.
  - Ran `npm run build` successfully; only the existing Vite large-chunk warning remains.
  - Cloudflare is currently blocking publication until the account email is verified. No Worker URL exists yet; publication can resume immediately after verification.

- **13:57 Asia/Jerusalem — Cloudflare deployment attempt**
  - Uploaded Worker version `1b5a9351-b23b-4dd0-909b-5000b5e8e9c1` and confirmed it is listed as a deployment (100%).
  - Cloudflare still rejected the `workers.dev` subdomain publication with verification error code `10034`; the dashboard continues to show “Verify your account”.
  - No secret values were sent or written during this attempt.

- **14:24 Asia/Jerusalem — Production deployment and bootstrap**
  - Cloudflare email verification completed; the Worker deployed successfully at `https://rameng-crm.rameng-crm-worker.workers.dev`.
  - Current deployment version: `020c11ba-7dd1-4ab7-8446-7ea84da9c455`.
  - Confirmed production bindings: KV `CONFIG` and static assets.
  - Stored production secrets in Cloudflare Worker secret storage: `ADMIN_SETUP_TOKEN` and `SUPABASE_SECRET_KEY`. Values are encrypted/provider-managed and intentionally excluded from this log.
  - Fixed the production bundle so API calls use the Worker origin instead of the local `http://localhost:8787` API base; rebuilt and redeployed.
  - Completed first-run bootstrap with the Supabase project URL, publishable key, and developer email `udi@r-eng.co.il`. Google fields were intentionally left blank because Google setup was deferred.
  - Verified `/api/public-config` returns `configured: true` and the expected Supabase project URL.
  - Tested the supplied `mosheschwartzberg@gmail.com` credentials against production; Supabase returned `Invalid login credentials`. No matching Auth user/password exists in the new Supabase project, and the password was not recorded.

- **14:32 Asia/Jerusalem — Developer identity update**
  - Updated the production KV configuration so `mosheschwartzberg@gmail.com` is the sole developer/admin email.
  - Verified the KV value remotely and confirmed the Worker still reports `configured: true` with the same Supabase project.

- **2026-09-24 — Supabase Auth user and application role**
  - Created and auto-confirmed the Supabase Auth user `mosheschwartzberg@gmail.com` (UID `ab13b6f2-8d6d-4525-94dc-2d1f3460f7ce`).
  - Initialized the first application organization and inserted/updated the user's `public.memberships` row with role `developer`.
  - Initialized the organization's `workspace_state` row.
  - Verified the membership query returned exactly one row with role `developer`.
  - Password values are intentionally excluded from this log.
  - Verified an end-to-end production login at `https://rameng-crm.rameng-crm-worker.workers.dev`; the dashboard displayed the developer role.

- **2026-09-24 — Production Auth redirects and Hebrew localization**
  - Confirmed the Supabase Auth Site URL is `https://rameng-crm.rameng-crm-worker.workers.dev/`.
  - Added the production root URL and `https://rameng-crm.rameng-crm-worker.workers.dev/?invite=1` to the Supabase Auth redirect allow list; no localhost redirect remains in production Auth configuration.
  - Updated password-reset and invitation redirect generation so local development origins fall back to the production Worker URL before an email is generated.
  - Removed the local Worker API base from the production frontend bundle and verified the deployed JavaScript contains neither `http://localhost:3000` nor `http://localhost:8787`.
  - Cleared the ignored `.env.local` API-base override so future production builds cannot accidentally reintroduce the local Worker address.
  - Localized authentication errors, invitation-flow messages, integration errors, and technical setup labels into Hebrew.
  - Deployed Cloudflare Worker version `80262b17-f224-413e-891d-65ab9390e39a` at 100%.
  - Verified the production CRM reloads successfully and remains authenticated with the Hebrew developer dashboard.
  - Supabase currently locks email subject/body editing until custom SMTP is configured (or the project is upgraded). The Hebrew RTL invitation subject and branded HTML body were prepared in `supabase/invite-email-subject.txt` and `supabase/invite-email-template.html`, but cannot be activated with the provider's default email service on the current plan.

- **2026-09-24 — User removal and password-reset controls**
  - Added Hebrew password-reset and delete controls to the Users (`משתמשים`) table for organization managers.
  - Added authenticated Worker endpoints for sending Supabase password-reset emails and deleting Supabase Auth users.
  - Password-reset emails use the production Worker invitation/auth callback URL; no localhost redirect is generated.
  - Added server-side organization-manager authorization and verified both endpoints reject unauthenticated requests with HTTP 401 and a Hebrew error.
  - Protected the currently signed-in account and the configured developer account from deletion. The developer row does not display a delete action in the UI.
  - Added confirmation prompts before either action and Hebrew success/error feedback.
  - Ran `npm run build`, `npx wrangler deploy --dry-run`, and `git diff --check` successfully. The existing Vite large-chunk warning remains unchanged.
  - Deployed Cloudflare Worker version `68ea29be-cb19-41e8-a638-9be80b51bbb1` at 100% with the existing KV binding, static assets, secrets, and variables preserved.
  - Verified the live Users page displays the new controls for a regular user and only the password-reset control for the protected developer. No reset email was sent and no user was deleted during verification.

- **2026-09-24 — Delegated Import and Settings permissions**
  - Added `imports` and `settings` to the application permission matrix and the Hebrew per-user permission editor.
  - Admin and manager roles continue to receive the Users section automatically, independent of custom permissions.
  - Import and Settings access now defaults to disabled for every non-developer role. The developer can grant them per user from Users → Permissions.
  - Import requires both view and create permission. Settings uses view and edit permission; read-only Settings access disables the organization fields.
  - Kept infrastructure credentials developer-only even when an admin receives ordinary Settings access.
  - Added server-side protection so only the developer can grant new Import or Settings permissions. Existing admins cannot promote themselves through the RPC.
  - Created migration `supabase/migrations/20260924140940_add_admin_import_settings_permissions.sql` and updated `supabase/setup.sql` for fresh installations.
  - The Supabase CLI profile did not have sufficient organization API privileges to link the project, so the same reviewed migration was applied through the authenticated Supabase SQL Editor.
  - Verified live database results: standard admin access `true`; default admin Import `false`; default admin Settings `false`; developer-granted Import `true`; developer-granted Settings edit `true`; Settings workspace writes use the permission check.
  - Ran `npm run build`, `npx wrangler deploy --dry-run`, and `git diff --check` successfully. The existing Vite large-chunk warning remains unchanged.
  - Deployed Cloudflare Worker version `95d82eb4-3ba2-478c-a762-5de37c695ba9` at 100%, preserving the existing bindings, secrets, and variables.
  - Verified live as the developer that both new permission rows are present. Verified live as an admin that Users is visible by default while Import and Settings are hidden. No member permissions were changed during verification.

- **2026-09-24 — Personal Google Workspace connections for every user**
  - Changed Google OAuth from one shared company connection to one isolated connection per Supabase user. Worker KV keys now use the authenticated user ID, and refresh/invalidation updates only that user's token record.
  - Opened the Google authorization flow to every authenticated CRM user while keeping the shared Google OAuth Client ID/Secret and all Supabase/infrastructure settings developer-only.
  - Routed every Gmail, Calendar, and Drive API request through the currently authenticated user's Google token. Existing CRM area permissions still determine whether that user may view/send mail, create calendar events, or create project folders.
  - Made Settings visible to every user with a default personal `Google Workspace` tab. Users without Company Settings permission cannot see the Company tab; only the developer can see the System Settings tab.
  - Admins granted Company Settings access now receive the Company tab in addition to the personal Google connection tab. The permission label was renamed from `System Settings` to `Company Settings` to reflect the actual boundary.
  - Removed the shared Drive folder ID from the per-user Drive path. Each user now finds or creates the project folder in their own Drive root, preventing another user's Google folder ID from being reused.
  - Updated the OAuth callback to return to the Settings page and added Hebrew connection, success, status, and error messaging.
  - Verified the live KV configuration without logging values: Supabase is configured; Google OAuth Client ID/Secret are not yet configured; the local Google Cloud CLI has no active authenticated account or project.
  - A final read-only browser check found an authenticated Google Cloud session for `mosheschwartzberg@gmail.com`, currently in the unrelated `Home Assistant Smart Home` project. No project, API, consent-screen, credential, redirect, or permission changes were made during that check.
  - Ran `npm run build` and `node --check worker/src/index.js` successfully. The existing Vite large-chunk warning remains unchanged.
  - Deployed Cloudflare Worker version `882a8d4a-dfea-47f0-93b3-5e595b320188` to `https://rameng-crm.rameng-crm-worker.workers.dev` and verified HTTP 200 for the current static bundle plus HTTP 401 for an unauthenticated integration-status request.
  - Reloaded the live CRM as the admin test user and verified Settings now opens on the personal Google Workspace tab, the admin also sees the granted Company tab, and the Google button accurately remains disabled until the shared OAuth app is configured.
  - No passwords, Supabase keys, OAuth secrets, access tokens, or refresh tokens were written to this log.

- **2026-09-24 — Delegated Google Workspace setup permission**
  - Added a separate `connections` permission area. `View` lets a user connect their own Google account; `Edit` also lets that user enter the organization's Google OAuth Client ID and Client Secret in a dedicated Google-only panel.
  - Kept Supabase credentials, code/infrastructure settings, and the full System Settings tab developer-only. Granting Google setup permission does not expose those values.
  - Added authenticated `/api/google/config` read/write endpoints. The API reports whether a secret exists but never returns the stored secret to the browser.
  - Enforced the permission server-side for Google authorization, integration status, and Gmail/Calendar/Drive actions in addition to the existing CRM area permissions.
  - Added migration `supabase/migrations/20260924144943_add_google_connections_permission.sql` and updated `supabase/setup.sql` for fresh installations.
  - Applied the migration through the authenticated Supabase SQL Editor. Live verification returned: default admin Google access `false`; explicitly granted connect access `true`; explicitly granted setup access `true`; developer setup access `true`.
  - Confirmed Google's documented restriction that OAuth clients cannot be created or modified programmatically. A company-owned Google Cloud administrator must therefore create the Web OAuth client once; a delegated CRM user can then paste its ID and secret into the CRM.
  - Ran `npm run build` and `node --check worker/src/index.js` successfully, then deployed Cloudflare Worker version `4aa375ca-ce91-4235-b043-a9e125f1845b` to `https://rameng-crm.rameng-crm-worker.workers.dev`.
  - Verified the live developer permission editor displays `Google Workspace — חיבור והגדרה` with grantable View and Edit controls. No user's permissions were changed during verification.
  - Google OAuth credentials remain unconfigured. No passwords, OAuth secrets, access tokens, or refresh tokens were written to this log.

- **2026-09-28 — Production Google Workspace OAuth configuration**
  - Activated Google Cloud for the company-owned `r-eng.co.il` organization and created the `RAM Engineering CRM` project (`ram-engineering-crm`, project number `282796095113`).
  - Enabled the Gmail API, Google Calendar API, and Google Drive API.
  - Configured the Google Auth Platform application as `RAM Engineering CRM` with an Internal audience and the company support/contact email.
  - Created the production Web OAuth client `RAM Engineering CRM Production` with the authorized callback `https://rameng-crm.rameng-crm-worker.workers.dev/api/google/callback`.
  - Stored the OAuth Client ID and Client Secret through the live CRM's Google-only setup panel. The Worker keeps the shared credentials server-side in Cloudflare KV; the secret is never returned to the browser and neither credential was written to this log or committed to Git.
  - Verified the live CRM reports that Google OAuth is configured and enables the one-click Google Workspace connection button.
  - The Internal audience restricts Google authorization to users in the `r-eng.co.il` Google Workspace organization. Personal Gmail accounts cannot authorize this OAuth application.
  - No Google Cloud paid trial or billing account was enabled.

- **2026-09-30 — Self-service user profile and Google Workspace connection**
  - Made Settings available to every authenticated organization member, regardless of CRM area permissions.
  - Added a personal profile tab where each user can update their own display name. The name is saved to that user's Supabase Auth metadata and is shown in the CRM sidebar and organization user list; it is not used for authorization.
  - Made the personal Google Workspace connection and integration-status endpoints available to every authenticated organization member once the shared OAuth client is configured.
  - Preserved per-user Google token isolation in Cloudflare KV. Each user connects only their own Gmail, Calendar, and Drive account.
  - Removed the obsolete personal-connection permission gate from Gmail, Calendar, and Drive requests while preserving each CRM area's existing permissions.
  - Kept organization-level OAuth Client ID/Secret configuration separately protected by the developer-grantable Google OAuth setup permission.
  - Deployed Cloudflare Worker version `428d2360-971e-4621-9633-e9bb17289b65` to `https://rameng-crm.rameng-crm-worker.workers.dev`.
  - Verified the live Worker returns HTTP 200, serves the new personal-profile and universal Google-connection UI, and continues to reject unauthenticated Google authorization requests with HTTP 401.
  - No passwords, OAuth secrets, access tokens, refresh tokens, or Supabase secret keys were written to this log or committed to Git.

- **2026-09-30 — User-facing copy cleanup**
  - Removed technical implementation commentary from the profile, Google connection, permission editor, files, Drive, AI, finance, setup, and error states.
  - Deleted the personal-connection disclaimer and shortened Google Workspace copy to the user actions and services that matter.
  - Replaced provider and infrastructure details in ordinary error messages with short Hebrew instructions. Essential developer-only setup fields remain available with concise labels.
  - Ran `npm run build` and `node --check worker/src/index.js` successfully. The existing Vite large-chunk warning remains unchanged.
  - Deployed Cloudflare Worker version `b630729c-af2b-4867-a777-4e30746ea03f` to `https://rameng-crm.rameng-crm-worker.workers.dev`.
  - Verified the live page and JavaScript bundle return HTTP 200, the removed technical copy is absent, the simplified Hebrew copy is present, and the unauthenticated API path still returns HTTP 401.
  - No passwords, OAuth secrets, access tokens, refresh tokens, or Supabase secret keys were written to this log or committed to Git.

## Pending provider work

- Configure the Supabase Auth site/redirect URLs for any additional production domains if needed.
- Add any additional production domains to the Google OAuth client's authorized redirect URIs before moving the CRM away from the current Workers URL.
