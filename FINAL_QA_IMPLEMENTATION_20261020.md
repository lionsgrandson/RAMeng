# RAM Engineering CRM — final QA implementation, 20 October 2026

This is an incremental release with explicit verification limits. The completed code and database checks do not certify live Google writes, the complete password lifecycle, or full disaster recovery. Application deployment identity and post-deployment evidence belong in the release record produced after deployment.

## Verified targets and preservation

- Repository: `lionsgrandson/RAMeng`; freshly fetched `origin/main` was `c8f4eedb0cb55fb0686b6708ad52c3854a443a81`.
- Dedicated branch/worktree: `codex/final-qa-20261020`, `RAMeng-final-qa`. The original preview checkout and its uncommitted desktop changes were preserved.
- Cloudflare: account `45834d92b0992b24644537fc864542e4`, production Worker `rameng-crm`, CONFIG namespace `7676674ec22a440d8d946a8fe393775b`. Every remote Wrangler operation explicitly selects profile `rameng`.
- Production: https://rameng-crm.rameng-crm-worker.workers.dev . Database: `qvunspguudkhwgbjvvuf`, verified in the signed-in dashboard as RAM Engineering CRM. The connector denies RAM access; the verified dashboard SQL path was used. An old local `.dev.vars` references a different database and was not used.
- Isolated static preview: https://rameng-crm-audit-preview.rameng-crm-worker.workers.dev . It has no production bindings, secrets, database or cron. Preview version `27656838-4a96-447e-b000-a4f969bb3b06` passed 56/56 browser scenarios.

## 1. Reported defects

### P0-A — custom permissions

The live setter compared privileged `true` values against raw stored JSON, treating an inherited `NULL` as all false. Every frontend custom preset includes `connections.view=true`; frontend and Worker permit this harmless connection-page view by default, but the SQL helper denied it. An administrator's otherwise legitimate custom object therefore raised `P0001: Only the developer can grant Google connection, import, or settings permissions`. The null/reset path bypassed that comparison. This failure was reproduced with synthetic authenticated database identities in a rolled-back production transaction; a browser HTTP capture for a genuine administrator test login was not obtained.

The SQL helper now matches the frontend/Worker connection-view default. The setter compares **effective old and new permissions**, including inherited defaults and omitted actions, while locking the target membership. Developer-only Google configuration, import and company-setting grants remain protected. In particular, turning a hidden privileged area back on cannot revive an old hidden write grant without developer authority. Missing/unauthenticated callers fail closed. Safe Hebrew messages distinguish restricted grants from generic save failures. Permission-modal errors are visible inside the modal. Transparent permission inputs now occupy their visible switch, fixing an additional pointer-target problem found by browser QA.

Files: `src/lib/backend.ts`, `src/components/UserManagement.tsx`, `src/layoutFixes.css`, and migration `20261020124239_fix_permission_defaults_and_external_completion.sql`.

Verification: all presets, create-only/manual combinations, persisted reloads, role reset, developer grant, protected developer target, unauthorized caller, effective-privilege escalation, and other-user preservation are covered by the SQL/browser suites. Tests read stored database values rather than relying on the painted permission table.

### P0-B — project access rows

The old markup used unstructured labels and native checkboxes that inherited global `input { width:100%; padding:... }` form styling. Dedicated RTL grid rows now constrain each checkbox, center it beside its clickable project label, wrap long names, and expose a focus outline. Controls stay disabled during grant loading/saving; the modal cannot close while a save is pending, and a save confirmation is shown.

Files: `src/components/UserManagement.tsx`, `src/layoutFixes.css`. The existing scoped `set_project_collaborator` operation is retained; no broader project-access grant was introduced.

Verification: browser grant/revoke, modal reload/persistence, and geometric alignment assertions at 320, 360, 390, 768, 1024, 1440 and 1920 pixels; actual production SQL grant/revoke and external projection/access checks. Signing into a genuine external test account in a browser remains a live acceptance gap.

### P0-C — external task status/completion

The proven legacy failure is a mismatch between server-owned `completedAt` and the browser's retained task objects. The whole-workspace RPC compared all non-status fields, then added a completion timestamp without returning the normalized document. A subsequent status-only save using the retained object failed with `P0001: Only assigned task status may change`. A rolled-back production reproduction showed the first completion succeeded and the subsequent stale-metadata save failed. The precise sequence behind the client's reported initial failure was not independently reconstructed; it must not be claimed as a replayed live browser incident.

Two complementary fixes address this boundary:

