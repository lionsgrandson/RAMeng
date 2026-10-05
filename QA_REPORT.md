# QA and simplicity audit — 4 October 2026

## Scope and method

Reviewed the React application, shared controls, permissions, persistence, imports,
and Worker API. Tested the real UI using `npm run qa`, a separate Vite config with
synthetic data and local-only backend/integration fixtures. Production builds use
`vite.config.ts` and do not include the QA fixtures or any authentication bypass.

Browser checks used desktop (1440 × 900), phone (390 × 844), small-phone (320px),
and tablet (768px) viewports. No customer
records, permissions, credentials, emails, or Google resources were changed for QA.

## Findings fixed

- Failed saves had no retry; failed/conflicting saves also lost their unload warning.
  Added an actionable recovery banner, dirty-state unload protection, and a logout
  guard. Conflict reload explicitly warns before discarding unsaved changes.
- Browser cache failures could stop a server save. Caching is now best effort.
- Plain-object Supabase errors lost their useful message. Authentication and
  permission errors now retain their Hebrew translations; sign-out errors surface.
- An authentication request rejection could leave the loading screen indefinitely.
  It now returns to login.
- Status-only users could not complete tasks or change report item status because
  the UI also modified timestamps. These actions now change only permitted fields.
- Worker endpoints could honor stale write grants for a hidden area. They now
  reject actions when the area's view permission is false.
- Calendar forms accepted reversed end times and repeated submissions while waiting
  for Google. Added validation, busy state, and an API-side date-order check.
- Email send accessed React's event `currentTarget` after awaiting the request.
  The form is captured before awaiting, so successful sends reset cleanly.
- Report photo uploads failed silently and appended against a stale photo list.
  Added error/busy feedback, append against current state, and same-file retry.
- Report photos stored expiring signed URLs without retaining their storage path.
  New photos retain the path; old signed URLs can recover it for refreshed links.
- Task import incorrectly used due dates as follow-up dates. They are now separate.
- Hebrew CSV without a BOM failed to decode. CSV now uses UTF-8; Excel date cells
  and Israeli date strings normalize to valid inputs. Invalid dates reject import.
- Unfinished AI/transcription navigation entries led to placeholder pages. Hidden
  those entries and routes. Restricted dashboard users no longer see project links
  they cannot open; read-only empty states no longer instruct users to create data.
- Address suggestions lacked keyboard selection and could retain stale responses.
  Added combobox semantics, arrow/Enter/Escape behavior, and request invalidation.
- Mobile navigation and modal focus behavior needed improvement. Added drawer
  Escape/focus handling; modal focus no longer includes hidden inputs.
- Several table/report controls had no accessible name. Added descriptive labels.
  Report creation also defaults to the signed-in person's name when available.
- Spreadsheet parsing shipped in the initial bundle. It now loads only on import;
  framework/backend vendor chunks keep build outputs below Vite's warning threshold.

## Verification

- `npm test`: 15 passing regression tests covering imports/date validation, granular
  permissions, nested deletion, cache failures, translated auth/sign-out errors,
  public-config secrecy, unauthenticated API access, metadata privilege escalation,
  read-only/hidden-area API restrictions, and calendar validation.
- `npm run build` and `npm run lint`: passing.
- `git diff --check`: passing.
- Frontend and Worker `npm audit --omit=dev`: zero reported vulnerabilities.
- Cloudflare Worker dry-run: passing with the existing KV and asset bindings.
- The actual production build loaded its login and reset screens without console
  errors in a local preview; QA fixture markers were absent from built assets.
- Browser: created client, linked project, task, report, and calendar event; confirmed
  client/event persistence across reload; keyboard address selection and global
  search; project/client links and task routes; status-only task completion and
  report status; read-only controls; restricted project deep links; save failure,
  retry, and logout guard; mocked email send/reset; failed photo upload; Hebrew CSV
  import with distinct due/follow-up dates; mobile menu Escape/focus restoration.
