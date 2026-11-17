# November 17 production incident investigation and repair

## Outcome

Investigated the NEW November 16–17 reports against Cloudflare deployment history, provider analytics, persisted dashboard logs, current source and deterministic regressions. Repaired confirmed classification, reporting, polling and deployment-asset defects. **The exact transport causes of A/C/D/F and the origin of E's unclassified HTTP 500 are not established. Passing tests and deploying these repairs do not establish retrospective causality.**

No database migration, credential revocation, quota exhaustion test, customer edit, deliberate mail send/read-state change, manual upload or sharing change was performed. Staging is a version-preview alias sharing production services; normal application background synchronization remains enabled.

## Production timeline and incident correlation

Cloudflare account `45834d92b0992b24644537fc864542e4`, Worker `rameng-crm`, CONFIG namespace `7676674ec22a440d8d946a8fe393775b`. All timestamps below are UTC. Deployment history was read directly using the established `rameng` Wrangler profile.

| Group | Incident time | Production routing version | Evidence and limits |
|---|---|---|---|
| A | Nov 16 05:59:37–40 | `942d9670-1b3d-4108-8f48-fa84276946c8`, deployed 05:57:51.934 | Dashboard window 05:57–06:06 contains application activity on this version. Simultaneous browser Worker/Supabase transport failures suggest shared connectivity, but browser correlation IDs and network traces are absent. |
| B | Nov 16 06:03:37.098 | `c2ebde61-d257-4cf0-8736-d0561a232c7f`, deployed 06:03:30.280 | Stale editor chunk is probable, consistent with the preceding deployment and independently reproduced asset-lifetime defect. The original chunk URL was omitted, so the precise missing file cannot be identified from the supplied report. |
| C | Nov 16 13:19:32–38 | `aebf63cd-48af-413a-9195-5ab843a22e03`, deployed 06:08:59.420 | Dashboard 13:17–13:22: 28 success-level log events, zero error-level events. Unread `kv_usage` at 13:19:32.055: request `4d8e92e3-f411-417c-9081-11b48fcf11c7`, 401 ms, 2 reads, no mutations/list. Nearby invocation reached the Worker; this is not definitive linkage to the client's status error. |
| D | Nov 16 15:50:26–28 | `aebf63cd-48af-413a-9195-5ab843a22e03` | Dashboard 15:48–15:53: 21 success-level events, zero error-level events. Unread at 15:50:26.759, request `a7be0d9e-710b-4685-a4d3-5d5ca193655f`, 347 ms, 2 reads, no mutations/list. It is 1 ms from the supplied browser timestamp, but there is no shared browser correlation ID. |
| E | Nov 16 23:54:32.687 | `aebf63cd-48af-413a-9195-5ab843a22e03` | Dashboard 23:52–23:57: 3 success-level events, zero error-level events. No matching application event at 23:54:32. Unread at 23:55:26.227, request `add82599-6a17-4bf9-b145-b414622c2325`, 394 ms, 2 reads, no mutations/list. **Source of received 500 remains unknown.** |
| F | Nov 17 02:46:33–35 | `aebf63cd-48af-413a-9195-5ab843a22e03` | Dashboard 02:44–02:49: 25 success-level events, zero error-level events. Unread at 02:46:33.085, request `71b59887-58ee-4f37-abbf-c46e5fd4b199`, 469 ms, 1 counted read, no mutations/list; another overlapping request can own a coalesced configuration read. |

These are production routing assignments, **not proof of the frontend bundle present in an old tab, nor proof every email came from the production hostname**. Report payloads lack that information. Runtime events include provider script-version metadata confirming the versions shown. Private user/org identifiers were used only as investigation context and are omitted here.

The combined A/B window contains 95 success-level and 29 error-level application events. An inspected error at 06:03:56.476 was a handled **401** on `/api/integrations/status`, request `3bc520b7-c503-499c-bb9f-bc994393d717`, on `c2ebde61…`; it is distinct from B's browser module error. Counts of log levels are neither HTTP status counts nor invocation counts.

## Cloudflare findings

Provider GraphQL account-wide sampled operation-request totals:

