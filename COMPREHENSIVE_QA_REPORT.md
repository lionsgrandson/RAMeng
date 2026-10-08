# RAM Engineering CRM — Udi V3 comprehensive QA and release report

8 October 2026 · branch `main` · baseline `d8d03390778c813b912b1642f1f3fdb433c9bbc0`.

**Outcome: verified fixes are released. The complete CRM remains PARTIAL against the requested definition of done.** Successful tests do not certify omitted password, upload, native printing or broader provider workflows.

Production: https://rameng-crm.rameng-crm-worker.workers.dev

Released application SHA: **`132fa136b7450ecfa0e6d24faf06c59197f8cf6d`**. Cloudflare version **`00a70fac-fb92-40f0-ab8c-f51b36838cab`**, 100% traffic, deployed **2026-10-08T20:07:35.749Z** (23:07 Jerusalem). Includes initial fixes `940739794c939f8f38f90107e2863d27d173234d`, CI merge `7cce30536105c8bf1e8d15c42eca32e5d6c846c6`, calendar follow-up. This report is a subsequent documentation-only commit.

## 1. Coverage matrix

PASS applies only to the executed scope described. Mocked provider results are not live-provider proof.

| Feature | Status | Executed evidence / limits |
| --- | --- | --- |
| Repository, build, automated tests, CI | PASS | Fresh installs, TypeScript, 90 regressions, production build, Worker syntax and disposable SQL workflows; hosted Ubuntu/Node 22 CI successful. |
| Dependency audit / secret isolation | PASS | Root and Worker audits zero vulnerabilities at test time; UUID compatibility smoke. Changed-source credential-pattern and production fixture-identifier scans passed; no whole-history secret audit claimed. |
| Invitation receipt / authenticated external load | PASS | Real invitation received in disposable mailbox; authenticated external session loads actual deployed frontend after hydration fix. |
| New password setup / reset / fresh login | PARTIAL | Expired callback and auth error/sign-out regressions pass. New credentials were not entered/changed; full live password workflow incomplete. |
| External project scope and task lifecycle | PASS | Granted external account saw assigned project/task, updated status visible to Udi, completed/reopened. After revocation actual JWT projection and production UI had zero projects/tasks. |
| Direct API/RPC restrictions | PASS | Actual external JWT: stale task save and role change rejected (400); Gmail/Drive/admin denied (403); no finance or organization email in projection. SQL covers outsiders, NULL ownership, hidden-view write grants and notification RLS. Prohibited fields ignored by a successful response were checked against unchanged canonical data. |
| Task table, search, grouping, empty state | PASS | Local 500-task fixture: 400 active/100 complete; absent optional custom fields; task 499 search; project grouping. Separate explicit zero-task fixture. |
| Project/task/contact deletion | PARTIAL | Pure regressions and rollback SQL preserve dependent records/references, clear external assignee when project removed. No permanent live customer deletion. |
| Assignment mail / browser-free cron | PASS | Live Udi assignment mail; direct Supabase RPC task created without frontend dispatch was sent by scheduled Worker at 19:55:02.937 UTC. Recipient had exactly one matching message after a subsequent scheduled interval. In-app read persisted. Historical pending records excluded from new background eligibility. |
| Notification failure / fairness / concurrency | PASS | Mocked/SQL atomic claims, safe explicit failure, ambiguous 5xx/408/network/interrupted states, database failure, standalone tasks, disconnected/removed sender and rotating cursor. No automatic uncertain retry. Production throughput not load-tested. |
| Gmail read, reply, HTML send, associations, trash | PASS | Synthetic incoming read changed unread 25→24 and persisted. Reply reached recipient; CRM thread showed reply. New Hebrew/English HTML mail reached recipient. Project/category link without task, later task link, unlink and recoverable trash confirmed in Gmail. |
| Gmail attachments, pagination, CID, drafts, OAuth outages | PARTIAL | Mocks verify exact bytes, Hebrew filenames, MIME/reply headers, pagination, draft owner isolation, sanitized HTML/CID and token refresh. Live file selection and deliberate provider outage/expiry not exercised. |
| Project categories | PASS | Synthetic category created/renamed; linked task, incoming mail and Drive child folder; reopening twice did not duplicate folder. Normalization and invalid references covered locally. |
| Drive reader/commenter/revocation | PASS | CRM-uploaded synthetic report opened as reader; actual synthetic comment posted as commenter; both grants revoked and correct recipient denied afterward. Owner-only permissions remained; no public grant. |
| Drive protected/read-only ancestry | PASS | Real provider tree against preview: descendant relink/create/share/category denied 403; upload skipped under read-only protection. Child relink could not bypass read-only root. Markers removed and QA root restored afterward. Mocked unknown/trashed/bounded ancestry also covered. |
| Existing Google documents with drive.file scope | PARTIAL | UI-created synthetic Doc listed but Google denied app-mediated sharing for per-file authorization. Actionable fallback added; no OAuth scope expansion. |
| Drive upload / report update / automatic sync | PARTIAL | Real synthetic CRM report saved/uploaded. Mocks verify exact bytes, unchanged skip, report replacement, daily queue and protected-folder recheck. Local file-picker/photo paths incomplete live. |
| Contacts | PARTIAL | Live synthetic contact created/edited; two project links confirmed without duplicate contact; first-project UI unlink confirmed. Pure import/delete/reference regressions pass. Exhaustive live search/delete matrix omitted. |
| Meeting summaries and canonical refresh | PASS | Live linked-task add/dedup/removal; independent status update then refresh; manual/task notes retained and saved; export only selected task. Deleted task covered by SQL rollback and HTML regression. |
| Meeting PDF template | PASS | Real template through local HTTP: 1-page summary and 29-page, 42-task stress PDF, A4 landscape. All pages rendered/reviewed; text bounds, special characters, manual notes, excluded-task absence verified. |
| Native Save-as-PDF / other platforms | BLOCKED | Live export opened expected printable content. Native dialog save not completed; about:blank print automation denied and not bypassed. Safari/native mobile print not tested. |
| Reports / rich report editing / photos | PARTIAL | Synthetic report created/saved/uploaded; rich email editor exercised. Full report photo/rich-edit/multipage workflow incomplete. Google HTML viewer shows source markup. |
| Calendar | PARTIAL | Local UI reversed-time rejection, valid create, Google filter/link metadata and reload verified. Mocks cover provider matching/pagination/validation. No real Google create/edit/delete lifecycle. |
| Finance | PARTIAL | Local synthetic quotes: 1,500 billed, 750 paid, 750 outstanding; partial filter: one quote, 1,000/250/750. Empty state checked. Full live classification/import/edit workflow not run; no financial transaction. |
| Import/export | PARTIAL | Parser regressions: Hebrew UTF-8 CSV, Excel dates, invalid date rejection, row-three headers, footer exclusion, extra fields and identity dedup. Full UI file round trip incomplete. |
| Responsive / dialog keyboard scope | PASS | Actual CSS widths 320/390/768/1440 for populated/empty tasks, task dialog and live email: no document horizontal overflow. Initial focus/Shift-Tab remained in dialog; close worked. Full screen-reader audit/focus restoration not asserted. |
| Native Android | NOT APPLICABLE | Executed release scope was web CRM, not APK/device certification. |
| Production deployment / original records | PASS | Exact active version/new asset, authenticated role loads, critical authentication checks and no new captured runtime errors. Original contacts/projects/reports/tasks unchanged versus private backup. |

