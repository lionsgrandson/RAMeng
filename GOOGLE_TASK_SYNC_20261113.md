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

Production, staging, remote CI and actual Google Calendar evidence are recorded after execution below. Local fixture success alone is not Google Calendar verification.
