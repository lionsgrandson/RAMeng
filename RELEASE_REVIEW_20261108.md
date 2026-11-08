# RAMENG CRM implementation and release review - 8 November 2026

This release closes gaps found while reconciling the supplied full implementation request with the existing application. Existing business records, permissions, Google connections and reporting infrastructure are reused. Production verification details are appended after release.

## Changes delivered

| Module | New work in this release | Existing implementation reused |
| --- | --- | --- |
| Authentication | Accessible hidden-by-default password toggle; mouse, keyboard and touch coverage; reset navigation returns to hidden mode. | Supabase login, invitation and reset flows. |
| Email | Explicit read/unread actions with Gmail labels and counter/cache updates; unread action returns to list; incoming attachment metadata/downloads and CC; customer thread viewer now requires an explicit reply action; email-task review offers priority, project-specific professions and sender attribution. | Current full-thread fetch, sanitized mixed-language HTML, isolated scrolling, expand/collapse, mailbox isolation, task provenance/association, drafts and send/reply. |
| Tasks | Drag handles/drop indication in table headers; RTL-aware keyboard movement, touch arrow alternatives, personal order/visibility/reset persisted per signed-in account in this browser; external/internal assignee filter; new external assignee entry alongside existing contacts. | Category IDs/rename/in-use deletion protection; combined project/status/owner/profession/deadline filters; scoped invitation/project grants; status CAS RPC, actor/time audit, comments and notifications. |
| Files and plans | Sequential multi-upload, completed-file progress and per-file success/errors; size/extension checks; revision identifier, notes, updated-by display and prior metadata snapshots; Jerusalem calendar-day timestamps. | Private 50 MB Storage bucket and RLS; signed PDF view/download, desktop Foxit bridge, replacement-file history, project/task/profession links. |
| Project folders | Nested Drive-folder creation, subfolder rename and moves within a project's connected folder. Backend validates organization, permissions, source/destination ancestry, protected folders, target MIME and cycles; root folder cannot be moved. | Existing connected Drive folders, profession folders, direct upload, external reader/commenter sharing and managed revocation. |
| Contacts/projects | Existing project/contact associations and client-name search retained; no duplicate replacement records created. | Searchable contact table, project associations, partial case-insensitive project/client search and client selector. |
| Meetings/reports | Reusable drag/keyboard column controls now also power report and meeting configuration. | Selected/filtered task drafts, notes/conclusions, photos/captions, selected column order in output, reusable configurations/templates, project defaults, immutable report history and Hebrew browser PDF output. |
| Security/dependencies | New attachment endpoint obtains MIME part IDs and binary data from the caller's Google mailbox, rather than accepting a browser-provided attachment ID. New folder endpoints reject cross-project/external/protected/cyclic writes. sanitize-html updated 2.18.0 -> 2.18.1, removing the vulnerable deepmerge dependency. | Existing authenticated Worker authorization, private Google tokens, RLS/RPC/Storage rules and optimistic workspace saves. |

The existing `categories` / `categoryIds` model explicitly represents project professions (architecture, electricity, structure etc.) throughout tasks, projects, mail and files. This release keeps those IDs and the shared selector. Legacy custom profession values remain preserved until explicit replacement. A second independent category taxonomy was not invented.

## Calendar investigation

In Udi's authenticated r-eng.co.il Chrome profile, the Deborah project currently contains **רביבים חשבון חלקי 1**, with start/end day **2026-10-13**. Its project calendar visibly renders **13.10.2026, 09:00**, combining the start/end references. The older exact title **חשבון קבלן 1** is absent from the displayed current project tasks. No business task was renamed, rescheduled or duplicated. Existing date-only calendar derivation and Jerusalem/DST regressions pass. CRM task dates do not implicitly create Google events; the explicit create flow retains duplicate-safe provider IDs.

## Verification

