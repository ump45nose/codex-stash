# Codex adapter selectors

The adapter is the only module that reads or clicks the Codex Desktop DOM. `stash-core` never sees a document. If a locator below stops matching, the adapter reports `broken`, the loader removes `codex-stash-v1-*` nodes, and it logs one diagnostic. It does not keep a half-mounted section and it does not fall back to `body`, generated class names, or `nth-child`.

These strings are the `codex-desktop-26.623` table in `src/selectors.js`. A unit test fails if the table and this file drift.

Verified against a live Codex Desktop renderer running under CodexHost on 2026-10-12 (zh-CN UI). See "Live DOM findings" below. Public notes these attributes came from are listed at the bottom.

## Live DOM findings (2026-10-12, Codex Desktop + CodexHost)

| Assumption | Live DOM | Adapter handling |
| --- | --- | --- |
| `aside[data-testid="app-shell-floating-left-panel"]` | absent | falls through to `aside.app-shell-left-panel` (present) |
| `data-app-action-sidebar-section="pinned"` etc. | attribute present but **empty** | key read from `data-app-action-sidebar-section-heading` on the `<section>` itself: `Pinned`, `Projects`, `Recents` (`Recents` → `recent`) |
| `[data-app-action-sidebar-section-heading]` is a heading child | it is an attribute on the section; the title row is `.group\/nav-section-title` | heading class read from `.group\/nav-section-title`, its text wrapper class, the inner `flex-col` wrapper class, and the disclosure `<svg>` are copied for presentation |
| Collapsed state | `data-app-action-sidebar-section-collapsed="true"` and toggle `aria-expanded="false"` | collapsed sections render **no thread rows** |
| Current row `[aria-current="page"]` | `aria-current="page"` sits on the 首页/home nav button, not a thread | current row is `[data-app-action-sidebar-thread-active="true"]`, then `[data-app-action-sidebar-thread-selected="true"]`; otherwise `[data-above-composer-conversation-id]` (bare UUID) |
| Row title from text | row carries `data-app-action-sidebar-thread-title` | title attribute preferred |
| Row ids | `data-app-action-sidebar-thread-id="local:<uuid>"`, plus `data-app-action-sidebar-thread-host-id` (e.g. `remote-ssh-discovered:<host>`) and `-kind="local"` | unchanged; drafts `local:client-new-thread:…` still rejected |
| Composer | `[data-codex-composer-root]`, `[data-thread-scroll-footer="true"]`, `.ProseMirror` all present | unchanged |

Because collapsed sections render no rows, a stash row whose thread is not currently rendered is **not disabled**. `openThread` expands each collapsed native section in turn, waits up to 600 ms for the row, clicks it, and collapses the section again.


## Version table

| Table id | Layout | What has to be true |
| --- | --- | --- |
| `codex-desktop-26.623` | Sidebar column after the 26.623 chrome change, including a CodexHost session rendered in that same sidebar | Scroll or sidebar landmark exists, and either section attributes or thread-id attributes exist |

There is no second table yet. A future Codex layout gets a new id rather than a silent tweak of this one.

## Landmarks

Preferred order, from Codexion's locator rules (MIT, `docs/EXTENSIONS.md`): ARIA and structure first, then stable data attributes. Local class tokens are supporting evidence only.

| Role | Selector |
| --- | --- |
| Sidebar, first | `aside[data-testid="app-shell-floating-left-panel"]` |
| Sidebar, second | `aside.app-shell-left-panel` |
| Sidebar, third | `[data-pip-obstacle="app-shell-floating-left-panel"] aside` |
| Scroll container | `[data-app-action-sidebar-scroll]` |
| App shell (probe only) | `[data-app-shell-main-content-layout]` |

`aside.app-shell-left-panel` is a stable shell class token, not a generated CSS-module hash. It is only used after the `data-testid` lookup misses.

## Sections

Native sections expose:

| Piece | Selector |
| --- | --- |
| Section root | `[data-app-action-sidebar-section]` |
| Heading row | `[data-app-action-sidebar-section-heading]` |
| Collapse control | `[data-app-action-sidebar-section-toggle]` |
| Section key attributes, in order | `data-app-action-sidebar-section`, `data-app-action-sidebar-section-heading` |
| Collapsed flag | `data-app-action-sidebar-section-collapsed` |
| Title row (presentation donor) | `.group\/nav-section-title` |

Known `data-app-action-sidebar-section` values, used only to pick a style donor and an insert slot: `pinned`, `projects`, `recent`, `chats`, `threads`, `cloud`.

The adapter does **not** look for the localized words 置顶, 项目, or 最近. Those strings change with the UI language. The stash section is inserted after `pinned` when that section exists, otherwise before the first native section.

