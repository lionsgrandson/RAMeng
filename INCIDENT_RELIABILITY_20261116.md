# November 16 reliability investigation and release

## Outcome and evidence limits

Implemented and deployed KV consumption and integration-status resilience changes. No subscription upgrade, database migration, credential revocation, namespace deletion, or customer-data reset was performed. The unrelated local `.gitignore` modification and `CHECKLIST_RELEASE_20261012.md` were preserved.

**The historical browser transport failure is not conclusively explained. Acceptance requiring both historical root causes to be proven is therefore not fully satisfied.** The saved report has no request correlation, network trace, or detailed dependency failure. Improvements and passing tests do not retroactively establish that cause.

## Infrastructure and incidents

- Cloudflare account: `45834d92b0992b24644537fc864542e4`, Udi's account. Dashboard **Workers plans → Free → Current plan** was inspected. The subscription API itself returned 403; dashboard verification resolved this permission limitation.
- Worker: `rameng-crm`. Sole account KV namespace: `CONFIG`, `7676674ec22a440d8d946a8fe393775b`. Provider settings confirm this binding, assets, and the existing two secret bindings. Secret values were not printed.
- Staging is the established version-preview alias of this Worker: **it shares production KV, Supabase, Google configuration and account quotas**. Uploading a preview does not install separate cron invocations. The separate synthetic QA Worker has no production bindings.
- Registered schedules: task outbox every five minutes; application-error/Drive queues at minute 15/45; Google read feeds every two hours. The latter two were installed November 15 at 17:22 UTC, before the reported November 16 incident.

Cloudflare GraphQL `kvOperationsAdaptiveGroups` returned the following account/namespace operation requests. These are provider analytics, potentially sampled, not a per-key ledger or proof that every write succeeded.

| UTC day | Reads | Writes | Deletes | Lists |
|---|---:|---:|---:|---:|
| November 14 | 11,265 | 966 | 434 | 864 |
| November 15 | 15,429 | **1,025** | 504 | 699 |
| November 16, early investigation snapshot | 2,660 | 30 | 74 | 25 |

**Incident A:** writes are the operation exceeding the verified Free-plan 1,000/day allowance in the observed November 15 totals. Before commit `b445b23`, all three KV queues ran every five minutes. Offline replay of those actual sources proves an empty system alone made 576 writes/day to the Google/Drive scan cursors, 576 deletes/day of absent task/error cursors, and 864 list calls/day. Interactive writes, draft saves, error reports, token refreshes and cache/feed updates consumed the remaining allowance. Historical per-key telemetry was absent, so assigning each of the observed 1,025 writes to an endpoint or trigger is impossible. The 17:00 UTC hour also contains 286 writes around deployment and user activity; their exact per-key attribution is unproven.

Provider hourly evidence corroborates the November 15 schedule correction: lists dropped from approximately 36/hour to 4–5/hour after 17:22 UTC; writes were 4–5/hour in subsequent complete quiet hours. The new changes remove the remaining empty-cursor mutations.

**Additional confirmed risk:** the mail composer retried an unsynchronized draft every ten seconds, even when unchanged. The server rewrote the draft each time. A mocked Gmail outage replay measured 25 writes for 25 identical calls. This was a real code path, but cannot be attributed to the historical alert without per-key logs.

**Incident B:** the exact stored report `26769e65-dccd-4ac2-899a-6fc4fe4a7a72` was retrieved from the November 16 03:00 UTC error-report prefix. Its timestamp, endpoint, page, generic `Error` code and Hebrew message match the supplied incident; state was `sent`, attempts 1. That message originates in the frontend's rejected `fetch` handler. It establishes a browser transport failure, not a particular DNS, network, CORS, Worker, or device cause.

At that time the endpoint authenticated through Supabase, read configuration/token metadata from KV, and returned booleans. It did **not** refresh OAuth, call Gmail/Calendar/Drive, or await background synchronization. Token expiry or a background sync failure therefore cannot directly explain that implementation's generic browser fetch exception. November 16 counts were far below the daily limits after the UTC reset, so the November 15 write exhaustion is not demonstrated as its cause. Historical Worker observability was not enabled; the two alerts must not be equated.

