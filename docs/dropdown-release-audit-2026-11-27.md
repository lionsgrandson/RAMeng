# Dropdown persistence audit — 27 November 2026

**Release status: BLOCKED. The feature is not complete in production.**

The candidate implements durable inline business choices and passed authenticated staging persistence checks. The actual production application still lacks inline task-status and priority creation. Production also contains task-delivery, assignment and Gmail workflows absent from repository main. Replacing it with this checkout would regress those workflows. No production deployment was performed.

## Release identity and environments

| Item | Observed identity |
| --- | --- |
| Repository and requested branch | `lionsgrandson/RAMeng`, `main` |
| Initial local HEAD | `5ebd1c1a899852c15ef89217ee84758bd879399f` |
| Safely fast-forwarded main / PR #40 reference | `ac7e3fd711c47415ace264eb448fe4ec297fac13` |
| Candidate frontend identity | `dropdown-a73a4c4aaf37`; SHA-256 manifest in local evidence |
| Staging URL | https://staging-rameng-crm.rameng-crm-worker.workers.dev |
| Candidate Worker version | `ff945c2b-ec45-476d-8baf-b77ab8dff237` |
| Immutable candidate URL | https://ff945c2b-rameng-crm.rameng-crm-worker.workers.dev |
| Production URL | https://rameng-crm.rameng-crm-worker.workers.dev |
| Production frontend version | `58e07609e082` |
| Active production Worker | `78faed8a-dfdf-408a-b042-26c58effc953`, 100%, created 2026-11-24 15:59:15 UTC |
| Actual shared Supabase project | `evnlggpetexwpnjxtxya` (`ramcrm`) |
| Outdated project reference corrected in smoke test | `qvunspguudkhwgbjvvuf` was not the backend used by either deployed application |

The supported `npm run deploy:staging` command uploaded a preview version without changing the production deployment. Staging and production share the existing backend; disposable records used the unique prefix `QA-DD-20261127-`. Udi's existing authorized Chrome session was used. No accounts, invitations, access grants, emails or calendar attendees were fabricated for these checks.

The registry/status/profession/custom-field/report-template authenticated matrix was exercised on candidate `dropdown-15587bfa6524` (Worker `9aa92834-c4cd-46f6-9796-555adab6c40d`). The final candidate fixes a further linked-task duplicate-name issue. Its project/contact/task/checklist creation and reload/reuse were independently tested on the final hosted build. Its deployed assets separately passed all 34 byte/public smoke checks. This is a record of the checks performed, not a claim that every earlier live interaction was repeated on every subsequent upload.

The production frontend's original sources were recovered from its public source map into ignored local evidence. The exact active compiled Worker was obtained through Cloudflare's version API. This is evidence for reconciliation, not a maintainable replacement for the missing source checkout. The production build identifier is absent from local refs and GitHub's commit lookup; the owner does not recall its release source. In particular, production's task-delivery and Gmail-change routes return an authentication response, while this candidate has no matching routes (404). Local tests cannot resolve this deployment-baseline difference.

## Per-dropdown family matrix

PASS means the stated check was actually performed. A family browser pass does not mean every instance of that component was individually tested live. The complete static inventory lists **150 control instances**, including component wrappers, mapped controls and unreachable legacy exports. It is linked below. Production-source inventory separately found 135 instances with this scanner; that count is not directly comparable because the production component structure differs.