1. `set_assigned_task_status` accepts only organization, task ID, desired status and expected status. It checks current membership, external role, assignment, project grant and configured status under the workspace row lock; merges one status into the current document; stores completion time/actor and an audit entry; and supports safe retries. Conflicting changes to the same status are rejected while edits to unrelated tasks are preserved.
2. The legacy full-workspace external path ignores client copies of server-owned completion fields when comparing tasks. It still computes completion metadata from the stored task and never accepts arbitrary task edits. Private source-email provenance is stripped from external projections and ignored on legacy saves, preserving old clients without exposing mailbox identifiers.

The external page calls the narrow RPC directly, refreshes persisted state before confirming success, and provides **סמן כבוצע**, a status selector, loading/error/retry feedback, due date, project and completion time. Controls are limited to tasks assigned to the authenticated user. The administrator's task list shows available completion time/actor; the existing filtered refresh/polling path observes the changed workspace version.

Files: `src/components/ExternalTaskPage.tsx`, `src/App.tsx`, `src/lib/backend.ts`, `src/types.ts`, `src/components/TaskBoard.tsx`; migrations `20261020124239_fix_permission_defaults_and_external_completion.sql` and `20261020130104_external_task_projection_compatibility.sql`.

Verification: production database status persistence, actor/time, retry, reopen, other-task denial, invalid status, revoked grant, anonymous denial and legacy compatibility; browser success/error/reload workflows against fixtures; two **genuinely overlapping local PostgreSQL transactions**, with observed lock waits, prove stale admin saves cannot overwrite completion and scoped updates preserve an unrelated admin edit. The live two-browser administrator/contractor login sequence remains unverified.

## 2. Hebrew import workflow

Open **משימות → ייבוא משימות מקובץ**, or **ייבוא → ייבוא משימות**. Import access follows the existing developer-granted import permissions.

The page separates task and contact import, provides Hebrew CSV and Excel downloads, lists required/optional columns, date formats, configured statuses and limits, and explains preview, duplicate suppression, saving and where tasks appear. A sample may include an explicitly selected existing project's **ID**. Its default has no project, so it never silently chooses a customer project.

Required header: `משימה`. Optional: `פרויקט,סטטוס,תאריך התחלה,תאריך סיום,מועד מעקב,הערות,מייל`. English aliases are also listed in the UI. Dates accept `YYYY-MM-DD`, `DD/MM/YYYY`, `DD.MM.YYYY`, or native Excel dates. Blank status uses `טרם התחיל`; nonblank status must already be configured. Project references must match one existing ID/name unambiguously. Files are bounded to 10 MB and 20,000 parsed records. Validation is atomic; errors stop import before commit. Existing tasks retain their identities/history/status on repeat import.

Static synthetic sample: https://rameng-crm.rameng-crm-worker.workers.dev/samples/rameng-task-import-he.csv . The project-specific CSV/Excel buttons generate downloads inside the application. Browser and regression tests round-trip these exact generated files, including Hebrew, BOM/no BOM, quoted commas, dates, reload and duplicate reimport. Existing tests also cover English aliases, conflicting aliases, repeated title rows, empty rows, multiple sheets, invalid dates, unknown/ambiguous projects and file limits.

Manual repeat: choose a project for the sample, download CSV, replace the example task text, save UTF-8, upload, inspect project/status/date in preview, import, wait for saved state, refresh and find the task. Upload the same file again: preview must show zero new tasks and one skipped duplicate. Change its project to an unknown name or its date/status to an invalid value: no task should be imported.

## 3. Remaining-feature matrix

