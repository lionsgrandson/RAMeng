# Udi V3 — implementation and release verification

Implemented and released on 8 October 2026 after explicit user approval to publish. Existing uncommitted work was preserved and included in this release. Production details and the boundary of live verification are recorded below.

## Delivered behavior

| Area | Behavior |
| --- | --- |
| Gmail | Opening an unread thread removes Gmail's UNREAD label; provider errors remain visible. Inbox badges use the actual Gmail INBOX unread count, independent of pagination. Threads can be moved to recoverable Gmail trash with confirmation. |
| Email tasks | Associate mail with an existing project/task and multiple project disciplines, or create a task using the message title/body. After a new task is saved, use the association button to persist its Gmail link. Mail may also belong to a project/discipline without a task. |
| Hebrew mail | Right alignment is the editor default; outgoing HTML retains RTL/right alignment and explicit formatting. |
| Disciplines | Create, rename and assign disciplines to projects; apply multiple disciplines to tasks/files. References are validated on the server. In-use disciplines cannot be deleted. Project discipline views collect relevant tasks and privately linked mail. |
| External assignees | Invite a participant using the existing authentication flow, grant explicit project access, then assign tasks. The participant sees only permitted projects and tasks assigned to them, and can change only their task status. Other organization resources stay inaccessible. Completion/reopening updates completion metadata on the server. |
| Assignment delivery | Successful assignment saves create an in-app notification and an email outbox record. The assigning user's connected Gmail sends the email. Delivery states distinguish pending, sending, sent, confirmed failure and uncertain delivery; uncertain sends are not automatically retried. External users must accept/sign in through the existing invitation flow. |
| Task organization | Filter by assignee, project and discipline; group by assignee/project; show total/open/in-progress/completed/overdue counts. |
| Meeting summaries | Select the currently filtered project tasks, create a summary or add to an existing one, edit manual meeting notes, and use a project default template. Task fields remain linked to current workspace data while meeting notes are preserved. Hebrew A4 landscape export uses the browser print dialog's Save as PDF. |
| Drive | Reuse the existing project folder integration; create/reopen discipline folders, browse/search the current folder and share folders/files with external email addresses as readers/commenters. Folder ancestry is checked server-side. Revoke only permissions created by the CRM; protected/read-only folders reject writes. |
| Calendar | Global and project calendars derive entries directly from task due dates, without duplicate stored events. Existing Google Calendar event creation remains available separately; task due dates are not automatically written into Google Calendar. |
| Contacts | Many-to-many project contact associations are independent of the project's client associations. Project and contact pages show the same links. |
| Client search | The existing projects client-name search was verified in the local browser. |

## Architecture and migration

The CRM retains its existing Supabase JSON workspace document and optimistic versioned RPC saves. The migration adds reference-validation triggers, restricted external workspace projections/status updates, explicit project grants and assignment notifications. New exposed tables have RLS; authenticated clients cannot directly write project grants or notification delivery states.

Migration: `supabase/migrations/20261008094956_udi_v3_project_workflows.sql`.

The migration passed in a disposable local PostgreSQL 17 database and was then applied to the production project `qvunspguudkhwgbjvvuf` through its SQL Editor after taking protected private backups of workspace state and replaced function definitions. For a fresh installation, apply the existing `supabase/setup.sql` baseline followed by migrations in order. Do not rerun the older baseline over a migrated production database, because it defines older RPCs and role constraints.

## Verification

- `npm test`: 68 passing regression tests, including private Gmail reads, provider failure behavior, unread counts, trash permissions, category associations, protected Drive ancestry/revocation, folder reuse, email delivery states and escaped/live meeting export fields.
- `npm run build`: passed TypeScript compilation and production bundle generation. Vite reports the existing large-bundle advisory.
- `node --check worker/src/index.js` and `git diff --check`: passed.
- `tests/project-workflows.sql`: passed against a fresh isolated database using the baseline plus the actual migration. Checks include cross-organization denial, external scope, direct-write denial, assignment grants, notification deduplication, reference validation, optimistic conflicts, preservation of hidden data/manual notes, completion/reopening and access revocation.
- Browser QA used Udi's connected Chrome profile (Google identity `udi@r-eng.co.il`). Local fixtures verified client search, discipline creation, task filtering/selection, live meeting summary notes, due-date calendar display, mail read count, email categorization/task creation, Drive folder/share UI and external invitation/project access UI.
- A PDF was generated from the meeting export HTML with Chrome and rendered with Poppler for visual inspection: Hebrew, right alignment, landscape table, names, dates and notes were legible and unclipped.

