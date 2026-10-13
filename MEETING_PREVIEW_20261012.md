# CRM meeting changes — development preview, 12 October 2026

Development branch: `codex/meeting-crm-preview`.
Preview: https://meeting-crm-rameng-crm.rameng-crm-worker.workers.dev

The user's explicit instruction supersedes the pasted production-deployment request. Only Worker versions are uploaded; production traffic, routes, cron triggers, and the production database schema are unchanged. The preview uses the existing authenticated Supabase/Google/KV bindings. Its banner explains that editing and sharing affect those shared services. This is a code preview, not an isolated database.

## Requirement checklist and verification status

“Completed” below means implementation and relevant local verification passed. Provider-dependent items remain partial until authenticated, controlled-recipient testing is performed on the live preview.

| # | Scope and classification | Status and evidence |
|---|---|---|
| 1 | Verify/fix task layouts; add column filters and structured profession review | Completed locally. Existing persisted layout work retained; browser verified hiding, moving, changing a percentage width, saving, and reloading. Visible data columns have text filters; category, assignee, project, color, status and date filters remain. Profession custom columns use configured categories, preserve legacy values, and offer explicit value-by-value replacement in Display settings. Regression tests cover immutable normalization and ambiguous values remaining untouched. |
| 2 | New task time; assess existing calendar behavior | Partial. Time input and configurable column added. The clock applies to start date, otherwise due date, otherwise follow-up date. Browser verified creation/filter/reload. Jerusalem conversion tests cover winter/summer, midnight date boundaries, invalid dates and DST gap/overlap rejection. Existing explicit Google event creation uses the task clock and a Jerusalem instant; automatic task-to-Google synchronization is not introduced. Expanded day entries remain available; overflow now tells users to click and scrolls to the day list. Real Google event creation not exercised. |
| 3 | New navigation access; verify RTL/responsive controls | Completed locally. Top horizontal navigation and a task email selector work independently of off-screen columns. Mobile wrapping verified at a measured 390px viewport; desktop opening verified. |
| 4 | Verify linked email thread/reply/collapse behavior | Partial. Existing mailbox-private associations and full thread renderer retained. Browser fixture inspected the linked thread, quoted-history expansion control and reply-in-thread action. Existing provider tests validate Gmail thread IDs and RFC reply headers. Real recipient delivery not exercised. Forwarding/quoting the entire chain remains unspecified; no new automatic forwarding behavior was invented. |
| 5 | Investigate/fix Gmail cache | Partial. Full-thread reads bypass the daily cache, and successful sends invalidate cached reads. Tests prove two consecutive openings reach the provider and send invalidation occurs. Read/unread/trash invalidation already existed and is retained. This addresses code-supported stale content; the isolated word “events” remains ambiguous. Live Gmail behavior not exercised. |
| 6 | New project-contact task assignment; verify authorization | Partial. Contact picker is restricted to project contacts/clients with email. Existing accounts are reused by normalized email. Internal accounts are reused; external invitation/access requires explicit manager approval. Contact membership alone grants nothing. Existing external role and project grant RPC are reused; external accounts receive assigned-task access and limited project summary, not CRM/files/settings access. Database tests enforce assigned-task-only reads/updates and denial of raw documents/storage/permission overrides. Actual invitation round trip not exercised. |
| 7 | New external task page and comments | Partial. Email task URLs require existing Supabase authentication and render a focused external page. Status uses existing restricted save RPC. New comments are stored as separate private KV records; every read/write validates the caller's JWT through the filtered workspace RPC, including organization/task scope and the role in the target organization. Browser fixture verified status save, comment creation and denial of an unrelated task. Server tests cover allowed/denied comments. Membership removal, project-grant removal or reassignment revoke task access; session expiration follows Supabase Auth. No secret-bearing unrestricted link is introduced. Reference product was not supplied or inspected. Authenticated live external-recipient testing pending. |
| 8 | New contact-table preferences and consultant exports | Completed locally. Global contacts and selected project contacts share a table. Visibility/order persist with the account/browser display preferences, like task grouping/density; task column layout remains organization-wide. Browser verified hide/reorder/reload and actual downloaded CSV contents. Printable RTL output follows the existing browser-print/PDF convention; tests verify escaping and chosen project title. Native PDF save dialog not exercised. |
| 9 | Verify direct Drive upload; new rename/list | Partial. Direct upload explicitly targets the connected project root folder and stores no extra CRM copy. Existing hierarchy/breadcrumbs are retained. Rename validates project scope, live ancestry, protected/read-only folders and caller permissions before PATCHing only the file name; metadata and selected reports refresh afterward. File table shows names and modification dates without owner. Browser fixture verified rename/refresh. Provider tests cover successful rename, unrelated files, protected/read-only folders and external-role denial; existing upload/idempotence tests retained. Browser upload blocked by Chrome extension file-URL permission; live Drive upload/rename pending. |
| 10 | Verify single-file sharing and project contacts | Partial. Existing Drive permission API retained. File sharing discloses its exact scope and reader/commenter permission before submission; project contacts are suggested. Existing explicit folder-sharing feature separately discloses inherited folder access. The server checks the target organization role before sharing or renaming a file. Browser fixture confirmed reader permission for `external@example.test`; provider tests verify scope/protection and failed OAuth feedback. No real contact received a test message. Live controlled-recipient sharing pending. |
| 11 | Desktop PDF feasibility | Partial by design. Drive-backed PDFs open in Drive with explicit download/edit guidance and upload through Drive version management. The browser cannot automatically control Adobe/Foxit or save back from the desktop. Existing optional desktop bridge/download fallback preserved; no archive duplication or new desktop installation performed. |
| 12 | New plan delivery report | Completed locally. Selected files retain project context, names and Drive modification dates. Report table, CSV and printable output explicitly distinguish selection from successful delivery; they never claim a selected file was sent. Browser fixture verified selected-file table and single-file sharing disclosure; rendering/export tests verify names, dates, escaping and delivery wording. |
| 13 | Preserve/defer AI | Completed. No new AI integration added. |