- Phone-width overflow checks passed on clients, projects, tasks, calendar, files,
  reports, financial reports, users, imports, and settings. Wide task tables scroll
  within their own container.
- Additional dashboard/task/calendar/settings checks passed at 320px, 768px,
  and 1440px without page overflow or console errors.

## Limits

The authenticated production Chrome connection timed out. The separate browser
could verify the live login screen but did not have a production login. The
Supabase connector returned no connected projects. Live authenticated saving,
multi-user realtime/concurrency, production RLS, invitations, Google OAuth, and
real Google/storage round trips remain unverified; integration tests used fixtures
or mocked HTTP requests. No database migration is needed for these code changes.

## Repeating the checks

Run `npm test`, `npm run build`, and `npm run qa`. The local QA server is bound to
`127.0.0.1:4175`. It persists disposable records under `rameng-qa-*` keys. Supported
query flags: `qaRole=viewer`, `qaRole=status`, `qaRole=restricted`, `qaSave=error`
(first save fails, retry succeeds), `qaSave=conflict`, and `qaUpload=error`.

## Publication

- Code commit pushed to `main`: `42929cc522a4379b16dcca142924687465dee767`.
- Published to <https://rameng-crm.rameng-crm-worker.workers.dev> on 4 October 2026.
- Cloudflare version: `3db81f6b-d67a-4d71-8a03-6acf2eee1bca`.
- The live HTML and all five JavaScript/CSS assets matched local build SHA-256
  hashes. Public configuration remained configured without private credential
  fields; unauthenticated admin/Google-config/integration-status requests returned
  HTTP 401. The live login screen rendered successfully in the browser.


## Follow-up — 5 October 2026

Added explicit Hebrew save controls in the shared header and project/report editors.
Save flushes the existing queue immediately; success follows the server response.
Autosave remains enabled. Deletions flush immediately and retain error/conflict
recovery. Project/client/report/task confirmations use the CRM modal.

Added project, whole-report, client, CRM file, CRM calendar-event and client
financial-record deletion controls. Project deletion preserves dependent business
records without their project relationship. Client deletion preserves projects and
financial documents, and explicitly confirms removal of internal client notes.
File removal removes the CRM listing and retains the underlying storage object.
Existing task deletion includes descendants. All changes still go through the
existing frontend validator and database save RPC.

Personal Gmail task links now live in authenticated-user-scoped Worker KV rather
than shared tasks. Google thread ownership is checked before linking. Gmail links
and Drive folder links can be removed without deleting external Google resources.
Private API responses use Cache-Control: no-store. Mail switching clears old
messages and ignores stale fetch results; recipient details are shown.

Google calendar imports stay in the current user's component state instead of
being uploaded as shared workspace data. CRM-created calendar records remain
shared; personal Google identifiers/links are kept out of shared records.

The production migration `20261005074201_isolate_personal_google_data.sql` was
validated with a rollback, then applied through Udi's signed-in Supabase editor.
It preserved the original workspace in a private, non-API schema with RLS and
revoked access. Verification: 3 projects and 2 reports preserved; all 250 old Google
calendar copies retained in the private backup; 0 personal copies in the shared
calendar; authenticated users lack schema access. A write trigger prevents old
clients or direct writes from reintroducing shared Gmail/Google references.

Drive can now link an existing folder URL/ID, validates that it is an accessible
folder, and saves the relationship separately for each authenticated user. Opening
a project retrieves its saved relationship. Refresh does not create a replacement
for a missing linked folder. Existing create-folder behavior is retained.

Workspace reads use the permission-filtered RPC, including realtime refreshes.
A five-second refresh and focus/visibility/online recovery also update users whose
RLS prevents receiving the raw workspace realtime row. Unsaved concurrent edits
still trigger conflict recovery instead of overwriting another person's changes.

Verification before publication:
- 20 regression tests pass, including dependency preservation, owner-scoped mail
  links, read-only rejection, and linking Drive without creating a folder.
