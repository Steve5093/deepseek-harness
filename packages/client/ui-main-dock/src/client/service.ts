/**
 * Main dock service: the session-tab surface's write path and retention.
 *
 * The framework mints the store instance when the seat mounts, so the service
 * never calls create() itself: index.ts wraps the handle's create() and adopts
 * every minted root instance here. Until the first adoption no surface is
 * mounted, and every write is a no-op. Store and Session Controller live in
 * different layers, so this owner moves every tab state change across them:
 * opening a tab retains the Session under the `mainDock` source, closing
 * releases it, and each tab's body resolves its live reference through a keyed
 * hook keyed by tab id.
 *
 * Sidebar navigation drives the dock: a new `mainView` selection (ui-workspace's
 * startup restore or a sidebar click) opens that Session's tab, focusing the
 * existing tab when it is already open. Tabs whose Session left the catalog
 * close. The upstream Conversation keeps its own flow untouched.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { createMainDockStore } from './stores.ts'

/** The framework-minted root instance's type, with its baked actions. */
type DockInstance = ReturnType<MainDockStoreHandle['create']>

/** One keyed-hook source resolving a tab's Session reference. */
export type ReferenceSource = HostObservable<SessionReference | undefined>

/** The main dock store handle whose framework-minted instances this service adopts. */
export type MainDockStoreHandle = ReturnType<typeof createMainDockStore>

/** The service face: every side effect the dock's tabs need. */
export interface MainDockService {
  /** Adopt the framework-minted root store instance; supersedes the previous one. */
  adopt(instance: DockInstance): void
  /** Open a Session into the dock: focus its tab, or seat a new one. */
  openSession(sessionId: SessionId): void
  /** Resolve a tab's Session reference source, keyed by tab id. */
  referenceSource(tabId: string): ReferenceSource
  /** Close one tab and release its Session retain. */
  closeTab(tabId: TabId): void
  /** Start a fresh Session through the workspace flow. */
  startSession(): void
  /** Publish (or clear with undefined) the transient handoff status line. */
  notifyHandoff(text?: string): void
  /** Dispose the service and release every retained Session. */
  dispose(): void
}

/**
 * Create the retention controller and store-write gateway for the dock.
 * @param ctx - client root context.
 * @param sessions - Session Controller.
 * @param storeHandle - main dock store handle; instances arrive via adopt().
 */
export function createMainDockService(
  ctx: Context,
  sessions: ISessions,
  storeHandle: MainDockStoreHandle,
): MainDockService {
  void storeHandle
  let instance: DockInstance | undefined
  const retained = new Map<SessionId, SessionReference>()
  const references = new Map<string, SnapshotStore<SessionReference | undefined>>()
  let currentMain: SessionId | undefined

  const tabs = (): readonly { id: TabId; contentId: string }[] =>
    instance === undefined ? [] : Object.values(instance.getSnapshot().layout.tabs)

  const sessionOfTab = (tabId: string): SessionId | undefined => {
    const tab = tabs().find(entry => entry.id === tabId)
    if (tab === undefined || !tab.contentId.startsWith('session:')) return undefined
    return tab.contentId.slice('session:'.length) as SessionId
  }

  const tabOfSession = (sessionId: SessionId): TabId | undefined =>
    tabs().find(entry => entry.contentId === `session:${sessionId}`)?.id

  const publishReference = (tabId: string): void => {
    const source = references.get(tabId)
    if (source === undefined) return
    const sessionId = sessionOfTab(tabId)
    source.set(sessionId === undefined ? undefined : retained.get(sessionId))
  }

  const referenceSource = (tabId: string): ReferenceSource => {
    const existing = references.get(tabId)
    if (existing !== undefined) return existing
    const source = createSnapshotStore<SessionReference | undefined>(undefined)
    references.set(tabId, source)
    publishReference(tabId)
    return source
  }

  const releaseReference = (sessionId: SessionId): void => {
    const reference = retained.get(sessionId)
    if (reference === undefined) return
    retained.delete(sessionId)
    for (const tabId of references.keys()) {
      if (sessionOfTab(tabId) === sessionId) publishReference(tabId)
    }
    reference.release()
  }

  const openSession = (sessionId: SessionId): void => {
    if (instance === undefined) return
    const open = tabOfSession(sessionId)
    if (retained.has(sessionId)) {
      if (open !== undefined) instance.actions.focusTab(open)
      return
    }
    const reference = sessions.retain(sessionId, { source: 'mainDock' })
    retained.set(sessionId, reference)
    const title = sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? sessionId
    instance.actions.openSession(sessionId, title)
    const opened = tabOfSession(sessionId)
    if (opened !== undefined) publishReference(opened)
  }

  const closeTab = (tabId: TabId): void => {
    if (instance === undefined) return
    const sessionId = sessionOfTab(tabId)
    instance.actions.closeTab(tabId)
    // The sole-docked-tab guard refuses the close; release only on a real removal.
    if (sessionId === undefined || tabOfSession(sessionId) !== undefined) return
    releaseReference(sessionId)
    if (currentMain === sessionId) currentMain = undefined
  }

  const sync = (): void => {
    const list = sessions.list.getSnapshot()
    // Catalog removals close their tabs (the sole-docked-tab guard keeps one).
    for (const tab of tabs()) {
      const sessionId = sessionOfTab(tab.id)
      if (sessionId !== undefined && list.byId[sessionId] === undefined) closeTab(tab.id)
    }
    // A new main-view selection opens (or focuses) its tab.
    const mainView = list.ids
      .map(id => list.byId[id])
      .find(summary => summary !== undefined && (summary.retainedBy.mainView ?? 0) > 0)?.id
    if (mainView === undefined || mainView === currentMain) return
    currentMain = mainView
    openSession(mainView)
  }

  sync()
  const disposeList = sessions.list.subscribe(sync)

  return {
    adopt: (next) => {
      instance = next
      // Re-publish every live source against the new instance's layout.
      for (const tabId of references.keys()) publishReference(tabId)
      // Tabs rehydrated from persistence have no retention yet; sync also
      // guards the catalog sweep against the pending list.
      sync()
    },
    openSession,
    referenceSource,
    closeTab,
    startSession: () => { ctx.uiWorkspace.startSession() },
    notifyHandoff: (text) => { instance?.actions.notifyHandoff(text) },
    dispose: () => {
      disposeList()
      for (const sessionId of [...retained.keys()]) releaseReference(sessionId)
    },
  }
}