## Checks and deployment evidence

- TypeScript check and standard build passed. Preview build uses `.env.preview` and adds a visible preview notice.
- 109 regression tests passed, including timezone, profession review, linked email, cache, permissions, private comments, Drive rename, report rendering and export escaping.
- Disposable PostgreSQL runner applied the existing schema and all migrations, then passed `tests/project-workflows.sql`. No remote database or schema was modified.
- Worker syntax check, Worker upload dry run and whitespace checks passed.
- Preview login page and notice verified in Chrome; no captured console errors. Initial preview HTML/JS/CSS were compared byte-for-byte with the local preview build. Unauthenticated comment/Gmail/Drive requests return 401.
- Production remains routed 100% to `1fe97240-b02d-4e13-96e8-1493e8c08e66`.
- Browser evidence and logs are in `artifacts/meeting-*` (local, not committed). The Chrome extension blocked file chooser upload until “Allow access to file URLs” is enabled; that setting was not changed. Downloaded consultant CSV was independently read from Downloads and copied to the artifacts directory.

## Remaining live verification

Sign in on the preview with an authorized test account and use a controlled Google recipient/folder to verify Gmail delivery/cache/read state, Calendar event timestamps, Drive upload/rename/sharing, and invitation/external access/revocation. No authenticated test session or controlled live recipient was available in this run. Local fixtures and provider mocks are not evidence of working live Google integrations.

The selected files report records selection only; successful Drive sharing remains recorded separately in the existing per-file permission metadata. A receipt format, forwarding of an entire email chain, and the unspecified reference-product example still need product clarification.

Cloudflare's [version URL documentation](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) explains version-only previews and shared bindings. The implementation uses Google's [file update endpoint](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update) and the existing [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) access model.

Pre-existing desktop bridge/package changes, `.gitignore` changes, and the historical release checklist were preserved outside the development commit.

## Final preview identity

