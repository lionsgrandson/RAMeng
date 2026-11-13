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

Final test and deployment results are recorded after execution below.
