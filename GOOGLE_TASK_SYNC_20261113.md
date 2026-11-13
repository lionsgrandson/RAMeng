# Automatic task synchronization to Google Calendar

The previous release displayed task dates inside RAMENG but still required manual Google event creation. That did not satisfy a task starting today appearing automatically in Google Calendar.

## Behavior

- After the workspace saves successfully, the open app synchronizes saved, authorized tasks to the signed-in user's connected primary Google Calendar. It also reconciles on opening the app, focus, reconnect, once per minute while the app remains open, and the calendar's Google sync action. No new schema, credentials or Google scopes are required.
- Start, due and follow-up dates are included. Equal dates produce one event; separate dates get separate labeled events. Without a task time, these are all-day entries. A scheduled time uses Jerusalem time and a one-hour event on the first applicable task date. Entries are marked transparent so they do not block meeting availability.
- Renames, descriptions, status, date changes, cleared dates and deleted tasks reconcile against saved server data. Workspace save failures do not trigger publication of the unsaved draft. Google failures remain visible and retryable; a task save is distinguished from successful Google synchronization. Large updates use bounded batches.
- The server rechecks organization membership and task/calendar permissions, reads the caller-filtered workspace RPC, and ignores task payloads supplied by the browser. Events have private account/organization/task markers. Only events created by this automatic sync are updated or removed; ordinary meetings and manual reminders are untouched. No attendees or invitations are added.
- Deterministic event IDs and Google ETags protect concurrent retries and stale updates. Deleted Google IDs use deterministic tombstone-derived generations when the task date returns. Google task entries are represented once in the RAMENG calendar, with a direct Google link. Change a managed entry through its RAMENG task.
- The app calendar now defaults to start, due and follow-up dates; due-only remains available as a filter.

This is one-way RAMENG-to-Google synchronization while the app is open, using each user's own connected calendar. Edits performed only in Google are not imported into task fields. Changes made while that user is absent reconcile the next time their app opens; the existing server cron is not used for task-calendar writes.

## Validation and release

Local checks: TypeScript and production build, Worker syntax/dry-run, **168 Node regressions** and **83 isolated browser scenarios**. Added tests cover start-only task creation, changed/cleared dates, duplicates/retries, concurrent/uncertain sends, deleted-ID recovery, Jerusalem time, bounded batches, partial lists, permission/account checks, saved-task reads and visible failure states.

Application source: `257e1d0f558a3489b0d9484c18ed5a52ff5d2adb`, independently verified on remote `main` and `staging` before this documentation-only evidence update.

- [Main CI 43398230374](https://github.com/lionsgrandson/RAMeng/actions/runs/43398230374) and [staging CI 43398233888](https://github.com/lionsgrandson/RAMeng/actions/runs/43398233888) both succeeded. These include the 168 regressions, database workflows, production build, dependency checks and all 83 browser scenarios.
- Staging alias: `https://staging-rameng-crm.rameng-crm-worker.workers.dev/`, Worker version `6635e17d-4902-4355-aee3-a86cf24a1816`. All **26/26** smoke checks pass, including exact HTML/static asset hashes and anonymous denial on the new sync endpoint. This remains the existing code-preview arrangement sharing the backend; no authenticated staging mutations were used for live testing.
- Production: `https://rameng-crm.rameng-crm-worker.workers.dev/`, Worker version `29343710-95a8-419c-bdfd-27a4efe2f73b`, deployed **13 November 2026 at 09:05:32 UTC / 11:05:32 Israel time**. Wrangler deployment history confirms **100%** traffic, with existing bindings and schedule retained. All **26/26** production smoke checks pass with exact deployed/build asset hashes and protected endpoint checks.
- Actual Google verification used Chrome's **r-eng.co.il / Udi** profile and a separate live app tab. Created the disposable task `QA Google start sync 20261113` in the existing QA project, with **start date 13 November**, no due date, no assignee and no recipient. The app saved it and confirmed sync. Independently opened **calendar.google.com** as **udi@r-eng.co.il** and confirmed the automatically created all-day entry on **13 November**. No manual create-in-calendar action was used.
- Changed that test task's start date to **14 November**, waited for confirmed sync, and reloaded the real Google Calendar: the entry moved to **14 November**. Cleared the task's start date and confirmed its entry disappeared from Google. Removed the disposable task after the test. No customer task was edited for this verification.
- Also observed the user's existing internal QA task in actual Google Calendar at its saved **13 November, 10:43–11:43** start time, with its separate **14 November** deadline event. Its task dates, time and content were left unchanged.
- Evidence: `artifacts/audit/google-task-start-live-20261113.png` shows the real Google Calendar event dialog; `artifacts/task-google-production-smoke.log`, `task-google-staging-smoke.log`, `task-google-deployments-verified.log`, `task-google-regressions-final.log` and `task-google-browser-final.log` contain the local release records. Evidence files are ignored by Git.

Users with an already-open RAMENG tab should refresh it once to load automatic task synchronization. The original user tabs were left untouched. No emails or attendee invitations were sent for this verification.

Rollback code: `dfff58f`; pre-change production Worker: `f384e6b2-312f-4ad8-aace-9cc942a2704d`. Rolling back code does not remove Google entries already created; those entries are explicitly marked and should be reconciled deliberately, without deleting ordinary meetings.