- Type checking, production build and git diff whitespace checks pass.
- Udi's Chrome profile used for the signed-in app and Supabase checks.
- Local UI: explicit project save, reload persistence, project/report/task deletion,
  report deletion persistence, and deletion propagation between two open tabs.
- Read-only UI has no save/delete/project-edit controls. Production save RPC
  rejects an actual membership temporarily set to read-only inside a transaction;
  the transaction was rolled back, restoring the membership. Production currently
  has two admins and one developer; no permanent read-only account was created.
- 390px project controls and deletion modal have no document overflow. Browser
  viewport was restored afterward.

Limits: these changes address the follow-up save/delete/privacy/sync requests and
existing Drive-folder linking. The complete pasted pilot checklist has not been
re-audited end-to-end in this follow-up. No test emails/invitations were sent, no
passwords were changed, and no customer records or Google resources were deleted.
Legacy Gmail links have no reliable owner; users should find/relink their threads
from their own Google account rather than assigning those links to another person.

Publication verification:
- Code commit `de9b23430239262355f789d68440894cb6a020b4` pushed to main.
- Cloudflare production deployment succeeded, version
  `8cc46f72-fe5d-47be-8352-139b97e1b1b2`.
- Live HTML and all four referenced JS/CSS assets match the local production build.
  Private Gmail/Drive/status endpoints reject unauthenticated requests with 401;
  public configuration does not expose private credentials.
- Udi's live session displays project Save/Delete and report Delete controls.
  The unchanged project editor Save action displays `נשמר`. His Google calendar
  sync loads personal events successfully. Browser warnings observed belong to
  the installed wallet extension, with no CRM application errors observed.

## Client email and project Drive follow-up — 5 October 2026

Client cards now automatically load recent Gmail conversations matching the client
email address and support refresh, pagination, reading a full thread, composing,
and replying. Project mail loads conversations for every associated client, even
when the project has no tasks; existing personal task-thread associations remain
available. These views only query the current authenticated user's Google account
and keep mail contents in component state, outside the shared CRM workspace.

The reusable composer accepts local attachments and CRM files, with remove controls
and a limit of ten attachments / 18 MB combined. The Worker builds multipart MIME,
supports Hebrew filenames, rejects malformed headers/attachments, validates reply
threads against the caller's mailbox, and emits In-Reply-To / References headers.
Sending success is kept separate from a failed refresh so users are not encouraged
to send a duplicate message.

Client timelines and project calendars load Google events whose attendees,
organizer or creator match an associated client email. All visible Google calendars
are scanned with pagination, duplicate meetings are collapsed, and the date range
can be changed (default: one year back and one year ahead). Results remain private.

The prominent project Drive toolbar now offers an existing-folder popup, new-folder
creation and settings. Google Picker grants per-file/folder access under the existing
drive.file scope; a pasted URL previously could not grant that access. Picker API
was enabled in RAM's Google Cloud project after the user's confirmation. Its new
API key is restricted to Google Picker API and the production CRM website; stored
only in Worker configuration, with temporary transfer files removed. The chooser
also lists already authorized folders and supports searching/pagination. Shared
drives are supported; folders with no upload permission are rejected clearly.

Personal Drive settings control automatic project-file and report uploads. The
background sync waits for CRM saving and updates the chosen project folder; retry
controls and manual sync are available. Exports use stable CRM record identifiers
and a content fingerprint to update the existing Drive file rather than create a
new version as another file. A missing/moved export is checked before skipping it.
Drive upload failures do not remove the CRM's stored source.

Reports are self-contained HTML exports with escaped text and embedded photos,
readable in a browser and printable to PDF. They update after report edits. This
iteration does not generate a PDF automatically. Google originals are preserved
when CRM listings or folder associations are removed. Settings/associations/export
tracking remain per authenticated user, not shared workspace fields.

Verification before deployment:
- 30 regression tests pass; type checking, production build and whitespace checks
  pass. Tests cover binary attachment MIME, Hebrew filenames, injection rejection,
  reply headers, private Gmail pagination, multi-calendar matching/deduplication,
  owner-scoped Drive destinations, stable update behavior and read-only rejection.