## 2. Confirmed defects fixed

Severity describes pre-fix impact. Reproduction instructions below use synthetic or disposable data only.

| # | Severity | Root cause / reproduction | Files and verification |
| --- | --- | --- | --- |
| 1 | Critical | Call role/permission RPC as authenticated nonmember: nullable membership role let authorization fall through. | Integrity migration: explicit identity/membership guards; SQL rejection and real external role denial. |
| 2 | High | External user edits unassigned task: NULL ownership comparison failed to reject. | Integrity migration: IS DISTINCT FROM ownership; SQL unassigned/unrelated denials. |
| 3 | High | Load external projection with partial settings: website.replace on undefined crashes. | seed/backend hydration; regression and production external load. |
| 4 | High | Grant/revoke collaborator without changing workspace version: clients can retain stale scope. | Integrity migration increments version only on actual grant change; SQL and real revoked scope. |
| 5 | High | Assign task without frontend dispatch: email stays pending. | Background migration/Worker scheduled delivery; real direct-RPC task sent by cron. |
| 6 | High | Concurrent dispatch or ambiguous provider failure permits duplicate/retried mail. | Worker atomic claim, timestamps and failed/uncertain distinction; mocks and later-interval single live message. Universal exactly-once delivery is not claimed. |
| 7 | High | Relink protected folder descendant as writable root, then write deeper child. | Worker live bounded ancestry guard for all write endpoints; real denials and mock edges. |
| 8 | Medium | Hidden area retains custom write grant. | Integrity migration requires view; rollback SQL aligns client/Worker. |
| 9 | Medium | Removed member can still SELECT notifications. | Integrity migration current-membership policy; SQL/revoked projection. |
| 10 | Medium | NULL standalone project mismatch cancels assignment; database read error mistaken for removal. | Worker normalization/error separation; mocks and SQL. |
| 11 | Medium | Old disconnected senders fill oldest queue scan and starve newer eligible messages. | Worker rotating cursor and bounded sender batches; fairness mocks. |
| 12 | Medium | Expired invite callback with existing session exposes password form. | runtime/AuthSetup reject URL error; regression; no password changed. |
| 13 | Medium | Reopen task while completedAt remains: archive classification ignores new status. | TaskBoard status-first completion; regression/live lifecycle. |
| 14 | Medium | Delete contact linked only through contactIds: cleanup depends on unrelated clientIds branch. | records independent association cleanup; regression. |
| 15 | Medium | Delete project but preserve external task assignment: standalone guard rejects save. | records clears external assignment only, preserves task/internal assignment; pure and rollback SQL. |
| 16 | Medium | Summary refresh merges tasks, retaining deleted ones, dirty state and stale save version. | App/WorkspaceSave/MeetingSummaries canonical guarded refresh; live independent update/notes and SQL/HTML. |
| 17 | Medium | Historical/imported task lacks custom object: table dereference crashes. | TaskBoard optional access; regression/500-task fixture. |
| 18 | Medium | Google per-file authorization rejection gives generic folder advice. | Worker appNotAuthorizedToFile feedback; real rejection/mock response. Underlying scope restriction remains. |
| 19 | Medium | Dedup hides Google record without retaining metadata, so Google filter omits meeting; equivalent timezone timestamps duplicate it. | CalendarFiles timestamp merge retains shared identity and transient Google metadata; regression/local create/filter/reload; no shared record mutation. |
| 20 | Low | Summary export omits task description and unbroken text can exceed print width. | MeetingSummaries escaped description/fixed layout/wrapping; HTML regression and all 1/29 PDF pages. |