## KV audit and implementation

Repository audit covered all `CONFIG` calls, API/middleware, OAuth, frontend timers, scheduled work, retries and history. No other runtime KV binding, React Query, or SWR implementation was found. Private/persistent data remains in its existing storage; migration was unnecessary for the measured reductions and would require separate consistency/access-control verification.

| Workload / files | Findings and resulting behavior |
|---|---|
| `worker/src/kvDiagnostics.js`, `index.js` | In-flight configuration/token read coalescing scoped to the original environment. Settled configuration/authorization reads are not cached. Existing refreshed-token/draft cache identities survive instrumentation. Every KV operation is counted by type and safe key family; failures log namespace, category, endpoint/job and correlation ID. No raw key/value/token/mail content is logged. |
| `googleSync.js`, `driveQueue.js`, `index.js` | Persist cursors only when they change; delete only existing cursors. Preserve bounded pagination and existing maintenance schedules. Duplicate unchanged queued uploads reuse their due date. Failed Drive uploads/read feeds retain work with exponential backoff, jitter and a five-attempt automatic limit; explicit synchronization can retry. Quota exceptions do not cause retry-state writes. |
| `index.js`, `integrationStatus.js` | Authenticate/authorize before exposing per-user state. Status distinguishes connected, disconnected, reconnect-required, temporary unavailability and configuration error. `connected: null` means unknown, not disconnected. Expired tokens refresh through the existing single-flight path with a deadline; invalid grant and invalid client are distinguished. Failed refreshes have a bounded short cooldown with jitter. Token persistence must succeed before refreshed credentials are accepted. |
| `index.js` authentication/provider calls | Supabase 429/5xx remain 503 rather than becoming an invalid session. Auth/membership, OAuth and Google requests have timeouts. A Google request still retries a rejected access token at most once. Mutating provider operations do not gain unsafe automatic retries. |
| `src/lib/api.ts` | Concurrent status consumers share an in-flight request scoped to API origin, org and session token. No public/shared browser token cache or status-result cache is created. Requests have deadlines; errors include privacy-safe HTTP/category/correlation or online/visibility context. |
| `TaskCalendarSync.tsx`, `DriveAutoSync.tsx`, `Settings.tsx` | Unknown health is displayed as unavailable instead of disconnected. Saved Projects data remains usable. Calendar timer retries stop in hidden/offline tabs, back off, stop after five failures, and retain manual recovery. Successful checks use a five-minute interval instead of one minute. |
| `GoogleCommunication.tsx`, `index.js` draft handler | Failed autosave/sync retries back off with jitter and stop after five failures; hidden tabs do not timer-retry. New edits reset recovery, and unmount retains a final save attempt. Unchanged unsynced drafts reuse their durable copy; unchanged synced drafts skip both KV and Gmail writes. Changed contents still save immediately through the existing debounce. |
| Existing OAuth state, signatures, project/task mail links, comments, Drive folders/shares/export fingerprints | Remain owner/org authorized and in existing storage. Necessary user mutations and OAuth persistence were retained. No blanket cache was placed around permissions, Gmail reads, or Calendar freshness. |
| Existing error reporting | Remains bounded by fingerprint and per-user daily count. A quota failure skips the secondary error-enqueue path, preventing diagnostic writes to an exhausted store. KV logging itself performs no KV requests. |

`google.services` and synchronization are explicitly `unchecked` in status: valid OAuth credentials alone do not certify all three APIs or an outbox. Actual synchronization endpoints continue to return their own success/failure counts. Exhausted background work is retained for manual retry rather than reported as successful. Cross-isolate/global deduplication is not claimed; KV remains eventually consistent.

## Reproducible consumption measurements

Run `npm run test:kv-load`. It imports historical committed sources, mocks every provider request, and uses in-memory KV. It cannot send load to production.