- Disposable local UI: client mail/thread loading, attaching a stored CRM file,
  mock sending, client Google timeline, project folder popup, settings saving and
  automatic file/report exports verified. No real client email was sent.
- 390px project mail view has no horizontal overflow; emulation restored.
- Native file-picker automation is limited by the Chrome extension's file URL
  permission. Stored-file attachment UI and binary upload behavior are verified;
  no browser extension permissions were changed.

Live production verification (2026-10-05):
- Udi's Chrome profile loaded two client Gmail conversations and the full
  five-message thread; matching client calendar events loaded successfully.
- Project mail is available with zero tasks and queries its linked client emails.
- Google Picker opened successfully and displayed Udi's existing Drive folders.
  No production folder was chosen or granted as part of QA.
- Production HTML and referenced assets matched the build; private APIs reject
  anonymous access with 401. No actual client email was sent.
- Final regression total: 31 passing, including attachment-only email reading:
  binary payloads are not rendered as message text.

## Rich email, signatures and existing Drive contents (2026-10-05)

Received emails preserve sanitized HTML paragraphs, tables, emphasis and links.
Named Gmail/Outlook quote blocks and plain-text reply markers are collapsed behind
an expandable history control. Escaped snippet entities are decoded, header names
are cleaned and recipient lists are expandable. Remote/inline images are shown
only on request; CID images load from the authenticated mailbox with size limits
and executable formats excluded. Message contents remain outside shared CRM data.

Profile settings include an owner-scoped rich signature stored in Worker KV.
Composers insert the personal signature and support bold/italic/underline,
font/size/color, alignment, lists, links, image uploads and direct image pasting,
undo/redo and clearing formatting. Rich messages include a plain-text fallback;
pasted images become MIME CID parts, with standard file attachments retained.
HTML is sanitized both in the reader and outgoing server payload. Editing libraries
load on demand. Images are limited to 2 MB each; message attachments/inline images
remain limited to 18 MB combined. Signatures have a 3 MB encoded storage limit.

Drive listings now include pagination and navigation through existing subfolders.
An explicit Google reconnection adds only drive.metadata.readonly, allowing names,
metadata and links for existing contents without new write or content-download
permission. Existing folder connections default to read-only; other project folders
can opt into uploads from settings. The user's connected נכסים folder is protected
in production KV and the upload endpoint, including manual upload attempts. Its
Google files/folders were not edited or deleted during this request. A direct,
read-only Drive browser inspection confirmed six existing subfolders and nine files.

Verification:
- 36 regression tests, type checking, production build and whitespace checks pass.
- Disposable UI: signature formatting/link saving, signature insertion, pasting a
  real clipboard PNG, sending with that image and a CRM attachment, sanitized HTML
  display with collapsed quote history, and Drive subfolder/back navigation pass.
- 390 px rich mail view: document/content width both 390; editor 344 px; emulation
  cleared. No real email sent and no invented signature saved to Udi's account.
- Live profile editor and read-only folder protection visible in Udi's profile.
- Google identity verification / added metadata permission is pending user action;
  complete existing-content listing must be verified after consent completes.
- Deployment uses the existing Worker setup. An unintended root Wrangler setup
  was stopped; generated root configuration/plugin changes were removed before
  the successful deployment.

Final live email check: the reported two-message conversation now renders HTML
with line breaks/paragraphs and separate sender/date/expandable recipients. Quoted
history is collapsed, escaped entities are absent, and the rich reply editor loads
without alerts. A production-only editor lifecycle error observed while switching
views was fixed by stable extension instances and guarding destroyed editor access;
the profile-to-mail transition was retested. Final deployed Worker version:
d61302eb-1d86-4d9a-94b9-e786d6d43f19. Production HTML, four referenced assets and the
lazy editor asset match the local build; new private endpoints return 401 anonymously.
