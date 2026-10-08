# CRM email and category update

## Behavior

- A Hebrew Inbox lists actual Gmail INBOX messages with sender, recipient, subject, timestamp, preview and provider unread state. Opening a row loads the complete conversation; opening an unread thread removes its Gmail UNREAD label. Pagination loads 20 messages per page.
- Inbox conversations can be assigned to an existing project and optionally one of that project's tasks. Association applies to the Gmail conversation, including future replies. Only references and summary metadata are stored; bodies and attachments remain in Gmail.
- Each project's Mail tab lists explicitly associated incoming and outgoing conversations, including existing legacy task links. It supports composing and replying, arbitrary valid recipient addresses, optional contact suggestions, optional task context, rich text, saved personal drafts and existing attachments.
- Project context is validated against the authenticated, permission-filtered Supabase workspace before sending or assigning. A contact is never required or created automatically. Create permission supports sending and saving its automatic association; edit permission is required to manually assign existing mail. Delete permission controls unlinking. Gmail mail and references remain private to the authenticated mailbox.
- Sending is guarded synchronously before awaiting draft persistence, and project/task controls are disabled while the composer is busy. Provider failures retain the draft and show an error. If Gmail confirms delivery but KV reference storage fails, the UI reports delivery separately and offers association retry without resending.
- Outgoing sanitized HTML has Hebrew RTL / Latin LTR direction, Arial fallback fonts, predictable spacing, CID embedded images and responsive bounded image widths. Images with no explicit width default to 180px; explicitly sized images retain widths up to 600px.

## Storage / migration

The email association itself reuses existing storage. The complete Udi V3 release requires the migration documented in `UDI_V3_IMPLEMENTATION.md`. Existing Supabase `workspace_state`, RLS, permission-filtered read/save RPCs, Gmail OAuth and Cloudflare CONFIG KV remain in use.

New mailbox-private KV keys: `gmail-project-mail:<authenticated-user-id>:<gmail-thread-id>`. Records contain `orgId`, `projectId`, nullable `taskId`, nullable `contactId` (currently null), mailbox address, thread reference, summary headers, timestamps and direction. Existing `gmail-task-links` records and email records are preserved and read for compatibility. Removed projects/tasks are excluded by the UI's existing workspace records; original Gmail messages are not deleted.

Contact category normalization is idempotent and uses the existing authorized workspace save/audit/version pipeline. It runs when a user with contact edit permission opens the workspace, and on subsequent authorized edits/imports. The directory also provides an explicit normalization action. Known plural role aliases (יזמים, יועצים, עורכי דין, קבלנים, אדריכלים, מהנדסים) become singular roles. Matching role values in tags/company type move to the role field when unambiguous; conflicting classifications and unknown tags are retained. Whitespace and duplicate tags are normalized. Original classification values are backed up in `importDetails["סיווג מקורי לפני נרמול"]`; existing backups are never overwritten. Read-only users cannot trigger persisted normalization. Reimport identity compares normalized classifications and ignores only this backup field, avoiding duplicates after normalization.

## Important files

- `src/components/ProjectMail.tsx`: Inbox, history, assignment, task selection, composing/replying and legacy compatibility.
- `src/components/GoogleCommunication.tsx`: composer send guard, busy state, contact suggestions and context-aware sends.
- `src/components/ContactFields.tsx`, `src/lib/contactCategories.ts`, `src/components/ClientCenter.tsx`: classification normalization, predefined suggestions, tag picker and filters.
- `src/App.tsx`, `src/components/ProjectWorkspace.tsx`, `src/lib/api.ts`: navigation, permission gating and API integration.
- `src/lib/imports.ts`: normalized reimport identity.
- `worker/src/index.js`: Inbox and association endpoints, project/task validation and post-delivery persistence.
- `worker/src/mailHtml.js`: outgoing HTML layout.
- `tests/regression.test.mjs`, `tests/fixtures/api.ts`: API regression coverage and isolated browser QA fixtures, excluded from production builds.

## Verification and limitations

Production TypeScript/lint/build checks and Node regressions cover Gmail payloads, attachments, replies, private mailbox data, validation, failed delivery, reference persistence failure, categories, permissions, projects/tasks/contacts and existing integrations. Browser QA uses the repository's isolated fixture configuration to exercise Inbox assignment with and without a task, project history, arbitrary recipient composition, sending state and failure feedback.

Gmail OAuth must already be connected with the existing gmail.modify scope. Unread state is synchronized when opening a thread. Associations are private to each mailbox; they are not a shared company mailbox. Cloudflare KV is eventually consistent, so a newly saved reference may take time to appear from a different location. The sending/assignment view retains the confirmed reference locally. No external provider outage cause was identified or claimed fixed. Received-message layout is verified in generated MIME/HTML tests and the CRM viewer; the approved live Hebrew self-test arrived in Udi’s Gmail with RTL direction and right alignment. External-recipient verification remains as documented in `UDI_V3_IMPLEMENTATION.md`.