Style matching copies `className` and tag names off the donor section at runtime. The copy is presentation. It is not a locator.

Our own section never sets `data-app-action-sidebar-section`, so Codex's React tree does not own it. The node id prefix is `codex-stash-v1-`.

## Thread identity

| Piece | Selector or attribute |
| --- | --- |
| Row container | `[data-app-action-sidebar-thread-row]` |
| Stable id | `data-app-action-sidebar-thread-id` |
| Active row | `[data-app-action-sidebar-thread-active="true"]` |
| Selected row (attr) | `[data-app-action-sidebar-thread-selected="true"]` |
| Title | `data-app-action-sidebar-thread-title` |
| Current row | `[aria-current="page"]` |
| Selected row | `[aria-selected="true"]` |
| Pin state, read-only | `data-app-action-sidebar-thread-pinned` |
| Project row, not used for stash | `[data-app-action-sidebar-project-row]` |
| Project id, not used for stash | `data-app-action-sidebar-project-id` |

Current-thread order:

0. `[data-app-action-sidebar-thread-active="true"]`, then `[data-app-action-sidebar-thread-selected="true"]`.
1. The `[aria-current="page"]` node, or the thread row that contains it.
2. The same walk for `[aria-selected="true"]`.
3. `[data-above-composer-conversation-id]` on the above-composer portal.
4. A `/local/<id>` segment in `location.pathname` or `location.hash`.

The attribute value is often `local:<id>`. The id stored by stash-core is the part after `local:`. `local:client-new-thread:…` is a draft and is not stashable. A row's visible title is never parsed into an id. `openThread` clicks the row that already carries the id. It does not write `data-app-action-sidebar-thread-pinned`, does not archive, and does not remove the native row. If the id is not in the sidebar, the call returns `not-in-sidebar`.

## Composer (auto-unstash)

A user send is detected only inside a composer landmark:

| Landmark | Selector |
| --- | --- |
| Composer root | `[data-codex-composer-root]` |
| Sticky footer, plus the editor | `[data-thread-scroll-footer="true"]` containing `.ProseMirror, textarea, [contenteditable="true"]` |

Enter without Shift or Alt counts as send. A button counts only when its accessible name matches `send` or `发送` and does not match `feedback` or `反馈`. If neither composer landmark exists, keyboard and click detection stay off. That is fail-closed, not a guess.

Optional events other mods can dispatch on `window`, with `detail.threadId` set to the stable id (not the title):

- `codex-stash:user-message`
- `codexhost:user-message` (the hook requested in BytePioneer-AI/codex-host#526; ignored until a real `threadId` is present)

## Health

| Status | Meaning | Loader |
| --- | --- | --- |
| `healthy` | Sidebar landmark plus at least one section or thread id | Mount or refresh the stash section |
| `loading` | Landmark exists, rows have not painted (fewer than two native buttons/links) | Wait, keep the observer |
| `no-window` | This document is not the main renderer | Do not mount |
| `broken` | Shell or sidebar is clearly up, but the attributes in this table are gone | Remove our nodes, log once, watch for recovery |

`broken` is also used when the app shell exists and both sidebar selectors missed. Recovery is automatic if a later mutation makes `probe()` healthy again.

## CodexHost

CodexHost injects into the same renderer over CDP and can place harness sessions in the native sidebar. This adapter:

- mounts only under the scroll container or sidebar landmark above
- never removes a node whose id does not start with `codex-stash-v1-`
- treats a harness thread as stashable only when `data-app-action-sidebar-thread-id` (or the route / portal fallbacks) yields a stable id
- opens that thread by clicking its row, not by synthesizing a route
- ignores extra CodexHost nodes when the attributes in this table are still present

A CodexHost build that drops `data-app-action-sidebar-thread-id` without a replacement will fail closed (`broken`) rather than keying off the title. Add a new table id when a documented replacement attribute exists.

## What a real Codex Desktop install still has to confirm

- The 26.623 attribute names on the build you run, including after a CodexHost sidebar pass
- Whether `aria-current="page"` sits on the row or on a child
- Whether Enter sends in the harness composer the same way it sends in the native composer
- Whether clicking the row is enough for Codex's in-memory router
- Whether a collapsed or hover-peek sidebar removes the landmarks (`loading` / `broken` until it returns)

## References

- Explodex `docs/codex-architecture.md` (no license — attribute names only, no code copied)
- Codex App HUD `src/injector/README.md` (MIT) — active thread probe and `local:` prefix
- Codexion `docs/EXTENSIONS.md` (MIT) — locator order and fail-closed disable