| Dropdown / locations | Candidate source | Automated tests | Authenticated staging | Live production | Backend persistence | Evidence / limits |
| --- | --- | --- | --- | --- | --- | --- |
| Task status: global/project tables, create/subtask forms, client quick edit/details, custom status columns, filters, import, external assignment | PASS | PASS | PASS: create/select, parent cancel, reload, save task, reuse | **FAIL**: task creation has no add action | PASS: `workspace_state.taskStatuses`; valid assigned external custom status tested in DB | Inline suite; DB suite; calendar custom-status regression; saved QA task/status confirmed directly in shared DB |
| Profession/category: task tables/forms, project categories, file/mail categorization, legacy profession columns | PASS | PASS | PASS: create/select, cancel/reload, task reuse | NOT TESTED for create/save/reuse; older `+ הוספת מקצוע חדש` action observed | PASS: shared category records and task profession relationship | Inline suite; real QA profession/task/project linkage in DB |
| Priority: task table/forms, client tasks, email-to-task, custom priority fields and filter | PASS | PASS | PASS: create/select, cancel/reload, saved task | **FAIL**: task creation offers four fixed values and no add action; new registry choice absent in earlier live inspection | PASS: org-scoped `business_options` | Registry RPC acknowledgement and direct DB evidence; custom priority uses same registry |
| Custom dropdown column values: settings definition, tables and task/client forms | PASS | PASS | PASS: define real column, create value, save, reload, reuse in another draft, cancel | NOT TESTED | PASS: shared `taskColumns[].options` and saved task custom value | `dropdown-staging-custom-reuse.png`; inline suite |
| Project status: directory/create/details, client project views and filter | PASS | PASS | PASS: cancel/reload, save project; **reuse after last project removed** | NOT TESTED | PASS: durable registry independent of project records | `dropdown-staging-project-after-last-record.png`; live DB evidence |
| Contact/client status: directory/create/edit and filter | PASS | PASS | PASS: cancel/reload, save contact; **reuse after last contact removed** | NOT TESTED | PASS: durable registry independent of contact records | `dropdown-staging-contact-after-last-record.png`; live DB evidence |
| Contact business role, company type, tags: create/edit and filters | PASS | PASS | PASS: create/select, parent cancel/reload, save contact | NOT TESTED | PASS: three org-scoped registry families | `dropdown-staging-contact-options.png`; direct registry rows and saved contact |
| Report item status: report editor | PASS | PASS | PASS: create/select, save report, reload and reopen | NOT TESTED | PASS: registry plus report item in shared workspace | `dropdown-staging-report-option.png`; inline suite |
| Plan status: uploaded file metadata | PASS | PASS | PASS: upload disposable PDF, create/select, explicit save acknowledgement, hard reload | NOT TESTED | PASS: registry plus stored file metadata | `dropdown-staging-plan-option.png`; initial reload before parent save correctly did not imply a saved parent value |
| Quote/financial document status: client finance create/edit, financial report filter, legacy finance export | PASS | PASS | PASS: real zero-value disposable document, create/select/save/reload/reuse | NOT TESTED | PASS: registry plus valid contact/project-linked document | `dropdown-staging-finance-option.png`; no payment, invoice delivery or external transaction performed |
| Linked projects: task/client forms and cells, report/email/calendar/file/journal selectors | PASS: valid records with mandatory address | PASS, including parent cancellation, required address and duplicate names | PASS: inline file-association picker, required address, immediate selection and reload/reuse | NOT TESTED | PASS: valid project record independently confirmed in live DB | Distinct identities permit duplicate project names; address is required |
| Linked contacts: project/client picker, legacy finance/pipeline, journal | PASS: real contacts; email identity where explicitly provided | PASS, including duplicate names and parent cancellation | PASS: inline creation, immediate selection, preserved parent draft, cancel/reload/reuse | NOT TESTED | PASS: saved contact and relationship independently confirmed in live DB | No user is created by contact creation; invitation/access workflow remains separate |
| Linked tasks: file/event/reminder/mail-journal association | PASS: scoped real task records | PASS: create/select/save/reload/reuse, duplicate names and project relationship | PASS: two tasks with identical titles, distinct IDs, same valid project, acknowledgement/reload/reuse | NOT TESTED | PASS: both task IDs and correct project independently confirmed in live DB | Fixed name-based reuse in the linked-task creation action; a title is not a record identity |
| Report templates: project defaults, report form and task-to-report | PASS: real template with required first section | PASS: create/select/commit/reload and parent cancellation | PASS: valid template created inline, survives cancelled project, reused for saved project/report | NOT TESTED | PASS: shared template record with section/layout | Inline suite; saved QA template confirmed in live DB |
| Checklist templates: project task template selector | PASS: real template with required first task | PASS: create/apply/save/reload/reuse | PASS: valid template, first task, save/reload/reuse creates a second real task | NOT TESTED | PASS: template and both task/project relationships independently confirmed in live DB | Applying a checklist creates actual tasks, so required item and project scope are retained |

## Restricted selectors and exceptions

