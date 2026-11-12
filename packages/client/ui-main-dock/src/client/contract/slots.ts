/**
 * Slot declarations owned by the main dock: the `main` key shadowing the
 * conversation panel, and its session-scoped tab-body seats.
 *
 * `main` is declared keyed/root by ui-layout; this package contributes the
 * `conversation` key at priority -1 (below the default 0) so it shadows the
 * upstream ConversationPanel while that entry stays mounted to keep its
 * `main.conversation` child declaration alive.
 *
 * The dock's tab bodies render through `main.dock.tab.body` (one entry keyed
 * `session`), which receives the tab id through keyProps and resolves its
 * Session reference through a keyed hook keyed by tab id. The body declares
 * `main.dock.tab.conversation` so the framework hands it the SessionProvider
 * seat; that child inherits the explicit binding and renders the shared
 * embedded Conversation.
 */
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Keyed seat for one session tab's conversation body, under an explicit
     * Session binding established by the dock's SessionProvider.
     */
    'main.dock.tab.body': {
      kind: 'keyed'
      scope: 'session'
      keyProps: { session: { tabId: TabId } }
    }
    /**
     * One tab's embedded Conversation, inheriting the tab body's explicit
     * Session binding.
     */
    'main.dock.tab.conversation': {
      kind: 'single'
      scope: 'session'
    }
  }
}

/** One tab body's injected keyed reference resolvers. */
export interface MainDockTabBodyInjected {
  keyedHooks: {
    /** One tab's Session reference source, keyed by tab id. */
    tabReference: (key: string) => HostObservable<SessionReference | undefined> | undefined
  }
}

/** What this package injects into its `main` entry. */
export interface MainDockInjected {
  /** Close one tab and release its Session retain. */
  closeTab(tabId: TabId): void
  /** Start a fresh Session through the workspace flow (the strip's add control). */
  startSession(): void
}
