# Inbox entry points and reachable page bottoms

The earlier compact-composer correction did not expose New Email outside projects, and Reply still followed the full message history. This release fixes those entry points and removes the extra fixed-height scrolling panel around opened messages.

- Inbox header: **מייל חדש** opens an unassigned new message. Project mail retains **מייל חדש בפרויקט**. The shared composer, native recipient/subject validation, draft storage and send permission checks remain in use.
- Opened message: **תשובה להתכתבות** and **חזרה לרשימת המיילים** are in a sticky action strip above message content. Back restores the existing list and filters; it does not discard the stored draft. Message history now follows normal page scrolling, including its final image/attachment actions, rather than being confined to a 75vh panel. The list itself retains its intentional scroll area.
- The broad `.card strong, .card p, .card small, .card span, .data-table td, .data-table th { overflow-wrap:anywhere }` rule is removed. Table cells use normal break-word behavior; existing targeted handling for filenames, email content and identifiers is retained. Page bottom padding includes the safe-area inset.
- Modal and mobile-menu scroll locks share ownership accounting. Closing overlapping overlays cannot restore a stale hidden body overflow. Resizing an open mobile menu to desktop closes the hidden menu and releases its scroll lock.
- The compact composer accounts for the app header and mail-action strip when positioning itself and calculating available height. Reply opens immediately at the composer without waiting for a smooth-scroll animation.

QA covers composing/sending a synthetic unassigned new message, reading a long received message with its image action fully visible at the page bottom, sticky Reply/Back, returning to the list, and menu-to-desktop scroll recovery. Existing compact reply checks cover six viewport sizes, long typed replies, resize, minimize/expand and send failures. No live recipient needs to be contacted for this UI correction.

Final release identifiers, CI results and live checks are recorded below after verification.