| Measured workload | Reads | Writes | Deletes | Lists |
|---|---:|---:|---:|---:|
| 24h empty scheduled queues, before November 15 fix | 1,440 | 576 | 576 | 864 |
| Same workload with deployed baseline `8c8d173` and its schedules | 744 | 60 | 336 | 108 |
| Same workload after this release | 744 | **0** | **0** | 108 |
| 10 bursts × 25 concurrent status calls, baseline | 500 | 0 | 0 | 0 |
| Same status calls, release | **20** | 0 | 0 | 0 |
| 25 identical draft calls during Gmail 503, baseline | 51 | 25 | 0 | 0 |
| Same draft calls, release | 51 | **1** | 0 | 0 |

The cron model is a full 24-hour replay with empty queues and synthetic Supabase. Status measurements assume overlapping calls in a warm isolate, excluding browser deduplication. Draft measurements exclude browser retry reduction. These measurements are **not** a projection of total daily customer usage. Active edits, comments, uploads, OAuth and outboxes require additional operations.

## Validation

- `npm test`: **188/188 passed**, including simulated quota/temporary KV failure, OAuth expiry/invalid grant/invalid client, concurrent refresh/status, timeout, tenant isolation, queue retry limits and unchanged drafts.
- `npm run lint`, `npm run build`, Worker syntax checks and `git diff --check`: passed. Build retains the existing large-chunk warning.
- `npm run test:kv-load`: passed with the measurements above; CI fetches history to reproduce baselines.
- `RAMENG_TEST_PG_RUNTIME=<local runtime> node tests/run-database.mjs`: passed disposable migrations, RLS/denials, workflow assertions and concurrent-save checks. Production database was not used.
- `RAMENG_TEST_BROWSER_RUNTIME=<local runtime> node tests/browser.mjs`: **93/93 passed** after the composer changes.
- `npm run test:status-browser` with that runtime: passed actual-client request deduplication, usable Projects during temporary failure, bounded retries and hidden second-tab checks. Added to CI.
- `npm audit --audit-level=high` for root, Worker and desktop: no high/critical findings. Existing moderate findings remain (root 3, desktop 7; Worker 0 in the local audit snapshot). GitHub advisory counts can differ.
- Established smoke script: **26/26 passed on staging and production**, comparing HTML and every emitted asset, configuration target, anonymous authorization denials and CORS. No customer mutations were made by this script.

Google validation is deliberately separated:

| Integration | Automated / live result |
|---|---|
| Gmail inbox | Mocked pagination/metadata/isolation regressions pass; authenticated production inbox displayed 20 messages with no alert. |
| Gmail send/reply/read/unread | Mocked send/reply/attachments/thread continuity/read-state/security and failure regressions pass. No live test mail was sent and no live message read-state was intentionally changed. |
| Gmail drafts | Creation/restoration/changes/send/outage regressions pass, including unchanged-save reduction and durable new edits. Browser compose/reply scenarios pass. |
| Calendar / tasks | Mocked idempotent deterministic events, concurrent sync, permission denial, partial failures and bounded writes pass. Production Calendar completed loading without an alert; task-sync banner reported saved tasks synchronized. No fresh test meeting was created. |
| Drive | Mocked connectivity/listing/upload/idempotency/permission regressions pass. Production linked QA folder and existing files loaded. No live upload/share mutation was performed. |
| Refresh/reconnect | Mocked concurrent expiry refresh, invalid grant, invalid client and timeout tests pass. Production Google settings showed connected; credentials were not revoked to force a live reconnect. |
| Scheduled/manual sync | Offline actual-cron replay, queue failures and force/manual-retry regressions pass. Production schedules are provider confirmed; manual bulk sync was not invoked against customer files solely for testing. |

## Monitoring and operational limitations

`worker/wrangler.toml` enables persisted sanitized application logs, disables automatic invocation logs, and redacts query strings. Traces are disabled. Provider settings were checked. Logs include operation counts/duration/family, failure category, namespace, job/endpoint, attempt and correlation; no monitoring KV writes are introduced.