| UTC period | Reads | Writes | Deletes | Lists |
|---|---:|---:|---:|---:|
| Nov 16, complete day | 9,119 | 146 | 98 | 111 |
| Nov 17, initial investigation snapshot around 05:40 | 1,673 | 24 | 5 | 25 |

The sole observed namespace is CONFIG. Compared with previously verified Free-plan daily limits (100,000 reads, 1,000 each writes/deletes/lists), these totals provide **no evidence of renewed KV quota exhaustion**. Nov 16 writes were 14.6% of the allowance. Sampled totals are not a per-key ledger or proof of every successful operation. Inspected incident-window logs contain no `kv_failure` evidence of exhaustion.

Worker invocation analytics returned 4,019 requests/zero runtime errors for Nov 16 and 732/zero runtime errors at the initial Nov 17 snapshot. Handled HTTP failures do not count as runtime exceptions; requests that never reach the Worker also do not appear. Zero runtime errors therefore does not resolve the browser reports.

Effective provider settings before repair: compatibility date `2026-09-01`, standard usage model, persisted observability enabled, sampling 1, query-string redaction enabled, invocation logs disabled, traces disabled. Existing cron schedules remain unchanged: task queue every five minutes, error/Drive queues at minute 15/45, Google feed maintenance every two hours.

The Wrangler OAuth profile can read settings/deployments/analytics, but every historical telemetry-query API request for A–F returned HTTP 403. The authenticated Cloudflare dashboard supplied the persisted event evidence above. Supabase `query_logs` returned a permission error for the configured project. No log permissions, subscriptions or security settings were expanded. Historical CPU/memory usage, edge-generated HTTP responses, DNS/TLS failure traces and workers.dev challenge/security details were not available in the inspected application logs. Their absence is an evidence gap, not proof they were healthy.

## Confirmed defects and probable causes

1. **Missing static assets could return HTML/200.** Before repair, live `/assets/missing-incidents-test.js` returned HTTP 200 `text/html`. Root HTML and `/index.html` had `public, max-age=0, must-revalidate`, not the intended `no-store`: the Worker branch setting that header was bypassed by assets-first routing. Existing tabs could refer to removed hashed editor modules. This is a confirmed deployment defect and a probable explanation of B, separate from transport incidents.
2. **Gmail failures were inadequately classified.** `inboxUnread` passed a provider 500 through as application 500; JSON parsing and rejected provider/auth fetches could become generic exceptions. A missing counter became zero. The fix distinguishes OAuth reconnect/configuration, provider rate/permission/service failures, invalid responses, dependency transport/timeout, KV quota and internal errors. This reproduces software failure paths but does not prove which one produced E.
3. **Unknown request/category in E is a real diagnostics gap.** Old client JSON parsing swallowed parse failures into `{}`. It read correlation/category only from the body, did not assign a browser request ID, and the Worker's catch response lacked its correlation header. A normal catch-path JSON body should still have contained `requestId` and `category`. Thus E's `unknown/unknown` is consistent with a non-JSON/truncated response, an outer platform response, or other unavailable body; the original body/headers are needed to discriminate. There is no matching persisted Worker error proving Gmail or KV caused it.
4. **One outage generated independent notifications.** Old fingerprints included operation/message, so API status, Gmail and Supabase failures within seconds were separate reports. Reporting could also delay a Worker error response while it authenticated, wrote KV and sent Gmail. Reporting now runs through bounded client batches; Worker responses return promptly and persistent sanitized logs retain server visibility.
5. **Unread polling amplified noise and lacked stale status.** The sidebar polled every minute in hidden/offline tabs, with no backoff and no visible stale marker. Token retrieval occurred before the API fetch exception boundary and ignored returned session errors. These are confirmed code defects, not evidence of a particular historical network cause.

A/C/D/F are temporal clusters across independent dependencies. A shared browser/network/edge interruption is probable; DNS, TLS, browser extension, navigation/sleep, session retrieval and routing explanations cannot be separated retrospectively. Gmail and status both authenticate through Supabase, but a rejected browser fetch is not by itself evidence of expired OAuth. Status does not perform a Gmail read. No confirmed common cause links B or E to those clusters.