## 3. All files modified

Relative to repository root. Grouped entries list every file changed from baseline.

| Files | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | Fresh frontend/Worker checks and disposable SQL integration, preserving upstream concurrency/timeout. |
| `package.json`, `package-lock.json` | Audited compatible overrides/lock, UUID support. |
| `worker/package.json`, `worker/package-lock.json` | Audited undici/sharp overrides and lock. |
| `src/App.tsx` | Canonical refresh/version/dirty guards and context. |
| `src/components/WorkspaceSave.tsx` | Expose canonical refresh. |
| `src/components/MeetingSummaries.tsx` | Refresh, task descriptions, escaped printable wrapping. |
| `src/components/TaskBoard.tsx` | Optional fields and completion classification. |
| `src/components/CalendarFiles.tsx` | Shared/personal Google event merge. |
| `src/components/AuthSetup.tsx` | Invalid invitation callback guard. |
| `src/lib/runtime.ts` | Invitation URL error parser. |
| `src/lib/backend.ts` | Safe snapshot hydration. |
| `src/seed.ts` | Partial-workspace/default-settings hydration. |
| `src/lib/records.ts` | Contact links and project deletion preservation. |
| `worker/src/index.js` | Notification claim/background/failure/fairness, Drive ancestry/errors. |
| `supabase/migrations/20261008180123_qa_workflow_integrity.sql` | Incremental RPC/RLS/version/NULL ownership fixes. |
| `supabase/migrations/20261008185646_assignment_background_delivery.sql` | New assignment background eligibility/timestamps; retain ambiguous old sending as uncertain. |
| `tests/regression.test.mjs` | 90 regressions with provider boundaries and failure cases. |
| `tests/project-workflows.sql` | Permission/version/reference/notification and rollback deletion tests. |
| `tests/run-database.mjs` | Unique disposable PostgreSQL runner and guaranteed stop, Windows URL support. |
| `tests/fixtures/backend.ts` | Separate caches and explicit 0–500 tasks. |
| `tests/fixtures/api.ts` | Persist synthetic calendar provider records across reload. |
| `tests/fixtures/runtime.ts` | Fixture export aligned with production invitation parser. |
| `COMPREHENSIVE_QA_REPORT.md` | Final evidence and limitations. |

