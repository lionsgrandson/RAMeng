# Udi corrections — 2 November 2026

Scope: the correction checklist resent by Udi and supplied by Moshe on 2 November. AI, transcription and email summarization are explicitly excluded. The May proposal and forwarded August/October specification were reviewed for context; no signed replacement contract was located. This release makes no commercial commitments.

## New corrections

- Reports and meeting summaries now offer **עמודות להפקה — בחירה וסדר** before export. Visibility and order persist with each document; hiding fields preserves their content. Report table, cards, photo layout and CSV, and meeting PDF output use the selected order. At least one field remains visible. Legacy documents retain their default layout without a write on opening.
- Reusable report templates retain their column configuration without copying findings or customer photos.
- Meeting summaries accept JPG/PNG/WebP/GIF photos up to 10 MB, captions and permission-gated removal. Uploads use existing private Storage permissions. Export refreshes private image links and waits for images/fonts, reporting preparation failures. It does not invoke transcription or AI.
- New and existing projects can define required report types, a preferred report template/format, meeting notes and default summary columns. New reports, including selected-task reports, inherit the project default unless another template is explicitly selected.
- Report output retains Hebrew RTL, source-task attribution, safe CSV escaping and existing report history. The report action explicitly says **הדפסה / PDF**. Browser PDF creation uses the print dialog's Save as PDF.
- Updated DOMPurify 3.4.16 → 3.4.17 and the Vite lockfile 7.3.6 → 7.3.7 after install audits identified fixed advisories. Frontend production dependency audit reports zero vulnerabilities. No forced major upgrades.

## Checklist reconciliation

| Requested area | Existing behavior retained and checked |
| --- | --- |
| Mail scrolling/read state/task actions/full conversation | Existing independent thread/list scrolling, read filtering/unread styling, profession help, reviewed task creation, linked full-thread opening and replies retained. Regression/provider and browser fixture coverage passes. |
| Categories/assignees/external status/filtering/columns | Existing category management, scoped external invitations/assignment, narrow status RPC and polling, profession/assignee filters and persisted task-column editor retained. Database isolation, status/concurrency and browser scenarios pass. No real invitation or customer email was sent. |
| Task dates/calendar | Start/due/follow-up entries remain derived from task dates. Udi's authenticated Chrome profile showed the Deborah project's current **רביבים חשבון חלקי 1** task on **13 October** in its project calendar. The older exact title **חשבון קבלן 1** is absent from the current project list; no task was renamed or rescheduled. This verifies CRM display, not automatic Google Calendar writes. Explicit Google event creation remains available. |
| Files | Existing discipline Drive folders, explicit external sharing, direct uploads, wrapped filenames, plan status/date and replacement versions retained. Provider mocks and browser fixtures pass. Real controlled-recipient sharing/upload/revocation remains a separate acceptance check. |
| Foxit | Existing Windows desktop bridge opens signed PDFs with installed Foxit; browser uses the download fallback. No Windows installation or native Foxit execution was performed in this release. |
| Project contacts/client search | Existing project contact links/table and project search/client filter retained. Browser paging/search/open-card tests pass. |
| Summaries/reports | Selected filtered project tasks, manual meeting notes, report findings/photos/templates/carry-forward/history and browser PDF export retained. Column selection/order, summary photos and project defaults added as above. |

## Verification

- Production TypeScript/build passed; **139/139** Node regressions passed.
- **59/59** real Chromium scenarios passed against isolated synthetic fixtures, including photo upload/failure/reload/PDF, reordered/hidden report fields, project default inheritance and responsive controls. No production business records are used by those tests.
- Disposable PostgreSQL applied all existing migrations and passed workflow, platform, permission, snapshot and concurrent status tests. New `tests/document-layouts.sql` verifies persisted project/report/summary layout metadata and photo captions, column edits without delete permission, and denial of viewer edits/photo removal without delete permission. No migration or remote database write is required for this release.
- Hebrew report/summary PDF pages were rendered with Poppler and inspected. The long-report scenario produces 11 A4 pages with repeated headings. Native print dialogs and exhaustive real signed-photo/desktop/provider lifecycle checks are not claimed.
- Worker syntax, dry run and whitespace checks passed. Existing RAM account/config/profile are retained; deploy uses `--profile rameng --keep-vars`.

## Release

Pre-release production version: `7af08e5c-905d-4295-9519-2c4a8ccc6674`. No schema rollback is needed for these additive optional JSON fields. Existing records and provider connections are preserved. Final deployment identity and smoke evidence are recorded below after deployment.
