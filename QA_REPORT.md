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