| Requested area | Implemented / preserved | Verification | Remaining status / decision |
|---|---|---|---|
| 3.1 Organization email history | New persistent mailbox approvals, threads/messages, Gmail IDs, sender/to/cc, dates, plain authorized bodies, attachment metadata, project/contact/multiple-task associations, deduplication, history cursor, sync status/retry and audit. New Worker route and permission-controlled journal UI. Private data is never bulk-copied. | Production RLS/RPC tests with rolled-back synthetic data; mocked provider normalization/consent tests; browser inactive-state/RTL checks. | **Partially implemented / requires client consent**: zero mailboxes approved. Only explicitly selected thread refresh is implemented; no mailbox-wide historical ingestion, automatic history polling or binary attachment archive. Live approved-mailbox ingestion is unverified. |
| 3.2 Email-to-task | Manual review form with editable title/body, project, internal owner and due date; persisted message/thread/mailbox provenance; duplicate suppression across reload; existing reply/task association; local keyword suggestions requiring manual approval. | Browser review/save/reload/duplicate test, existing mail association tests. | **Implemented subset / live provider unverified**. Keyword suggestions are not AI classification. No paid/unapproved AI provider was activated. Private legacy associations retain one primary task; the organizational journal supports multiple tasks. |
| 3.3 Gmail | Existing send/reply/drafts/sent association/attachments/privacy/token refresh paths preserved. | Existing mocked provider regressions; source review. | **Live controlled-mailbox verification remains open**. No real client message, invitation or password email was sent. |
| 3.4 Drive | Existing folder selection/create/upload/download/rename/replacement/sharing/revocation/project folders/retries and protected ancestry preserved. | Existing mocked regression coverage. | **Implemented / live round trips unverified**. No OAuth scope or real sharing permission was changed. |
| 3.5 Calendar | New local editing and owned single timed Google event editing/deletion; scoped target-organization checks; provider ownership/org marker and ETag conflict protection; deterministic duplicate-safe create IDs; exact private CRM-event associations; pagination; cache invalidation. Task reminder creation/retry is explicit and avoids duplicate local records. | Browser create/edit/delete fixture; mocked ETag/ownership/organization/idempotency/pagination tests; existing Jerusalem/DST/source-filter tests. | **Partially verified**: live provider writes unverified; recurring/all-day events use the existing Google link. No background/bulk task calendar synchronization. |
| 3.6 Reports/PDF | Existing selected-task/profession/responsible/due/status/notes/photos/carry-forward/source workflow preserved. Added reusable structural templates without copying findings, Israeli Sunday–Saturday reporting periods, immutable server-captured report history and read-only version preview. Fixed print-page background. | Production immutable-history authorization/preservation tests; browser template/history tests; real 90-row Hebrew Chromium A4 PDF, 11 pages, all pages text-bearing, repeated headings, first/last render inspected. | **Implemented review-history subset**. Client approval is still needed for the formal template/issuance procedure. Snapshot history is not legal issuance. Native save dialogs, signed-photo pagination and exhaustive native desktop PDF behavior remain unverified. No report was emailed automatically. |
| 3.7 Contacts | Existing cards, search, editing, communication, categories and multiple project links preserved. | 62-contact paging/search/open-card browser workflow and existing contact/project preservation regressions. | **Existing implemented behavior preserved**; no unnecessary redesign. Exhaustive live contact/provider round trips not claimed. |
| 3.8 Authentication lifecycle | Existing login/invitation/reset/role/deactivation architecture preserved; no credential changes. | Seven-width login/reset UI fixtures and database role/revocation/isolation tests. | **Not live verified**: invitation/password/reset/expiry/relogin need designated controlled accounts/mailboxes. Fixture reset success is not proof of a real reset. |
| 3.9 Security/database | Four non-destructive migrations; consistent effective permissions; scoped external operation; new RLS tables and service-only ingestion; immutable report snapshots; private source-mail projection. | Existing SQL suite plus new 32 assertions / 20 expected denials locally; production synthetic checks; fresh Advisor inspection. | Advisor: **0 errors, 17 signed-in SECURITY DEFINER warnings, 7 informational private-backup no-policy notices**. Authenticated RPCs intentionally retain checked entrypoints; private backups intentionally deny client access. No authorization was removed to silence warnings. |
| 3.10 Backup/recovery | Private pre-change SQL snapshots, restricted CSV outside repo, verified DPAPI encrypted copy; reproducible isolated restore/rollback-definition drill. | Five application records restored with exact JSONB equality; authenticated save passed; four saved production definitions compiled. | **Partial recovery only**. Real Auth credentials/sessions, original organization metadata, notifications and Storage are excluded from this drill. Dashboard confirms Free Plan lacks scheduled backups and PITR is not enabled. The RAM CONFIG namespace was also captured as 315 encrypted values, with zero missing keys and verified decryption/logical restoration; full disaster recovery/RPO/RTO is not certified. No production restore or subscription change. |
| 3.11 Performance/concurrency | Existing JSONB version locking/deep-tree/import bounds preserved; task-local merging; actual overlapping SQL transactions; bounded journal/history lists; report snapshots load bodies only when selected. | Two local concurrent transactions with observed row-lock waits; stale-save browser fixture; existing 500-task/10,000-depth tests. | **Tested subset verified**. No broad production load test or complete offline conflict merge is claimed. |
| 3.12 UI/RTL/accessibility | Permission switches/modal errors, project rows, external completion feedback, import instructions, journal/review and report controls. | Seven required widths; native labels/focus/keyboard paths; no document overflow in tested screens; screenshots. | **Changed paths verified**, not a whole-product screen-reader/contrast certification. |

