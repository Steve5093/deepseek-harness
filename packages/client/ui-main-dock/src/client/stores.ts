/**
 * Main dock store: the conversation column's session tabs as one docking
 * surface. Layout and history live here as plain JSON, so the docking kit's
 * pure functions are the only thing that ever computes a layout; session
 * retention and tab-to-session identity stay in the plugin's service layer,
 * which keeps the store JSON-safe.
 *
 * One surface, not one per session: the surface IS the column. Its tabs are
 * sessions, and panes split tabs into side-by-side conversations.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type {
  DockMode, DockZone, FloatRect, History, LayoutOp, LayoutState, Mint, PaneId, SplitId, TabId, TabRecord,
} from '@deepseek-ai/dsh-client-ui-dockkit'
import {
  canSplit, createInitialState, dockPaneIds, EMPTY_HISTORY, findTabPane, getPane, planDropTab,
  planFloatTab, planOpenContent, planPlaceTab, planResizeSplit, planSetExpanded, planSetMode,
  planSettle, planSplitPane, planUnfloatPane, record, replay, stepBack, stepForward,
} from '@deepseek-ai/dsh-client-ui-dockkit'

/** Main dock tab records: kind names the session, contentId carries the id. */
export const SESSION_TAB_KIND = 'session'
export const sessionAddress = (sessionId: string): string => `session:${sessionId}`
export const sessionRecord = (id: TabId, sessionId: string, title: string): TabRecord => ({
  id, kind: SESSION_TAB_KIND, contentId: sessionAddress(sessionId), title,
})

/** The empty placeholder a split seeds when no other tab can fill the new pane. */
export const BLANK_TAB_KIND = 'blank'
export const BLANK_TAB_ADDRESS = 'blank:placeholder'

/** One surface's plain state: layout, history, and the id counter position. */
export interface MainDockState {
  readonly layout: LayoutState
  readonly history: History
  /** How many ids this surface has minted; carried so replay stays reproducible. */
  readonly minted: number
}

/** A planner call: surface and mint in, operations out. */
type SurfacePlan = (state: LayoutState, mint: Mint, makeTab: (id: TabId) => TabRecord) => readonly LayoutOp[]

/** A mint that counts, so the surface can carry its position forward. */
function counting(from: number): { mint: Mint; used: () => number } {
  let counter = from
  const mint = ((prefix: string): string => {
    counter += 1
    return `${prefix}${counter}`
  }) as Mint
  return { mint, used: () => counter }
}

/** The surface the dock starts with: one pane, expanded, no tabs. */
export function createMainDockState(): MainDockState {
  const counter = counting(0)
  return {
    layout: { ...createInitialState({ next: counter.mint }), expanded: true },
    history: EMPTY_HISTORY,
    minted: counter.used(),
  }
}

/**
 * Run one planner against the surface, settle what it left behind, and record
 * the whole intent as one history entry.
 * @param surface - current surface.
 * @param plan - the kit planner to consult.
 * @param makeTab - the tab factory the settle planner seeds empty panes with.
 * @returns the next surface, or the same one when the intent changes nothing.
 */
function advance(surface: MainDockState, plan: SurfacePlan, makeTab: (id: TabId) => TabRecord): MainDockState {
  const counter = counting(surface.minted)
  const planned = plan(surface.layout, counter.mint, makeTab)
  if (planned.length === 0) return surface
  const after = replay(surface.layout, planned)
  const settled = planSettle(after, counter.mint, after.expanded ? makeTab : undefined)
  const stepped = record(surface.history, surface.layout, [...planned, ...settled])
  return { layout: stepped.state, history: stepped.history, minted: counter.used() }
}

/**
 * Whether the tab stands alone on the docked surface: its pane is the sole
 * docked pane and holds nothing else. The last conversation tab never closes
 * (that would leave the column without a conversation), so callers guard on
 * this before planning a close.
 * @param state - current layout.
 * @param tabId - the tab asked about.
 */
export function isSoleDockedTab(state: LayoutState, tabId: TabId): boolean {
  const pane = findTabPane(state, tabId)
  return pane.host === 'dock' && pane.tabs.length === 1 && dockPaneIds(state).length === 1
}

/** Whether a tab may close: present, and not the docked surface's last tab. */
export function canCloseMainTab(state: MainDockState, tabId: TabId): boolean {
  const tab = state.layout.tabs[tabId]
  return tab !== undefined && !isSoleDockedTab(state.layout, tabId)
}