- Deployed application code commit: `0374d8fa336f020ae5870a72fbc13776e06b9bc1`.
- Worker version: `6004631b-a4d2-4b9f-8e89-d605dcb1e4a3`.
- Immutable preview: https://6004631b-rameng-crm.rameng-crm-worker.workers.dev
- Final preview HTML and all four initial assets match the build byte for byte. Task-comment, Gmail-thread and Drive-file unauthenticated requests return 401. Chrome displays the login page and preview notice without captured console errors. Production routing was rechecked and remains on the previously deployed version.
- The final follow-up commit contains only this report identity and a QA-only mock threading correction; deployed application source is unchanged.


## Scope recheck and QA — 13 October 2026

This follow-up supersedes the earlier unauthenticated-browser limitation for Gmail reads. Udi's connected Chrome profile (`r-eng.co.il`) was used. The task email selector opened the exact linked Gmail conversation, rendered 20 messages, retained its project/task association and opened the reply-in-thread form. No real reply or share was sent. Opening the conversation updated the unread count from 45 to 42. No captured browser errors were present.

Corrections from this pass:
- Removed the duplicate 259-contact card list. The configurable contact table is now the single directory, with 25 rows per page, counts and previous/next controls at both ends. Search and exports cover all filtered contacts, across pages.
- Contact names are visibly underlined, with an explicit open-card action even when the name column is hidden. Project contact pickers have separate open-card and remove-selection controls; contact assignment and financial reports link to the contact card when authorized.
- Action buttons wrap as intact buttons. The task table preserves configured proportions while ensuring controls have enough space. Hebrew/English names, email/phone values and date/time inputs have explicit directional isolation; long email HTML stays within its own scroller.
- Renamed the default and legacy system time captions to `שעה`, preserving custom captions.
- Added missing task dates/time to the customer-card create/edit forms and display. A time requires a valid primary date, using the shared Jerusalem/DST validation.
- Fixed global task comments and contact assignment using an incorrect fallback organization ID. Organization ID is now required by the task board. View-only users can also open permitted comments; posting remains gated by status/edit permission and server authorization.

QA evidence: 110 regression tests passed; TypeScript and preview build passed. Isolated browser fixtures verified paging (26–50 of 62), searching for contact 62 from another page, opening its card, time-without-date rejection, successful 14:35 scheduling from the customer card, and button overflow measurements. At a measured 390px viewport, document width stayed 390px and task navigation/action controls did not overflow. Existing authorization/provider tests cover external restrictions, threading, cache invalidation and Drive operations.

Live Drive inspection found no connected root folder for the two inspected projects (ויתקין 12 and דבורה הנביאה /יעקב חזן). Their UI correctly asks to connect a folder. No folder was created or linked for testing. Calendar creation, external invitations, actual Gmail delivery and Drive mutation round trips remain unverified live; the original partial statuses for those provider-dependent items still apply. PDF desktop editing remains the documented fallback workflow.


### Updated preview identity (13 October)

- Application code commit: `4c96723e32b901352589bb6b9709b63b8c475461`, pushed to `codex/meeting-crm-preview`.
- Worker version: `a431b3da-c30b-4757-b7cb-f6dd25c8b5dd`.
- Stable preview: https://meeting-crm-rameng-crm.rameng-crm-worker.workers.dev
- Immutable preview: https://a431b3da-rameng-crm.rameng-crm-worker.workers.dev
- Stable preview HTML and all four initial assets match the final build byte for byte. Unauthenticated task-comment requests return 401. Production remains 100% on `1fe97240-b02d-4e13-96e8-1493e8c08e66`.
- After Udi signed in to the refreshed stable preview, authenticated live checks passed: one contact table; paging 1–25 then 26–50 of 259; search across the directory; open-card navigation; assignment contact-card navigation; the `שעה` header; task comments read returning HTTP 200; intact action buttons without text overflow; and mobile task controls at a measured 390px with no document overflow. The linked Gmail conversation loaded 21 messages (20 in the earlier check), and message collapse worked. Gmail and task layouts remained within the mobile viewport. No browser errors or comment error alerts were captured. No live comments, task edits, invitations, replies or shares were submitted. Mobile emulation was cleared afterward.
- Final rerun: all 110 regression tests passed. Evidence is in `artifacts/qa-20261013-*` and `artifacts/qa-*` screenshots (local only).
