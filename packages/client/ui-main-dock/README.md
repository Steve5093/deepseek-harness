---
description: "The main conversation column of the dsh web client as an IDE-style docking surface: session tabs that split into side-by-side panes."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-main-dock


## Summary

The main conversation column as one docking surface whose tabs are Sessions. Each tab renders an embedded Conversation bound to its own retained Session, so panes can show and drive different conversations side by side. It shadows the upstream Conversation panel at the `main` slot's `conversation` key with priority `-1`; the upstream entry stays mounted and keeps owning its `main.conversation` declaration.

## Table of Contents

- [What lives here, and what does not](#what-lives-here-and-what-does-not)
- [Tabs and panes](#tabs-and-panes)
- [Session binding](#session-binding)
- [Retention](#retention)
- [Copy](#copy)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="what-lives-here-and-what-does-not"></a>
## What lives here, and what does not

The split tree, its planners, the drag gestures, and the floating panels belong to `@deepseek-ai/dsh-client-ui-dockkit`. This package supplies what the kit refuses to know: what a tab's `kind` means, which Session a tab addresses, how a tab body is bound to its Session, and the strip's copy. The store holds layout plus history as plain JSON; Session references and retains never enter it.

<a id="tabs-and-panes"></a>
## Tabs and panes

One tab per Session, addressed by `contentId` = `session:<SessionId>`. Opening a Session that already has a tab focuses it instead of seating a second one. At most two docked panes: the split control hides once the surface holds two, and edge drops that would create a third pane are refused. The last docked tab never closes, so the column always shows a conversation.

<a id="session-binding"></a>
## Session binding

`main.dock.tab.body` is a keyed, session-scoped seat dispatched under entry key `session`. The renderer passes the tab id through `keyProps` and the tab's reference source through a keyed hook (`useTabReference(tabId)`), which the body resolves into an explicit `<SessionProvider session={reference}>`. The declared child `main.dock.tab.conversation` inherits that binding and renders the shared `conversation.content` factory with `variant: 'embedded'`, so each pane carries its own composer and transcript.

<a id="retention"></a>
## Retention

Every open tab holds a Session reference retained under the `mainDock` source. A new `mainView` selection (startup restore or a sidebar click) opens or focuses that Session's tab; closing a tab releases its retain, and a tab whose Session leaves the catalog closes the same way. Releasing the last reference tears the Session's local scope down, exactly as the upstream column does.

<a id="copy"></a>
## Copy

All strings come from the `mainDock` namespace dictionary and reach the kit through `dockLabels(t)`; the docking kit renders no text of its own.

<a id="model-experience"></a>
## Model Experience

The dock changes only how conversations are laid out and driven, never what a turn contains: prompts, tool calls, results, and transcripts are identical to the single-column client. Several Sessions may run at once, so a shared working directory can see concurrent tool calls from different Sessions — the same situation the sidebar chat and subagent surfaces already create. Nothing here adds, hides, or reorders model-visible input, and no token or KV-cache behavior changes.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **No per-pane conversation header.** The shadowing entry cannot render `conversation.header`, which the upstream entry declares; tab chips carry the Session title instead.
- **Tab titles are captured at open time.** A Session rename does not refresh the chip until the tab is reopened.
- **Two docked panes is the kit's architectural cap.** `DockLayout` asserts exactly one horizontal split with two cells; a third pane needs a ui-dockkit change, and a third concurrent Session runs by switching tabs.
- **Same-cwd parallel tool conflicts are unverified.** Multiple panes can issue tool calls into one directory; contention behavior is deferred to a later phase.
- **Undo/redo is not wired to the UI.** The store records history for every intent, but no control exposes it yet.