## Code changes

| Files | Result |
|---|---|
| `worker/src/upstream.js` | Sanitized fetch/JSON dependency boundaries and validated Gmail unread counters; provider 5xx becomes classified 503, rate limits 429, exhausted authorization 409, invalid/permission responses 502. |
| `worker/src/index.js` | Auth/membership/OAuth/Google boundaries; OAuth grant/config/rate distinctions; safe incoming correlation ID validation; IDs/version headers on success and failure; CORS permits/exposes diagnostic headers; sanitized request-start/completion/error logs; removes synchronous secondary error-email work; missing JS receives non-cacheable 404. |
| `worker/src/kvDiagnostics.js` | Preserves request-local instrumentation and attaches the KV dependency/category to propagated exceptions. No diagnostic storage operations added. |
| `worker/wrangler.toml` | Version metadata binding; Worker-first handling for `/assets/*` prevents SPA HTML fallback. Existing namespace, cron schedules and observability redaction preserved. |
| `src/lib/api.ts` | Auth deadline/error handling; scoped in-flight unread/status deduplication; browser-generated correlation IDs and app version; response/body/header-aware classification including invalid response bodies; prevents reporter recursion and ignores intentional abort reports. No unsafe mutation retries. |
| `src/lib/diagnostics.ts` | Typed timestamp/version/endpoint/method/status/category/dependency/online/visibility/error-name/response-received context. |
| `src/lib/backend.ts`, `src/App.tsx` | Retain structured Supabase diagnostics through backend events instead of reducing them to a string; reject session retrieval errors; sidebar displays stale unread state. |
| `src/lib/useUnreadMail.ts` | Five-minute successful polling; pauses hidden/offline; single flight; exponential failure backoff up to 15 minutes; reconnect/visibility recovery; retains last known count; clears count on user change. |
| `src/lib/errorReporting.ts` | Ten-second collection window, five-minute repeated-delivery cooldown per owner/org/operation/code, bounded persisted queue and event detail, failure counts/endpoints, raw-fetch reporter with deadline, no reporting loop; email/token/key redaction. |
| `worker/src/applicationErrors.js` | Whitelisted diagnostic fields in records/emails; batches merge counts/endpoints without repeat delivery; stable batch IDs prevent replay inflation; daily email cap remains 20 and over-cap evidence is retained. No per-failure counter writes before batching. A distinct new error can advance a pending cooldown timer to the short collection window; an in-flight batch is immutable so later failures receive another idempotency key. |
| `src/lib/assetRecovery.tsx` | Checks uncached application version on module failure; offers explicit reload with unsaved-work confirmation and session guard; failed lazy editor leaves surrounding form usable; ordinary transport failures do not trigger reload. |
| `src/components/Settings.tsx`, `src/components/GoogleCommunication.tsx`, `src/main.tsx` | Recoverable editor imports and Vite preload-failure hook. |
| `public/_headers`, `vite.config.ts` | Real static-asset headers prevent HTML/version caching; version JSON and compiled version; include retained prior public asset graphs. |
| `tests/preserve-deployed-assets.mjs`, `deploy.cmd`, `package.json` | Before release builds, capture current production and staging HTML/module graphs with fixed-origin/name/count/byte/deadline bounds; keep their lazy chunks for the next deployment. No credentials, customer records or KV accessed. |
| `tests/new-incidents.test.mjs` | Worker/provider/quota/OAuth/timeout/correlation/privacy/batch/rate-cap/asset-fallback regressions. |
| `tests/fixtures/new-incidents.html`, `tests/fixtures/new-incidents.tsx`, `tests/new-incidents-browser.mjs` | Synthetic actual-client outages, Supabase failure correlation, malformed HTTP 500, offline recovery, tab sleep/resume, stale-count recovery, failed module/version recovery and reload-loop/unsaved-input protection. |
| `tests/regression.test.mjs` | Inbox fixture now supplies an actual unread label response; malformed fixture data is no longer silently treated as zero. |
| `tests/production-smoke.mjs`, `.github/workflows/ci.yml` | Cache/missing-module/correlation/CORS/version smoke checks and new browser suite in standard CI. |