## 4. Executed quality gates

- `npm ci`, `npm ci --prefix worker`; TypeScript; Worker/desktop syntax; production build; Worker dry-run; whitespace checks.
- Node regressions: **136 passed, 0 failed**, including mocked Google/Worker scenarios. These are not real Google writes.
- Browser fixture suite: **56/56 locally and 56/56 on the remote static preview**. Browser cross-origin requests are blocked. Production account authentication is not emulated as proof of live login.
- Disposable PostgreSQL: bootstrap, all 12 migrations, existing workflow assertions/expected denials, new **32 passing assertions / 20 expected denials**, optional platform trigger checks, and two overlapping transaction scenarios.
- Production database: original failure reproduction; post-migration synthetic authorization/persistence suite, entirely rolled back. The final release record identifies the exact final rerun totals.
- Frontend/Worker dependency audits: zero vulnerabilities. Desktop development packaging retains eight moderate `sprintf-js` chain advisories; no high/critical finding and no forced breaking downgrade. Large initial-bundle warning remains.
- Real PDF renderer: 90 synthetic rows, 11 A4 pages, Hebrew glyphs and repeated table headings; no empty pages; item 90 survives. This does not certify a user's native save dialog.

## 5. Database release and rollback

Applied to RAM only: `20261020124239_fix_permission_defaults_and_external_completion.sql`, `20261020125438_approved_communication_journal.sql`, `20261020130104_external_task_projection_compatibility.sql`, `20261020130219_immutable_report_snapshots.sql`.

Private snapshots: `rameng_private.final_qa_20261020_snapshot` and `rameng_private.final_qa_20261020_extended_snapshot`; each has nine rows (four function definitions plus one workspace, three memberships and one project grant), RLS enabled, and client/service table privileges revoked. The extended migration transaction asserted workspace JSON/version equality against its fresh snapshot. No existing customer document was rewritten. New journal/history tables remained empty and no mailbox was enabled.

The exported snapshot is outside Git under the current user's restricted backup directory. Its SHA-256 is `4EBA5035636861659A4DFE9F37B1582E10030963CA8702B782D8A20A0057B0F0`; a DPAPI CurrentUser encrypted copy decrypts identically. DPAPI on this machine is not an independent disaster-recovery key escrow. The operator-only restore helper accepts a local private export and initializes a new local database; it has no remote database input.

Pre-release Worker rollback version: `3c4d97d5-4ee7-452d-a68a-44cde00e937e`. The current Wrangler rollback help was inspected; always select the pinned production config and profile `rameng`. The previous application remains compatible with the new additive tables and legacy save compatibility. An application rollback does not undo SQL. If SQL rollback becomes necessary, use the saved exact function definitions/owners/grants after isolated verification; do not replay customer data or rerun `setup.sql` over production. Retain new history tables instead of dropping captured records.

Operator consent setup: obtain the client's exact approved business mailbox and written consent reference, verify its authenticated owner and Google account match, then a target-organization developer may call `approve_communication_mailbox`. No production approval call was made in this task. `allow_sync=false` stops future ingestion while preserving already authorized history. A mailbox-wide ingestion policy would require a separate client decision and implementation.

Google API references checked during implementation: [event patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch), [event deletion](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete), [creating events](https://developers.google.com/workspace/calendar/api/guides/create-events). Mutations preserve attendees/recurrence and send no attendee field; provider update calls specify `sendUpdates=none`. No provider write was performed during automated tests.


### CONFIG KV recovery evidence

A read-only capture of the pinned RAM namespace exported **315/315 keys**, with zero unavailable values. Values were encrypted directly with Windows DPAPI outside Git; no credential or private-mail payload was logged. The encrypted archive was decrypted and parsed, its configuration was verified to reference `qvunspguudkhwgbjvvuf`, and all captured values survived logical restoration. Plaintext archive SHA-256: `4ae4a6b579833d43ef725b0afb54ca605b3a818133ec3ee0f6c29250ddad9051`.

This is a sequential logical capture, **not an atomic Cloudflare snapshot** or a live-provider restore drill. It covers credentials/configuration already stored in KV, not write-only Worker secret values. Production KV was not modified. Independent key escrow, secret-vault recovery, real Auth and Storage backups, isolated provider restores, retention and RPO/RTO still require an approved operational recovery plan. Free-plan backup limitations were verified in the RAM dashboard; no paid backup product was activated.
