# RAM Engineering CRM — deployed final QA release

**The verified incremental fixes are deployed. Full verification of every requested CRM/integration workflow is still incomplete.** The exact evidence and remaining scope are distinguished below; fixture/provider mocks are not described as real Google or user-login tests.

## 1. Fixed defects

| Defect | Proven cause and change | Result and production evidence |
|---|---|---|
| Custom permission presets/manual saves | Frontend/Worker inherited `connections.view=true` but SQL denied that default and compared the custom object with raw stored `NULL`. The live RPC raised `P0001` for legitimate admin changes. SQL now compares effective old/new permissions, retains developer-only grants, locks the target, and rejects missing callers. Safe Hebrew errors and usable modal switch targets were added. | Presets, individual/create-only combinations, reset, stored-value reads, developer grant, hidden-area escalation denial, other-user preservation and unauthorized calls pass. Production SQL suite passed after deployment; browser preset/modal/reload flows pass against fixtures. Genuine administrator test-login HTTP error capture was not obtained. |
| Project-access checkbox alignment | Global full-width input styling affected unstructured checkbox labels. Dedicated RTL rows constrain/center the native checkbox beside the clickable wrapping name; focus/loading/saving feedback were added. | Seven-width browser alignment/grant/revoke/reload tests pass. Production SQL verifies access projections and revocation. No live external-account browser login was performed. |
| External completion/status | The server added completion metadata but the client retained an older task object. A later whole-workspace status save was rejected as a non-status edit. A task-specific CAS RPC now validates current membership, assignment, project access and status, preserves unrelated edits, writes actor/time/audit, and supports safe retries. The legacy path ignores client copies of server-owned fields and hides private email provenance. | Production tests confirm completion, reload/read-back, time/actor, retry, reopen, old-client compatibility, forbidden-task/revoked-user denial and isolation. Real overlapping local SQL transactions verify locking and preservation of unrelated edits. Initial completion succeeded in the reproduction; the exact client-reported first-failure sequence and live administrator→contractor→administrator browser sequence remain unverified. |

Files, database definitions, root-cause detail and the complete 3.1–3.12 feature matrix are in [the implementation report](FINAL_QA_IMPLEMENTATION_20261020.md). The four incremental migrations were applied only to RAM project `qvunspguudkhwgbjvvuf`; no existing customer document was rewritten by the migration transaction.

## 2. Import workflow

Open **משימות → ייבוא משימות מקובץ**, or **ייבוא → ייבוא משימות**. The import page now explains the steps in Hebrew, required and optional fields, English aliases, dates, configured statuses, validation, preview, duplicate counts, saving and where imported tasks appear. It includes both CSV and Excel example downloads, with an optional explicit existing project selection. Blank sample project means no project association.