/** Build the tab record for one session tab id. */
function sessionTabFor(id: TabId, sessionId: string, title: string): TabRecord {
  return sessionRecord(id, sessionId, title)
}

/** Declared write set; each entry is one settled intent. */
type MainDockActions = {
  /** Seat a session tab; a tab already showing the session focuses instead. */
  openSession: (draft: MainDockState, sessionId: string, title: string) => void
  /** Sync the layout's tabs with the retained session set; closes gone sessions. */
  reconcile: (draft: MainDockState, keep: ReadonlySet<string>) => void
  closeTab: (draft: MainDockState, tabId: TabId) => void
  focusTab: (draft: MainDockState, tabId: TabId) => void
  focusPane: (draft: MainDockState, paneId: PaneId) => void
  splitPane: (draft: MainDockState, paneId?: PaneId) => void
  placeTab: (draft: MainDockState, tabId: TabId, toPaneId: PaneId, index: number) => void
  dropTab: (draft: MainDockState, tabId: TabId, paneId: PaneId, zone: DockZone) => void
  floatTab: (draft: MainDockState, tabId: TabId, rect?: FloatRect) => void
  unfloatPane: (draft: MainDockState, paneId: PaneId) => void
  moveFloat: (draft: MainDockState, paneId: PaneId, x: number, y: number) => void
  resizeFloat: (draft: MainDockState, paneId: PaneId, rect: FloatRect) => void
  resizeSplit: (draft: MainDockState, splitId: SplitId, sizes: readonly number[]) => void
  setExpanded: (draft: MainDockState, expanded: boolean) => void
  setMode: (draft: MainDockState, mode: DockMode) => void
  undo: (draft: MainDockState) => void
  redo: (draft: MainDockState) => void
}

/**
 * Plan opening a session tab: an existing tab for the session focuses it;
 * otherwise the kit opens the tab into the active pane.
 */
function planOpenSession(state: LayoutState, mint: Mint, sessionId: string, title: string): { ops: readonly LayoutOp[]; tabId: TabId } {
  const existing = Object.values(state.tabs).find(tab => tab.contentId === sessionAddress(sessionId))
  if (existing !== undefined) return { ops: [{ type: 'focusTab', tabId: existing.id }], tabId: existing.id }
  const opened = planOpenContent(state, mint, {
    kind: SESSION_TAB_KIND, contentId: sessionAddress(sessionId), title,
  })
  return { ops: opened.ops, tabId: opened.tabId }
}

/** Focus a tab: nothing to plan while it is its pane's active tab and its pane is the active one. */
function planFocusTab(state: LayoutState, tabId: TabId): readonly LayoutOp[] {
  const pane = findTabPane(state, tabId)
  return pane.activeTabId === tabId && state.activePaneId === pane.id ? [] : [{ type: 'focusTab', tabId }]
}

/** Focus a pane: nothing to plan while it is the active one. */
function planFocusPane(state: LayoutState, paneId: PaneId): readonly LayoutOp[] {
  return state.activePaneId === paneId ? [] : [{ type: 'focusPane', paneId }]
}

/** One direction through the recorded sequence. */
type HistoryStepper =
  (history: History, state: LayoutState) => { history: History; state: LayoutState } | undefined

/** Step a surface through the history in one direction. */
function stepped(surface: MainDockState, step: HistoryStepper): MainDockState {
  const moved = step(surface.history, surface.layout)
  return moved === undefined ? surface : { ...surface, layout: moved.state, history: moved.history }
}

/**
 * Create the main dock store handle.
 * @returns the handle (spec, type, identity, and factory in one).
 */
