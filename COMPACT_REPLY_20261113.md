# Reachable Send action in compact email composers

## Correction

Send was below the recipient, subject, formatting toolbar, message body and attachment controls. In inbox threads, that composer also followed potentially long message history inside a separate scrolling panel. Short screens could leave Send far below the visible editing area.

The shared email composer now places its single Send action in the top action bar. Fields, editor and attachments scroll within a bounded content area; the header and draft/delivery feedback remain outside that scrolling content. Opening a reply brings the composer into view, and the inbox's message toolbar no longer overlaps it while composing. The height follows the available visual viewport, including resize events. Minimizing retains the draft and hides Send until the composer is expanded again.

The send handler, native recipient/subject validation, thread IDs, permissions, draft queue and attachments are reused. No live email send is needed to verify this layout change.

## Where the contextual profession controls are located

These existing changes remain included in this release:

1. Open a project → tab **תחומי עבודה בפרויקט** → expand **בחירת תחומי עבודה לפרויקט**. Existing checkboxes explicitly say **שיוך לפרויקט זה**.
2. **כל המשימות** → expand **ניהול תחומי עבודה (מקצועות)** above the task filters. The new-name field includes examples such as electricity, architecture and structural engineering. In project tasks, the same control uses the project-specific heading.
3. Inbox/project email thread → the optional classification field is labeled **סיווג ההתכתבות לפי תחום עבודה (אופציונלי)**.

## QA and deployment evidence

Seven added isolated browser scenarios exercise 320×568, 390×664, 390×360, 768×600, 1366×650 and 1920×600 screens with a long received message and a long reply. Checks assert that Send is inside the viewport and is not covered, before and after editor scrolling; resize and minimize/expand retain the draft. A failed send keeps its error visible and preserves retry availability. Synthetic sends verify the original thread and body. No real recipient is contacted by these checks.

- Application source: `51b1ad059e203c951df69489df46812f6dd0d90a`, pushed and independently checked on remote `main` and `staging` before this evidence-only update. No schema migration or backend behavior change is needed.
- TypeScript, production and preview builds, Worker dry-run and whitespace checks pass. **168/168** Node regressions and **90/90** isolated browser scenarios pass. Seven of the browser scenarios specifically cover this correction.
- [Main CI 43403812367](https://github.com/lionsgrandson/RAMeng/actions/runs/43403812367) and [staging CI 43403815142](https://github.com/lionsgrandson/RAMeng/actions/runs/43403815142) both succeeded, including database workflows, dependency checks, build, regressions and browser QA.
- Production Worker: `ef80edd1-ac7f-4bb9-b3c5-d6f56f0401c4`, deployed **13 November 2026 at 09:45:40 UTC / 11:45:40 Israel time**. Deployment history confirms **100%** traffic on this version, with existing bindings and schedule retained. [Live](https://rameng-crm.rameng-crm-worker.workers.dev/) passes **26/26** smoke checks; every served HTML/static asset matches the production build by hash.
- Staging Worker version: `1d70cc34-bbbe-464f-bd02-71ec932c2626`, available at the existing [staging alias](https://staging-rameng-crm.rameng-crm-worker.workers.dev/). Its preview build passes **26/26** smoke checks, including exact served/build hashes. This remains the existing code-preview environment sharing the backend.
- Live Udi-profile UI verification used a separate tab and the existing QA email thread. The new Send button was visibly inside the viewport and not covered at **390×664** (top 268px, bottom 303px), **390×360** (bottom 303px), and **1366×650** (bottom 415px). No live message was sent or typed for this layout check. The browser viewport was restored afterward; original user tabs were left untouched.
- Independently opened the existing QA project in the live app, selected **תחומי עבודה בפרויקט**, expanded **בחירת תחומי עבודה לפרויקט**, and confirmed the contextual new-name examples and **שיוך לפרויקט זה** checkboxes. No profession value or project association was edited.
- Local evidence (ignored by Git): `artifacts/audit/compact-reply-live-phone-20261113.png`, `profession-control-location-20261113.png`, `reply-send-320x568.png` and the other responsive screenshots. Logs: `artifacts/compact-reply-browser-final.log`, `compact-reply-regressions.log`, `compact-reply-production-smoke.log`, `compact-reply-staging-smoke.log`, and `compact-reply-deployments-verified.log`.

Users with an already-open tab should refresh RAMENG once to load the new composer. The evidence update changes documentation only; deployed application code remains `51b1ad0`.

Rollback: pre-change Git commit `cd93817`, production Worker `29343710-95a8-419c-bdfd-27a4efe2f73b`. Existing drafts and later customer data should not be rolled back for a UI layout issue.