`tests/kv-usage.mjs` is a read-only account-wide diagnostic using an Analytics-read `CLOUDFLARE_API_TOKEN`. It exits 2 when any operation reaches 80% of the supplied budget. `RAMENG_KV_BUDGETS` overrides thresholds; defaults match the verified current Free plan. No external scheduler, paid service or alert delivery subscription was created. Run it from existing operational monitoring if an unattended alert is required.

During the observation window, provider runtime analytics reported 120 successful invocations and zero runtime errors since 05:55 UTC; that window includes release smoke requests. This is **not** a claim that every HTTP response was 2xx. New structured logs were observed live without KV writes for ordinary reads. A complete post-release UTC day has not yet elapsed, so sustained daily headroom is not certified.

A tab that remained open across two frontend deployments encountered a removed lazy editor chunk and went blank when opening Settings. Reloading recovered the current build. This is an observed deployment/asset-lifetime limitation, separate from the historical status incident; stale open tabs can require a reload. No unsaved user form was intentionally edited during verification.

## Deployment record

- Branch: `codex/kv-status-resilience`, fast-forward merged and pushed to `main` in three runtime/configuration commits plus report-only commits.
- Application changes: `be11e966b6dfba4d61b0a05a9e316639e2c33ccf`, `4dedae7dd8775df2fd8988d3acf6881fe88ac404`.
- Final release/config commit: **`6d079652ecdb78aa2e094c3376c08dec1e47efb9`**.
- Final staging version: `bdfcc0f5-35e7-4dbb-823d-44db53b696a5`, provider upload confirmed. [Staging](https://staging-rameng-crm.rameng-crm-worker.workers.dev).
- Final production version: **`aebf63cd-48af-413a-9195-5ab843a22e03`**, provider-confirmed at 100% traffic. [Production](https://rameng-crm.rameng-crm-worker.workers.dev). Final production asset/configuration/authorization smoke: **26/26 passed**. Effective provider settings confirm `redact_query_string: true`, `invocation_logs: false`, persisted application logs and disabled traces.
- GitHub CI **passed** all three releases: [initial resilience run](https://github.com/lionsgrandson/RAMeng/actions/runs/43813529710), [draft correction run](https://github.com/lionsgrandson/RAMeng/actions/runs/43814129937), [final config run](https://github.com/lionsgrandson/RAMeng/actions/runs/43814724776). The final production deployment was created at November 16, 06:08:59 UTC (08:08:59 Israel time). The later report-only commit does not change deployed application/configuration content.
- Deployment used the repository's `deploy:staging` and `deploy:cloudflare` processes, explicit RAM profile/account and `--keep-vars`. Existing secrets and bindings were preserved.
- Staging public/configuration/authorization/asset checks passed. On November 16, after the user signed in through Udi's browser profile, authenticated staging UI verification also passed: Google settings showed connected, Gmail displayed 20 messages, Calendar finished loading without errors, and the linked QA Drive folder displayed five file links. Two dashboard → Projects navigation cycles succeeded without errors; the task-sync banner reported synchronized saved tasks. No test mail, manual read/unread change, upload, sharing change, or customer edit was performed. Staging continues to share production services. Synthetic fixtures supplied mutation tests.

## Remaining action / acceptance limits

No paid upgrade or data migration is required for these fixes. If exact historical transport causality is mandatory, the missing client network trace and historical Worker logs are the precise evidence blocker; code cannot reconstruct them. Keep the new diagnostics for recurrence and review a full post-release UTC day's operation counts. Operators can attach the provided budget diagnostic to existing monitoring. The authenticated staging-session blocker is now cleared; the full-day check remains due after November 17 at 08:10 Israel time.

Local sanitized evidence is under ignored `artifacts/audit/kv-*`; this document contains no credentials or private message contents.

Final observed November 16 totals: reads **3,094**, writes **49**, deletes **79**, lists **30**. This includes pre-release activity and our small read-only verification workload. Provider runtime analytics since 06:03:30 UTC showed **77 requests, zero runtime errors** at that snapshot. Neither snapshot establishes a full-day post-release rate or an HTTP-error SLO.