[Download the Hebrew CSV example](https://rameng-crm.rameng-crm-worker.workers.dev/samples/rameng-task-import-he.csv).

Headers: `משימה,פרויקט,סטטוס,תאריך התחלה,תאריך סיום,מועד מעקב,הערות,מייל`. Only `משימה` is mandatory. Use UTF-8; dates may be `2026-10-27`, `27/10/2026`, `27.10.2026`, or an Excel date. Use an existing unique project name/ID; an unknown or ambiguous project fails validation. Blank status defaults to `טרם התחיל`; other values must be configured. Review the preview before confirming. Uploading the same file again must skip identical tasks without altering existing records.

The authenticated production import page displayed the new instructions/downloads, defaulted to no project and showed no alert. Full download→preview→import→reload→duplicate behavior was exercised in isolated browser fixtures, including the exact generated Hebrew CSV/Excel examples.

## 3. Additional delivered scope and remaining matrix

| Feature | Current status |
|---|---|
| Organizational email journal | Persistent, RLS-controlled approved-mailbox/thread/message/association/audit storage and selected-thread share/refresh UI are deployed. Provider IDs, plain authorized bodies, attachment metadata, multiple tasks/contacts, deduplication and retry status are implemented/tested. **Zero real mailboxes are approved and no historical mail was ingested.** Activation needs explicit client mailbox consent. Mailbox-wide history polling and binary attachment archiving are not implemented. |
| Email-to-task | Review/approval form, project/internal owner/date choice, source message/thread/mailbox provenance, duplicate prevention across reload and local keyword suggestions are implemented. Replies can use existing task associations. **No AI provider was activated.** Live controlled-mailbox operation remains unverified; the private legacy association model still has one primary task per conversation, while the new journal supports several. |
| Gmail | Existing send/reply/draft/attachment/account-isolation/token-refresh behavior retained and regression-tested with mocks. **Live controlled-mailbox write/failure lifecycle remains unverified.** |
| Drive | Existing folder/create/upload/download/rename/replacement/sharing/revoke/ancestry/retry paths retained and regression-tested with mocks. **Live controlled-account round trips remain unverified.** No OAuth scope was expanded. |
| Calendar | Explicit create/retry, local editing, owned single timed Google editing/deletion, scoped organization/owner checks, ETag conflicts, duplicate-safe provider IDs, exact private CRM association, pagination and cache invalidation implemented. Browser/provider simulations pass. **Live provider writes remain unverified**; recurring/all-day events retain the Google editor link. No bulk/background task sync was activated. |
| Reports | Structural reusable templates, weekly periods, selected tasks/profession/responsible/status/due/notes/photos/carry-forward/source traces, immutable server-captured history and read-only preview implemented or retained. A real 90-row Hebrew PDF spans 11 A4 pages with repeated headings and preserved last item; rendered first/last pages inspected. **Formal template/issuance approval, native save dialogs, signed-photo pagination and native desktop export remain open.** No report was automatically emailed. |
| Clients/contacts | Existing cards/editing/search/communication/project links/categories preserved. Browser paging/search/card and record-preservation regressions pass. No unrelated redesign. |
| Authentication | Current login/invitation/reset/roles and project revocation/account-deletion guards preserved. Database isolation/revocation and responsive auth fixtures pass. **Actual invitation/password/reset/expired-link/relogin tests remain unverified**, and a dedicated deactivate/reactivate control remains technical work. |
| Security | Production RLS/RPC matrix passes. Fresh Security Advisor: **0 errors, 17 warnings for intentionally authenticated SECURITY DEFINER RPCs, 7 informational no-policy private-backup tables**. Anonymous/client write privileges were not broadened; new ingestion is service-only. |
| Recovery | Restricted private SQL exports/encrypted copies, exact local restoration of five backed-up application records, authenticated save and compilation of four rollback definitions verified. CONFIG KV capture: **315 encrypted values, zero missing**, decryption/config-target/logical restoration verified. **Full Auth/Storage/secret-vault/provider restoration and RPO/RTO are not certified**. KV capture is sequential, not an atomic provider snapshot. Free Plan does not provide scheduled backups; PITR is not enabled. No subscription was changed. |
| Performance/concurrency | Existing optimistic locking, task-tree/import bounds and 500-task coverage retained; two actual overlapping SQL transactions with observed lock waits protect completion and unrelated edits. Report versions fetch large bodies only on selection. No production saturation/load certification. |
| UI/RTL/accessibility | Changed permission/access/import/journal/report paths checked at 320/360/390/768/1024/1440/1920 pixels; keyboard/focus/retry/overflow checks pass. No whole-product assistive-technology certification. |

## 4. QA evidence

- **136/136 Node regression tests** passed locally and in CI. Google/provider tests in this count use mocks.
- **56/56 real Chromium browser scenarios** passed locally, in CI, and against final deployed static preview `7e1a429b-184b-4471-8864-dedd4709a1d4`. Data/backend/provider services are isolated fixtures and external network requests are blocked.
- Disposable PostgreSQL passed bootstrap plus all **12 migrations**, the existing workflow suite, **32 new assertions / 20 expected denials**, optional platform trigger checks and **two overlapping transaction scenarios**.
- **Production, after app deployment:** the full synthetic SQL transaction returned **32 assertions / 20 expected denials** and was rolled back. This exercises actual production function definitions and PostgreSQL authorization using synthetic authenticated database identities; it is not a real Supabase password/token login.
- Post-test production sanity check: **zero retained synthetic accounts, zero approved mailboxes/messages/automatic report versions, three existing memberships**.
- **26/26 non-mutating production HTTP checks** passed: exact built HTML/assets, correct database public configuration, no exposed private credential fields, six unauthenticated API denials, PATCH preflight, synthetic CSV and absence of QA fixture identities in the production entry.
- Authenticated production browser import screen: expected downloads/help present, no default project, no alerts. No client import or other customer edit was performed through that screen.
- TypeScript, production build, Worker/desktop syntax, Worker dry-run and whitespace checks passed. Frontend/Worker audits report zero vulnerabilities. Desktop development packaging retains **eight moderate** findings in one transitive `sprintf-js` advisory chain; no high/critical finding. Large-bundle advisory remains.
- CI initially caught omitted Worker files in the first commit; they were included before merge and both final PR and merged-main CI passed. No partial application release was deployed.

CI: [PR verification](https://github.com/lionsgrandson/RAMeng/actions/runs/39433380301), [merged application verification](https://github.com/lionsgrandson/RAMeng/actions/runs/39434217986).

## 5. Deployment identity

| Item | Verified value |
|---|---|
| Production URL | https://rameng-crm.rameng-crm-worker.workers.dev |
| Application merge / source commit | `5106ef88147ee4e6b8bcc959cd14967bf98accc1` |
| Merged PR | [#23](https://github.com/lionsgrandson/RAMeng/pull/23) |
| Worker / account | `rameng-crm` / `45834d92b0992b24644537fc864542e4` |
| Worker version at 100% | `7af08e5c-905d-4295-9519-2c4a8ccc6674` |
| Deployment UTC timestamp | `2026-10-20T13:52:25.683Z` |
| Jerusalem timestamp | `20 October 2026, 16:52:25` |
| Supabase | `qvunspguudkhwgbjvvuf` |
| Existing CONFIG binding | `7676674ec22a440d8d946a8fe393775b` |
| Rollback Worker version | `3c4d97d5-4ee7-452d-a68a-44cde00e937e` |

Deployment explicitly used the RAM profile/pinned config and `--keep-vars`; existing remote variables, secrets, KV binding and cron were preserved. HTML and every built asset matched production. Documentation-only commits after this source commit do not require another application deployment.

Rollback readiness: current Wrangler rollback syntax verified; previous version identified; additive schema remains compatible with the previous app. Exact saved database definitions compiled in the isolated recovery drill. Application rollback does not undo SQL. Never restore customer snapshots over production to undo a release, and retain captured journal/report history rather than dropping data. No production rollback/restore was executed.

## 6. Genuine remaining dependencies and technical limits

1. **Controlled identities/mailboxes:** a designated administrator/external test login and controlled Google mailbox are needed to close the real two-browser completion, invitation/password lifecycle and Google write/expiry/reconnect acceptance cases. Existing signed-in production access only establishes the limited UI checks listed above.
2. **Privacy/client consent:** identify exact approved business mailbox owners and selected-thread sharing consent before enabling the journal. Broader ingestion requires a separate approved policy; no unrelated personal mailbox was copied to organizational records.
3. **Client reporting decision:** approve the RAM report template and formal issue/version procedure. Current immutable snapshots are review history, not professional sign-off.
4. **Operational/commercial recovery decision:** establish independent key escrow, complete Auth/Storage/secret-vault backups, retention and isolated provider restore drills. Cloudflare write-only secret values are not recoverable from the KV export. Managed scheduled/PITR backups are unavailable on the current plan; any subscription change requires approval.
5. **Technical scope still partial:** dedicated deactivate/reactivate UI, automatic Gmail history polling, binary organizational attachment archive, recurring/all-day editing inside CRM, exhaustive native PDF/photo/storage/provider verification and full load/accessibility certification are not claimed as finished. These are remaining implementation/verification items, not fabricated access failures.

## 7. Next client acceptance

Use [the concise Hebrew checklist](CLIENT_ACCEPTANCE_20261020_HE.md). It focuses on permissions, aligned project grants, external completion, Hebrew import, reviewed email tasks, report versions/weekly periods and controlled calendar operations. Unrelated previously passed navigation/contact/task smoke tests need not be repeated wholesale.

Production UI and database screenshots are retained locally under ignored `artifacts/audit/production-import.png` and `production-sql-acceptance.png`; sanitized HTTP/CI/browser results are under ignored release artifacts. Private SQL/KV backups are outside Git with restricted Windows access and DPAPI encryption; no credential/private-mail payload is committed or included in CI artifacts.
