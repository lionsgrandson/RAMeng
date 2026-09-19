# UX/UI audit — two-pass review

Date: 2026-09-20

## Scope

Reviewed the React CRM's overview, global navigation/search, client records, projects, tasks, calendar, files, reports, read-only permissions, keyboard behavior, and responsive styles. Pass 1 mapped the most common journeys and dead ends. Pass 2 traced each destination, permission, and state transition after the changes.

This was a code-level workflow audit with a production build. An authenticated visual/browser end-to-end run was not possible: the browser integration blocked both `localhost` and `127.0.0.1` with `ERR_BLOCKED_BY_CLIENT`. No production data or integrations were modified for testing.

## Findings and resolution

| Finding | User impact | Resolution |
| --- | --- | --- |
| Dashboard totals were display-only and common creation required another page. | Users had to decide where to go before doing anything. | Totals now open their views; permitted users have one-click new client, project, task, report, and event actions. |
| “Needs attention” was split between the dashboard and task board. | Urgent work was easy to miss. | The dashboard and bell use the same urgent-task definition and lead to the existing attention-filtered task view. Attention rows open the exact task or report item. |
| Global search omitted reports and had no arrow-key selection. | Search took extra clicks and keyboard users lacked a clear path. | Added report results, arrow-key navigation, Enter activation, and a visible active suggestion. |
| Related records were hard to reach from list/detail views. | Users had to remember a project or task name and search again. | Added contextual paths between projects and clients, tasks and projects, calendar events and their project/task, files and their project/task, and reports and their project. Existing secure file-link behavior is retained. |
| Page/record navigation lived only in React state. | Browser Back, refresh, and copied links lost context. | An `#app?` route now records the page and selected client, project/tab, task, report/item, or attention view. Browser history restores those destinations. |
| Default Google Calendar creation could fail when integration was not connected. | A simple local event produced an avoidable error. | Local events are the default; Google creation is an explicit opt-in. Existing sync association preservation remains intact. |

## Second-pass verification

- Checked quick-action visibility against the granular edit permissions already on `main`.
- Checked that project/client switching clears stale task, report, and attention state; selected records are represented in the URL.
- Checked the task active/archive focus and attention filtering, report-item deep links, project tab restoration, and contextual links.
- Checked new controls against existing focus styles and mobile wrapping rules.
- `npm run build` and `git diff --check` passed. Vite still reports the existing large-bundle advisory.

## Live acceptance checks still needed

With an authenticated test account, verify at desktop and phone widths: create each record from the overview; open attention/search results; move between project and client; use browser Back, refresh, and a copied URL; test the bell and attention filter; open an event/file's related records; and repeat with a read-only account. These require an authenticated browser session and are not claimed as passed here.