| Surface / controls | Disposition and rationale |
| --- | --- |
| All list filters: project, contact, task, profession, inspector, status, priority, dates, report open/closed, file kind, mail read state | Read-only selection/search. Creation occurs in the associated editor/picker. Business status/priority/contact-category filters load canonical registries; record filters use real records. Computed open/closed/payment states and MIME-derived file kinds are fixed calculations, not editable vocabularies. |
| `UserManagement`: security role and access controls; task/project manager and custom member selectors | Fixed roles and existing authorized members only. Use the invitation, user-management and project-access workflows. Creating a contact does not create a login or authorize task/project access. |
| `TaskContactAssignment`: existing contact or external assignee, consent/authorization | Dedicated invitation/access workflow with required identity, explicit grant handling and server checks. No arbitrary user option or role is manufactured. External participants may choose existing allowed task statuses, but cannot extend the organization's vocabularies. |
| `DisplaySettings`: grouping, density, column type | Fixed implemented modes. The new supported dropdown column type creates an actual persisted custom field; arbitrary technical types are disallowed. |
| `DisplaySettings`: profession replacement, retiring task status | Existing canonical replacement values only. These are reviewed migration/normalization operations; use ordinary option creation first. Built-in completion statuses retain their existing meaning and cannot be removed by adding a new label. |
| Reports: layout, aggregate open/closed filters, inspector filter | Layout is a fixed implemented renderer; inspector filter reflects existing reports. Report sections and saved templates are real content workflows, not arbitrary layout modes. |
| `ProjectReportTypes`, `MeetingSummaries`: template/task checkbox lists | Existing valid records. Project template creation is available in the adjacent default-template picker; meeting task inclusion is a selection of actual project tasks and never fabricates placeholder tasks. |
| Calendar: event/task source, task-date mode | Fixed Google/local source and implemented date projections. Linked project/task editors use real creation workflows. |
| Files, Drive and email attachments: existing file selector, folders, profession-folder mapping, Drive permissions | Files require an actual upload; folders require Drive's create/move workflow; sharing roles are security enums. Do not create a filename-only record or invent a sharing permission. Profession-folder mapping selects canonical categories and creates provider folders through the existing workflow. |
| Email: existing thread/task navigation, read filter, recipient suggestions | Navigation/read modes stay fixed. Recipient suggestions assist valid addresses; adding a suggestion never creates a user or sends an invitation. A stored-file picker uses the upload workflow. No real email was sent during QA. |
| Address autocomplete and global search combobox | Suggestions/search results, not option registries. Project addresses accept a valid required user-entered address and do not require a new provider place record. |
| Rich text: font, font size; task color palette; timezone/date field selectors | Implemented presentation/technical enums remain restricted. Arbitrary user input would not define a renderer, color token or timezone implementation. |
| `CorePages` legacy exports | Included in source inventory, even where App routes use ClientCenter/UserManagement instead. The unused legacy TeamPage is not a valid invitation workflow and was not enabled or used. Source presence is not a claim that the export is reachable. |
| Component wrappers and read-only journal fallbacks | Inventory includes their underlying `<select>` as well as the caller. A wrapper is not an additional independent dropdown family. Journal association creation remains gated by the linked record area's permission. |

## Storage, validation and failures

Nine business vocabularies now live in `public.business_options`, keyed by organization, allowlisted family and canonical case-insensitive value. `create_business_option` validates the authenticated membership and the family's create/edit permissions on the server; table writes are not granted directly. The RPC waits for an acknowledgement and returns the stored canonical spelling when concurrent users create the same option. Historical labels are captured without rewriting their parent records.

Task statuses, professions and custom field options already have independent shared workspace collections. They keep those canonical stores and the versioned save contract. Concurrent workspace edits reject stale versions rather than overwrite another user's save; a conflict is surfaced for resolution. This is deliberately distinct from the registry RPC's atomic duplicate upsert.

Both client and server normalize NFC and Unicode whitespace, reject blank/overlong/control/bidi/sentinel labels, and prevent case-insensitive duplicates. Historical unchanged values remain readable. Linked record names are display labels: duplicate projects and contacts retain distinct IDs and required address/email details rather than being incorrectly collapsed by name.

Portal submissions stop propagation and await a shared backend commit. A rejected save leaves the inner creation dialog, parent draft and selected value intact. Retry retains a pending record identity instead of creating another record. Permission rejection and missing/invalid version acknowledgement cannot produce a successful-save state. The previous unversioned table-upsert fallback was removed because it could falsely report a save and overwrite concurrent edits.

## Migrations and backups

| Migration | Verified effect |
| --- | --- |
| `20261127093434_durable_business_choices.sql` | Additive option table/RLS/RPC, historical backfill, capture trigger and new-choice validation; mandatory address for newly created linked projects. Initial backfill: 60 options. Existing workspace document/version verified unchanged by migration. |
| `20261127101231_unicode_business_option_whitespace.sql` | Match ECMAScript's full Unicode whitespace normalization, canonical duplicate comparison; check legacy registry rows before changing the normalizer. All 67 rows at that point remained unchanged. |

Both files were reviewed and exercised in disposable PostgreSQL before applying through the authenticated Supabase dashboard to the actual shared project. Migration history was checked against the exact local SQL (one stored statement each, 11,184 and 4,855 source characters). No customer workspace backup was restored over the current document.