Staging exposed a further asset-retention gap during verification: the first candidate retained only production modules, while the old preview editor referenced `RichTextEditor-DHCLqUnW.js`. That old tab went blank on opening Settings. The correction captures both origins; the corrected staging serves that exact old module as JavaScript/200 and the full retained graph passes content-hash smoke checks. Existing versions without the recovery hook still need a manual reload after an already-cached failed import. The historical preview was included through its immutable version URL during this correction. The old client's normal automatic diagnostic handler may have reported this verification failure.

## Tests and security review

- `npm test`: **201/201 passed**. Includes existing Gmail, Calendar, Drive, tenant isolation, safe token-refresh, draft and synchronization regressions.
- `npm run lint`: passed (repository's TypeScript check). Production/preview builds passed; existing large-chunk advisory remains.
- `npm run test:new-incidents-browser`: **9 scenarios passed** against local synthetic services, using actual client/reporting/lazy-import/unread-hook code.
- Existing `tests/browser.mjs`: **93/93 scenarios passed**. Existing status browser suite: four resilience checks passed, including 25 concurrent consumers and hidden-tab behavior.
- Disposable PostgreSQL migration/RLS/workflow/concurrent-save checks passed; 32 final-QA assertions and 20 expected denials included. No production schema change.
- Worker syntax and `git diff --check`: passed.
- Root/Worker/desktop `npm audit --audit-level=high`: passed; root 3 moderate, desktop 7 moderate, Worker zero findings. No dependency upgrade introduced.
- No access/refresh tokens, authorization headers, private email addresses or request bodies are included in new structured logs. Diagnostic records whitelist scalar fields and redact addresses, URLs, keys and secrets. Existing bearer authentication and org membership checks still precede per-account operations.

KV workload comparisons, ordered reads/writes/deletes/lists:

| Deterministic offline workload | Nov 16 release | Repair |
|---|---|---|
| 24h empty scheduled queues | 744 / 0 / 0 / 108 | **744 / 0 / 0 / 108** |
| 10 bursts × 25 overlapping status calls | 20 / 0 / 0 / 0 | **20 / 0 / 0 / 0** |
| 25 identical draft saves during mocked Gmail 503 | 51 / 1 / 0 / 0 | **51 / 1 / 0 / 0** |

`npm run test:kv-load` passed; no regression against the previous release. Historical pre-fix baselines remain 1,440/576/576/864 for empty cron and 51/25/0/0 for draft retries. These models do not predict total real account usage. A new notification stores a report and rate counter; identical batch replay writes nothing; a new batch added to an existing incident writes one bounded aggregate. No live quota was intentionally exhausted.

## Deployment and live verification

- Runtime source: `856a7c17cfd9fe87b2a1f0ebd26822cb978e05ae`, preceded by implementation commits `4d204d5` and `d2b1f13`; repair branch `codex/production-incident-reliability-20261117`, fast-forward merged/pushed to `main` after staging checks.
- Final staging version: **`f409287c-997b-4985-8840-01451c897c7c`**. [Staging](https://staging-rameng-crm.rameng-crm-worker.workers.dev). **33/33 smoke checks passed** against the final preview build and retained assets. The earlier asset-retention candidate `0867438a…` passed 35/35 including the historical preview graph.
- Live staging authenticated status and unread requests returned **HTTP 200**, both with version `f409287c…`. Example request IDs: status `ed87e1df-4259-4db9-8796-4e97d5aeed46`; unread `b987eeed-7389-4d73-bf9d-0f7a123633d7`. Browser network inspection selected only endpoint/status/correlation/version, never credential headers or mail bodies. Settings editor loaded; Google showed connected; inbox displayed 20 messages and a confirmed unread badge.
- Final production version: **`133caef2-828f-4564-ad52-e1bc996e0b62`**, provider-confirmed at **100% traffic**, created November 17 at **06:19:36.948 UTC (08:19:36 Israel time)**. [Production](https://rameng-crm.rameng-crm-worker.workers.dev). **35/35 final smoke checks passed**, matching live HTML and all emitted assets to the production build. The final release additionally retained the original November 16 production graph through its immutable version URL, so both repair deployments do not prematurely evict that older session.
- Final authenticated production unread request `a47d3259-9805-4138-ac7a-b753a97b1790` and status request `3651154d-aba4-4e51-b458-4b41566f058d` returned **HTTP 200** and version `133caef2…`; Settings editor loaded and Google showed connected. No live errors were induced to test the reporting pipeline; synthetic browser and provider fixtures supplied those cases.
- CI: [final correction run](https://github.com/lionsgrandson/RAMeng/actions/runs/44029555420); **passed**, including the 201 tests, database workflows, 93 existing browser cases, status browser checks and all nine new incident scenarios. The final production rollout followed this successful run. The initial run exposed a cooldown scheduling defect and an asynchronous test assertion race; both were corrected, with concurrent-delivery coverage added. GitHub accepted the explicitly requested main push with its administrator bypass while the hosted check was pending; the local checks above had passed first.

## Remaining risks and evidence limits

- E's original response body/headers and browser HAR are missing; Cloudflare application logs do not identify its server-side origin. Supabase historical logs require permissions not available in the connected tool. No retrospective root cause is claimed.
- Correlation makes future Worker reachability measurable; it cannot reconstruct old browser IDs. Edge/runtime termination can still prevent application completion logs. Provider telemetry coverage/sampling/retention limitations remain.
- Asset retention protects the immediately preceding public module graphs, not arbitrarily old sessions. The new hook protects later releases; already-failed old-version imports can require explicit manual reload. HTML/version headers now come from the static asset system.
- Notification aggregation is per browser owner/org and eventually consistent KV; it does not promise globally atomic cross-tab/cross-isolate deduplication. Detailed event samples are capped at 20 while total counts/endpoints remain bounded. Emails are snapshots; later repetitions update the persisted incident without sending another email. Daily caps preserve records but suppress additional emails.
- Successful UI reads and synthetic mutation tests do not certify every live Gmail send/draft mutation, Calendar mutation or Drive upload. Credentials were not revoked and customer data was not altered to force failure modes.
- A complete post-repair day has not elapsed. Sustained traffic/network recovery and daily KV headroom still require operational observation; the existing `tests/kv-usage.mjs` read-only budget diagnostic remains available.

At 06:20:24 UTC, post-release provider settings confirmed preserved redaction/log configuration, CONFIG and both existing secret bindings plus version metadata. Nov 17 cumulative KV totals were **2,408 reads / 35 writes / 6 deletes / 32 lists**, all far below the existing daily limits. The initial sub-minute invocation-analytics query for the final deployment had no rows; this is ingestion delay/coverage uncertainty, not a zero-traffic or zero-error assertion. At 06:22:36 UTC the next provider snapshot contained **57 successful invocations and zero runtime errors** since the final rollout. The cumulative KV totals remained unchanged at that snapshot. This short window includes smoke traffic and does not establish a sustained HTTP-error SLO. Final unread request `a47d3259-9805-4138-ac7a-b753a97b1790` also matches three persisted events; its `api_response` at **06:20:54.859 UTC** records HTTP 200, **305 ms**, and Worker version `133caef2…`.

The first production candidate (`ea75dd88-e31b-424a-99c5-f37b4eae1980`, deployed 06:03:47.439 UTC) also supplied direct end-to-end correlation evidence: browser unread response request `26a98283-49ea-459e-966e-613c91c860f7` matches persisted `api_request`, `api_response`, and `kv_usage` events. The dashboard response event at 06:06:32.236 reports HTTP 200, 290 ms and that exact Worker version. An application tab opened on the original November 16 production build successfully loaded its old Settings editor after this deployment. Production inbox displayed 20 messages, Calendar finished loading without alerts, and the linked QA Drive view displayed six Drive links.

Sanitized local evidence: ignored `artifacts/audit/new-*`, `artifacts/audit/incident-staging-20261117.json`, `artifacts/audit/incident-production-20261117.json`, and provider/dashboard observations described above. No private user identifiers or credentials are committed in this report.