Ignored `artifacts/comprehensive-qa/` contains synthetic PDFs/HTML, inspection scripts, screenshots and private production migration wrappers. It is not bundled or committed. No credentials are included here.

## 4. Test commands and results

From repository root:

```powershell
npm ci
npm ci --prefix worker
npm audit
npm audit --prefix worker
npm run lint
npm test
node --check worker/src/index.js
npm run build
git diff --check
$env:RAMENG_TEST_PG_RUNTIME='C:\Users\moshe\AppData\Local\Temp\rameng-pg-runner'
node tests/run-database.mjs
```

All final results PASS: fresh installs, zero audit vulnerabilities, TypeScript, **90/90 tests**, Worker syntax, production build, whitespace and PostgreSQL 17 setup/all six migrations/workflow assertions. SQL test transactions are disposable or rolled back, not customer test writes. Large lazy rich-editor chunk and CRLF messages were advisories.

From `worker/`:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .wrangler/qa-dry-run --profile rameng
node node_modules/wrangler/bin/wrangler.js versions upload --keep-vars --preview-alias qa-20261008 --tag 9407397 --message 'Verified Udi CRM fixes commit 9407397' --profile rameng
node node_modules/wrangler/bin/wrangler.js versions deploy 912c816e-663e-4ad3-b227-aea012ec6362@100% --yes --profile rameng
node node_modules/wrangler/bin/wrangler.js versions deploy 00a70fac-fb92-40f0-ab8c-f51b36838cab@100% --yes --profile rameng
node node_modules/wrangler/bin/wrangler.js deployments list --profile rameng
```

Dry run passed with CONFIG/ASSETS. Follow-up was built/uploaded separately with tag `calendar-qa`. Listing confirmed 100% final version. Production variables retained. Old local development DB configuration was not used for production.

Hosted CI for released code: [PASS run 37836485838](https://github.com/lionsgrandson/RAMeng/actions/runs/37836485838); preceding merged CI [PASS run 37835751187](https://github.com/lionsgrandson/RAMeng/actions/runs/37835751187). Ubuntu/Node 22 fresh install, TypeScript, regressions, syntax, build and SQL all passed.

`npm run qa` is a fixture Vite server, not an automated browser test runner. Browser checks used Udi Chrome and recipient profile. Real meeting template HTML served locally and printed through permitted HTTP browser development tooling.

```powershell
& 'C:\Users\moshe\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe' -scale-to 1500 -png artifacts/comprehensive-qa/meeting-stress.pdf artifacts/comprehensive-qa/meeting-stress
& 'C:\Users\moshe\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' artifacts/comprehensive-qa/inspect-pdfs.py
```

PDFs: `meeting-summary.pdf` 1 page, `meeting-stress.pdf` 29 pages. All stress pages rendered, all contact sheets and a full-page detail inspected. Bounds/selected tasks/excluded tasks/manual notes passed. Native save dialog remains unverified.

Caught and corrected before release: TypeScript comparison of Hebrew team role with external (use actual external flag); missing fixture module export; external settings crash; calendar filter defect. Temporary preview module mismatch was cleared by removing interception and loading actual deployed assets. Incorrect endpoint probe paths returned 404; correct `/api/google/...` paths returned 401. Local finance fixture initially used a different origin/unset cache; corrected synthetic fixture produced asserted totals. These setup errors are not product defects. Final tests have no failing case.

## 5. Exact live verification and preservation

- Final public URL **200**, expected asset `index-Bde57qx6.js`; `/api/public-config` **200**; unauthenticated `/api/admin/config`, `/api/google/gmail/inbox`, `/api/google/drive/files` **401**.
- Actual authenticated Udi/external tabs reloaded with no preview interception. QA project loaded; external revoked account counts zero. Captured error logs showed older pre-release/preview errors only, no new error after final reload.
- Correct Supabase `qvunspguudkhwgbjvvuf`; Cloudflare Udi profile `rameng`. Both migrations applied via Udi SQL editor after isolated validation, with private RLS/revoked-access backups of workspace/functions/policy/notifications. Workspace preserved during both applications; historical pending records remain background-ineligible.
- Post-release comparison: **258/258 original contacts, 3/3 projects, 2/2 reports, 3/3 tasks unchanged**. Other original arrays empty. Added QA records explain larger totals.
- Direct-RPC task `qa-background-20261008-2252`, notification `b2917158-d2e9-4a0d-8dc0-43db6582823c`, sent timestamp `2026-10-08T19:55:02.937Z`; exactly one recipient message after another scheduled interval. Separate in-app read timestamp `2026-10-08T19:53:18.22668Z` persisted.
- Synthetic Gmail read/reply/HTML send/link/unlink/trash occurred between authorized test accounts and Udi. No customer mail sent or existing customer document modified.
- Synthetic Drive root `1bNlaDuAzoSq1SJpiMz9-Mn1AfsYuPpFt`; uploaded HTML report `1-2LFO6wWWsjOJubYxyCxXanzyCQ793HP`. Reader/commenter grants removed; no public permission; protection markers removed; QA root restored writable. Correct recipient denied after revocation.
- External test user `7a8b8747-d941-4bad-9118-aaffcbdad83a` has no current project grant. QA project `project-1791485578521-n51vy0`, second contact-link project, contact/tasks/category/report/summary and synthetic provider files retained for audit. One synthetic HTML thread remains recoverably in Udi Gmail Trash. No permanent purge.
- Local fixture storage contains synthetic data only; viewport overrides and fetch interception cleared. QA servers stopped at completion. Local screenshots: `external-revoked.png`, `drive-revoked.png`, `gmail-reply.png` under ignored artifacts.

## 6. Deployment / rollback

First release `912c816e-663e-4ad3-b227-aea012ec6362` at 19:49 UTC; final **`00a70fac-fb92-40f0-ab8c-f51b36838cab`** at 20:07 UTC, 100% production. Intended assets and authenticated loading checked afterward. Prior Worker version `1542bd85-15cb-4b44-ad74-9c04e877701f` remains an application rollback option; database backups are separate, since Worker rollback does not undo SQL. No destructive migration or historical notification replay.

## 7. Outstanding work and known limits

1. **Password workflow:** browser policy requires user entry of new credentials; receipt/session verified, creation/reset/fresh login not completed. No password changed.
2. **File attachments/photos:** Chrome extension lacks file-URL access for chooser automation; no browser permission expanded. Mocked binary handling passes, live selected-file upload incomplete.
3. **Native PDF save:** printable content/template PDFs verified; native save and other platform print flows unverified. Security denial was not bypassed.
4. **Existing Drive file access:** restricted drive.file OAuth denies app sharing of separately UI-created Doc. Actionable direct Drive/CRM-upload fallback added; broader OAuth not granted. [Official Google Drive error guide](https://developers.google.com/workspace/drive/api/guides/handle-errors) explains appNotAuthorizedToFile.
5. **Report preview:** Google HTML viewer displays raw source. Formatted provider preview not implemented; full report photo/rich-edit/multipage path incomplete.
6. **Calendar/finance/import/export breadth:** selected local UI/parser/provider cases pass; full live CRUD/file round trips not performed. No real calendar event/customer finance record changed.
7. **Gmail breadth:** large live threads, attachments/CID and deliberate expiry/outage incomplete. Provider thread exposed a Gmail draft without explicit draft label during testing; draft-versus-sent presentation needs focused follow-up and is not certified.
8. **Load/platform/accessibility:** 500 local tasks/four widths pass; no production saturation, cross-browser/native mobile or full assistive-technology audit. Safe bounded background processing does not imply unlimited throughput or universal exactly-once delivery.
9. **Retained fixtures:** synthetic records remain, with shares/grants revoked. Permanent cleanup should be separately reviewed using QA identifiers.

No unresolved confirmed authorization bypass remains in the exercised scope. Outstanding coverage prevents declaring the entire CRM fully verified.