Backups remain in the private schema with RLS enabled and no public/anon/authenticated/service-role table grants:

- `rameng_private.dropdown_release_backup_20261127`: workspace snapshot before migration, version 2.
- `rameng_private.dropdown_options_backup_20261127`: 67 registry rows before the Unicode follow-up.
- `rameng_private.dropdown_qa_archive_20261127`: three scoped cleanup snapshots, before parent removal, before test definition/option removal and before final linked-record cleanup.

Cleanup removed exactly this run's initial six parent records and four definitions, then its nine registry options and one custom task status. The final recheck added and subsequently archived/removed seven linked records (one contact, one project, four tasks and one checklist template). Guards stopped cleanup when references were detected; inspection showed only audit-history references, which were explicitly retained. The current workspace version reached 28, with **zero active test entities and zero test registry options**. The 59.1 KB sample PDF was moved to `qa-archive-20261127` within its original organization/project storage scope for recoverable archival. Audit and rollback archives remain; they are not active CRM data.

## Verification actually run

| Check | Result |
| --- | --- |
| `npm ci`; `npm ci --prefix worker` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 210 tests |
| `npm run test:kv-load` | PASS: synthetic offline workload, not a production usage estimate |
| `npm run build`; `npm run build:preview` | PASS; existing large-chunk warning remains |
| All seven Worker/desktop syntax checks configured in CI | PASS |
| High-severity npm audit gate for frontend, Worker, desktop | PASS; frontend 3 moderate and desktop 7 moderate findings remain; Worker has none |
| Disposable database workflows | PASS: existing 32 assertions / 20 expected denials, 44 new business-option assertions, platform RLS workflow and three concurrency scenarios |
| `tests/browser.mjs` | PASS: 93/93 final rerun. One earlier cold page navigation timed out while suites/builds started concurrently; no assertion or timeout was weakened. |
| `npm run test:status-browser` | PASS: 4 scenarios |
| `npm run test:new-incidents-browser` | PASS: 9 scenarios |
| `npm run test:inline-choices-browser` | PASS: 81/81 on desktop Chromium, mobile Chromium and mobile WebKit. Earlier expansion failures exposed three locator mistakes (option value attribute, input value versus text, duplicate close-button names); the locators were corrected without weakening assertions. The duplicate linked-task check also prompted the real identity fix described above. |
| Staging deployed-byte/public/API smoke | PASS: 34/34; HTML, app version and actual assets matched the preview build |
| Authenticated staging create/select/save/reload/reuse | PASS for the specifically marked families above, including direct shared-backend evidence and last-record deletion |
| Actual production authentication and task dropdown inspection | PASS authentication; FAIL task-status/priority inline creation; production UI read-only. Shared-backend migrations and staging test writes are documented above; no production deployment. |
| Logout/login and second existing authorized account/browser reuse | NOT TESTED — user explicitly deferred signing in later |
| Live unauthorized account and second-organization attempts | NOT TESTED — no authorized second account/organization session supplied; synthetic DB/RLS tests passed |
| Physical mobile Safari/Chrome | NOT TESTED — mobile Chromium and WebKit emulation passed; no physical device session was available |
| Live Google Calendar/Drive/Gmail health | BLOCKED for release approval: pre-existing Drive refresh failure observed; candidate lacks production-only routes. No real outgoing mail or dated calendar task was created just to infer health. |
| Production deployment/persistence acceptance | BLOCKED until source reconciliation and the deferred authenticated checks pass |

The new browser suite runs the real application UI against an explicitly isolated QA backend; it is not evidence of hosted persistence by itself. The live staging and dashboard checks above provide that independent evidence. CI now installs Chromium and WebKit and runs the new suite alongside every existing browser suite.

## Evidence and outstanding release gates

The full source inventory is [dropdown-selector-inventory-2026-11-27.md](dropdown-selector-inventory-2026-11-27.md). Regenerate its JSON/Markdown with `node tests/dropdown-inventory.mjs`. Ignored local evidence under `artifacts/audit` includes candidate hash manifests, command logs, browser scenario JSON, sanitized live DB summaries, deployed asset verification, screenshots and cleanup SQL/results. Neither backups nor credentials are committed.

Before production: recover/reconcile the maintainable source of build `58e07609e082` and Worker `78faed8a-dfdf-408a-b042-26c58effc953`; stage the combined source and verify delivery/Gmail/calendar/Drive behavior; complete the deferred account/session/isolation checks; then use the documented production command and repeat authenticated production create/save/reload/reuse. A successful upload or a green CI run is not production acceptance.
