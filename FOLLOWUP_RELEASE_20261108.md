# RAMENG CRM follow-up - 8 November 2026

## User-facing corrections

- One task **מקצוע** dropdown replaces the duplicate checkbox column. Existing legacy values and multi-links are retained on load; an explicit choice stores a stable profession ID, keeps compatible legacy custom values and respects the existing project-scoped category constraints. Profession filtering, project discipline groups, meeting output and task-generated reports now resolve the same values. Renaming a profession preserves IDs and updates matching legacy names. The manager is labeled **ניהול מקצועות**, reflecting the existing shared taxonomy.
- Login, invitation/password setup, confirmation fields and masked settings fields use one accessible visibility control. Values and autocomplete semantics are retained; each field toggles independently and defaults to hidden.
- External task pages identify the signed-in user and provide a return-to-assigned-tasks action. Comments appear below task names in the internal task table, with author and time. Visible rows refresh on focus, after a local comment and once per minute; server-side task authorization still applies. A latest-comment index preserves previews for long discussions.
- New external invitations use the existing authorized Gmail sender, with a clear RAMENG subject, verified project/task names where supplied, deadline, required actions and explicit scope limits. Supabase still creates the secure first-password link; it is not returned to the browser. Existing accounts keep their login; unconfirmed-account retry links are kept in private, expiring server storage. Internal invitations retain their existing flow. Invitation sending requires the inviter's communication permission and a working Gmail connection, and never downgrades an existing internal member.
- Save, backend/storage, API and unhandled application failures produce sanitized, account-scoped diagnostic reports to **mosheschwartzberg@gmail.com**. Secrets, URL query tokens and workspace payloads are excluded. Offline browser reports are bounded and retried after reconnect/sign-in. Server reports are deduplicated hourly and capped at 20 distinct reports per user/day. The existing five-minute Worker schedule retries queued delivery; sender membership and permission are rechecked. Ambiguous sends are not blindly resent.
- **Settings -> Google Workspace -> דיווח תקלות למפתח** (also available under חברה for authorized users) explains the alert path and provides a clearly labeled diagnostic test. It distinguishes provider-confirmed send, pending connection, rate limits and uncertain/failure states. Email delivery requires an active Gmail connection belonging to an authorized member; queued server diagnostics expire after seven days.
- **Project -> סיכומי פגישה** is a dedicated, visible tab. A primary action also remains in project tasks. The summary editor has assignee/profession filters, manual checkboxes, select-filtered-tasks, editable notes/photos, column visibility/order and a sandboxed layout preview before PDF. Filters do not silently remove already-selected tasks. Existing per-project structure/defaults and historical summaries are retained.
- **Report editor -> בחירת עמודות ועיצוב** opens the column controls directly before printing. The meeting PDF has a branded header, readable RTL spacing and bounded proportional images; the single-task/photo sample fits one landscape A4 page without an orphan footer page.
- **Project -> קבצים -> תיקיות הפרויקט ושיתוף חיצוני** leads directly to folder management. Configured profession shortcuts open the matching Drive discipline folder when editing is permitted. Project profession association is a separate clear action. Existing nested folders and explicit external sharing/revocation remain protected by backend project/Drive checks. Long Hebrew filenames wrap at readable size rather than being truncated.

## Verification before release

- TypeScript, production build and whitespace checks pass. Existing bundle-size advisory remains.
- **158/158** Node regressions pass, including invitation MIME/context/security, fixed diagnostic recipient, redaction/deduplication, offline retry, membership denial and unified profession behavior.
- **77/77** isolated Chromium scenarios pass, including seven responsive widths, independent password setup controls, profession save/rename/filtering, external identity, task-row comments, meeting discovery/selection/preview, file-folder access and direct report-column action. Focused photo/PDF export passed again after the print-layout adjustment; Poppler inspection confirmed one readable landscape page with preserved Hebrew, image proportions and caption.
- Disposable PostgreSQL applies setup and all 12 existing migrations and passes workflow, RLS, concurrent status/save and document metadata checks. Added a persistence assertion for the stable profession ID and legacy mirror through the real save RPC.
- Worker syntax/dry-run and audits pass. Worker full dependency audit: zero vulnerabilities. Frontend and desktop retain the previously recorded moderate tooling findings; no high/critical finding was introduced.
- No production schema migration or bulk business-data rewrite is needed. New optional workspace fields remain backward compatible; existing category IDs/permissions, private Google connections, report structures and files are reused.

## Release and rollback

Pre-release main commit: `3b9d901ac7c7ce47c15a8ae42c5e10cd733000e5`.
Pre-release Worker: `77ee2b6b-a10f-4c76-927a-4d06c414bae8`.
Rollback Git tag: `rameng-followup-pre-release-20261108`.
Deployment uses the existing RAM profile, account, CONFIG binding and `--keep-vars`. Roll back the Worker version for application issues; do not restore old workspace contents over later customer changes. Contextual invitations and diagnostic emails already sent cannot be unsent by rolling back the UI.

Production identity, CI and live smoke evidence are appended after deployment. Fixture tests do not establish recipient inbox delivery or a real external invitation redemption. The existing project dialog in Udi's original Chrome tab is preserved; live QA uses a separate tab.