export function createMainDockStore(): EngineStoreHandle<MainDockState, MainDockActions> {
  const handle = defineStore<MainDockState, MainDockActions>({
    init: createMainDockState,
    actions: {
      openSession: (d, sessionId, title) => {
        const next = advance(d, (state, mint) => planOpenSession(state, mint, sessionId, title).ops,
          id => sessionTabFor(id, sessionId, title))
        if (next !== d) Object.assign(d, next)
      },
      reconcile: (d, keep) => {
        const closable = Object.values(d.layout.tabs)
          .filter(tab => !keep.has(tab.contentId.slice(SESSION_TAB_KIND.length + 1)))
          .filter(tab => !isSoleDockedTab(d.layout, tab.id))
        if (closable.length === 0) return
        const next = advance(d, () => closable.map(tab => ({ type: 'closeTab', tabId: tab.id })), () => {
          throw new Error('main dock reconcile must never seed: it never closes the sole docked tab')
        })
        if (next !== d) Object.assign(d, next)
      },
      closeTab: (d, tabId) => {
        const next = advance(d, () => canCloseMainTab(d, tabId) ? [{ type: 'closeTab', tabId }] : [],
          () => {
            throw new Error('main dock close must never seed: closing the last tab is refused')
          })
        if (next !== d) Object.assign(d, next)
      },
      focusTab: (d, tabId) => {
        const next = advance(d, state => planFocusTab(state, tabId), () => {
          throw new Error('main dock focus must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      focusPane: (d, paneId) => {
        const next = advance(d, state => planFocusPane(state, paneId), () => {
          throw new Error('main dock focus must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      splitPane: (d, paneId) => {
        const next = advance(d, (state, mint) => {
          const target = paneId ?? state.activePaneId
          if (!canSplit(state)) return []
          const source = getPane(state, target)
          if (source.tabs.length === 0) return []
          // An idle sibling tab fills the new pane; otherwise the split seeds
          // a blank placeholder, and the settle rule keeps the pane alive.
          // The split axis alternates against the pane's parent split so the
          // button walks the surface toward an even grid: a pane inside a
          // horizontal run splits vertically, and a single pane splits
          // horizontally.
          const moved = source.tabs.find(id => id !== source.activeTabId)
          const parent = Object.values(state.nodes).find(
            node => node.kind === 'split' && node.children.includes(target),
          )
          const axis = parent?.kind === 'split' && parent.axis === 'row' ? 'column' : 'row'
          const ops = planSplitPane(state, mint, target, undefined, axis)
          if (moved !== undefined) {
            const split = ops[0] as Extract<LayoutOp, { type: 'split' }>
            return [...ops, { type: 'moveTab', tabId: moved, toPaneId: split.newPaneId, index: 0 }]
          }
          return planSplitPane(state, mint, target, id => ({
            id, kind: BLANK_TAB_KIND, contentId: BLANK_TAB_ADDRESS, title: '',
          }), axis)
        }, () => {
          throw new Error('main dock split must never seed a session tab')
        })
        if (next !== d) Object.assign(d, next)
      },
      placeTab: (d, tabId, toPaneId, index) => {
        const next = advance(d, state => planPlaceTab(state, tabId, toPaneId, index), () => {
          throw new Error('main dock place must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      dropTab: (d, tabId, paneId, zone) => {
        const next = advance(d, (state, mint, makeTab) =>
          planDropTab(state, mint, tabId, paneId, zone, makeTab), () => {
          throw new Error('main dock drop must never seed: a moved tab already carries its session')
        })
        if (next !== d) Object.assign(d, next)
      },
      floatTab: (d, tabId, rect) => {
        const next = advance(d, (state, mint) => planFloatTab(state, mint, tabId, rect).ops, () => {
          throw new Error('main dock float must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      unfloatPane: (d, paneId) => {
        const next = advance(d, (state) => {
          const floated = getPane(state, paneId).tabs[0]
          return floated === undefined ? [] : planUnfloatPane(state, paneId)
        }, () => {
          throw new Error('main dock unfloat must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      moveFloat: (d, paneId, x, y) => {
        const next = advance(d, () => [{ type: 'moveFloat', paneId, x, y }], () => {
          throw new Error('main dock move must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      resizeFloat: (d, paneId, rect) => {
        const next = advance(d, () => [{ type: 'resizeFloat', paneId, rect }], () => {
          throw new Error('main dock resize must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      resizeSplit: (d, splitId, sizes) => {
        const next = advance(d, () => planResizeSplit(splitId, sizes, 0.2), () => {
          throw new Error('main dock resize must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      setExpanded: (d, expanded) => {
        const next = advance(d, state => planSetExpanded(state, expanded), () => {
          throw new Error('main dock collapse must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      setMode: (d, mode) => {
        const next = advance(d, state => planSetMode(state, mode), () => {
          throw new Error('main dock mode must never seed')
        })
        if (next !== d) Object.assign(d, next)
      },
      undo: (d) => {
        const next = stepped(d, stepBack)
        if (next !== d) Object.assign(d, next)
      },
      redo: (d) => {
        const next = stepped(d, stepForward)
        if (next !== d) Object.assign(d, next)
      },
    },
  })
  return handle
}