- TypeScript (`npm run lint`) and production build pass; existing bundle-size advisory remains.
- **151/151** Node regression tests pass, including provider mocks for Gmail labels/attachments, Drive ancestry/moves/cycles, calendars, authentication and permissions.
- **70/70** isolated Chromium scenarios pass. Coverage includes 320/360/390/768/1024/1440/1920 pixel layouts, mouse/keyboard/touch password controls, task/report drag/keyboard order and persistence, external assignment and completion/comments, email-to-task, read/unread persistence/failure, incoming attachment download, multiple uploads/partial failure/revision history, nested Drive-folder operations, report layouts/photos and project defaults.
- Disposable PostgreSQL applies setup and all **12 existing migrations**; workflow suites, platform RLS checks, **32 final-QA assertions / 20 expected denials**, concurrent status/save scenarios and updated document-layout tests pass. New plan revision fields persist through the existing authenticated save RPC; viewer writes are denied.
- Hebrew PDF verification: the long report has **11 A4 pages**, repeated table headings and the final 90th row; sampled first/last pages were rendered with Poppler and inspected. Meeting export with captioned proportional image and selected fields was rendered and inspected. Browser Save as PDF remains the existing export mechanism.
- Worker/desktop syntax checks, Worker dry-run and whitespace checks pass.
- Frontend production audit: **zero vulnerabilities**. Worker production audit: **zero vulnerabilities** after the sanitizer patch. Desktop packaging audit: **seven moderate findings**, no high/critical findings. Desktop installation/packaging was not rebuilt.
- Evidence logs, browser screenshots, generated PDFs and JSON results are under ignored `artifacts/audit/`; no customer mailbox contents, credentials or synthetic QA fixtures enter the production bundle.

## Database, persistence and rollback

**No production migration is required or applied.** Optional plan metadata/history uses the existing workspace JSON document and existing file permissions; personal column preferences use the existing per-account browser preference store. Report layout order remains in each document and its reusable template.

Pre-release Git commit: `125393c` (recorded by local rollback tag `rameng-pre-release-20261108`). Pre-release Worker version: `fea1a4fb-c0ae-4c47-8bf1-0bfa9d048252` at 100%. The production workflow uses the existing RAM account and CONFIG binding with `--profile rameng --keep-vars`.

If a release must be rolled back, deploy the recorded prior Worker version using Wrangler rollback with the RAM profile/config. Optional JSON fields remain compatible with the previous app; never restore old workspace data over customer changes to roll back UI code. Personal overrides can be reset through **העמודות שלי -> שחזור תצוגת הארגון**. The pre-existing local `.gitignore` edit and untracked `CHECKLIST_RELEASE_20261012.md` are preserved and excluded from this release.

## Verification boundaries and genuine remaining acceptance

- The connected Supabase MCP account lists a different application and does not expose RAMENG project `qvunspguudkhwgbjvvuf`. No unrelated database was queried or modified. Database tests above use a disposable local PostgreSQL instance; live schema/advisor checks were not repeated through MCP.
- Google provider write lifecycles are verified with mocks, not a new real customer-recipient invitation, notification, external-account completion, folder-share/revoke or Drive move. A designated controlled recipient/mailbox is required to close those end-to-end acceptance cases without sending test messages to customers or changing their folders.
- Udi's production session verified authenticated CRM access, Gmail inbox/thread UI already open, and the real Deborah calendar task. It does not constitute a new password login, expired-link or invitation lifecycle test.
- Browser column preferences persist across reloads/sessions on the same browser/account; they are not synchronized across devices. Existing organization-wide display defaults remain in Settings.
- Upload progress reports completed files, not byte-by-byte network progress. The private Storage backend enforces permissions and its 50 MB cap; extension validation in this release is client-side. Existing download links and permissions remain enforced by Storage.
- Plan metadata history records application edits and attribution. It is not a separately immutable regulatory revision register; existing immutable report snapshots are retained.
- Native Foxit execution depends on an installed supported desktop application/bridge; web browsers retain their download fallback. Native installer and physical mobile-device certification are not claimed.
- Large-bundle optimization and the moderate desktop packaging findings remain. No critical test failure is knowingly released.

## Production release evidence

Pending deployment; replace this paragraph with observed source SHA, main push, CI, Worker version and live checks after release.