Browser QA calls use `tests/qa.config.mjs` fixtures only. Production builds use the real authenticated backend; fixture calls are not evidence of real Gmail delivery or Google sharing.

## Checks for a later approved release

1. Review/apply the migration and release compatible frontend and Worker versions together.
2. Verify the existing Worker-only `SUPABASE_SECRET_KEY` and Google OAuth configuration; no service secret belongs in the browser. Assignment email requires the assigning user's connected Gmail and communication-send permission.
3. In an approved test project, verify real Gmail read/trash/count/RTL receipt, Google discipline folder creation and external sharing/revocation, invitation acceptance, email receipt and a status update from an external account reaching the internal workspace.
4. Workspace status synchronization uses the existing polling/RPC mechanism (approximately five seconds); notification lists poll separately. Background email delivery outside an active assigning session is not provided by a new scheduler.

Local QA evidence is in `artifacts/udi-v3-qa/`; it contains only synthetic test data.

## Follow-up verification

The request was checked again against both the Hebrew checklist and the full pasted specification. Two additional UI defects were corrected: selected disciplines now travel with outgoing project emails into the persisted Gmail association (and appear in the immediate local history), and Drive share controls follow file-edit permission rather than folder-create permission. The task table's empty-state span was also updated for its added columns.

After these fixes, all 68 regression tests and the production build passed again; the outgoing-email test now verifies that the selected category is persisted. Worker syntax and diff whitespace checks also passed. Production migration and the live checks below subsequently passed. Local fixtures are distinguished from real provider tests; no claim is made that every live account or invitation acceptance has been exercised.

## Approved production release — 8 October 2026

- URL: https://rameng-crm.rameng-crm-worker.workers.dev
- Cloudflare Worker version: `1542bd85-15cb-4b44-ad74-9c04e877701f`. Frontend and Worker deployed together.
- Production Supabase migration applied transactionally; both new tables have RLS. Existing workspace remained at version 85 during migration, with 2 projects, 258 contacts, 1 task and 2 reports preserved. Protected workspace/function backups remain in the private schema; a local backup is ignored under the Worker runtime directory.
- Restored the existing Worker-only Supabase secret and admin setup token. No keys or tokens are committed.
- Udi's real signed-in Chrome profile verified a synthetic project, profession, assigned task, autosave, meeting summary with preserved notes and updated status, and due-date calendar entry.
- A real assignment email arrived in Udi's mailbox; opening it removed its unread state and lowered the CRM unread-message count. Existing task association, creating a task from the received email, and recoverable Gmail trash succeeded.
- A separate Hebrew self-test email sent through the live composer arrived in Gmail with computed `direction: rtl` and `text-align: right`. Its profession association remained selected after delivery.
- Google Drive created the synthetic project folder and profession subfolder; revisiting the project loaded the same folder and subfolder. Sharing controls and provider permissions were inspected, but granting/revoking access for a separate external recipient and external invitation acceptance/status updates were not exercised end-to-end in production. The isolated database permission/status tests and local browser sharing/invitation tests cover their implementation.
- The clearly named `בדיקת שחרור Udi V3 — 08.10.2026` project, its two synthetic tasks, profession, summary and empty Drive folders are retained for review. No client mail was sent or business mail trashed. Evidence: `artifacts/udi-v3-qa/live-meeting-summary.png`.

Remaining verification is external invitation acceptance and a real external recipient's status update, plus a real external Google sharing/revocation round trip. These are verification limits, not silently omitted features. Calendar entries here are the CRM calendar; automatic writing of task due dates to Google Calendar is not provided.
