/**
 * Browser half: fill the frame's main column with a docking surface whose
 * tabs are Sessions. Each tab renders an embedded Conversation bound to its
 * retained Session; panes split tabs into side-by-side conversations.
 *
 * The seat registers at the `main` slot's `conversation` key with priority -1,
 * shadowing the upstream ConversationPanel (which stays mounted and owns the
 * `main.conversation` declaration). Session retention is this package's own:
 * every tab holds a `mainDock` reference released on close, and a new
 * main-view selection seats or focuses its tab.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from './contract/slots.ts'
import type {} from './contract/source.ts'
import { MainDockSeat } from './components/MainDockSeat.tsx'
import { SessionConversation, SessionTabBody } from './components/SessionTabBody.tsx'
import { createMainDockService, type MainDockService } from './service.ts'
import { createMainDockStore } from './stores.ts'
import { en, zh } from './locales.ts'

export type { MainDockInjected, MainDockTabBodyInjected } from './contract/slots.ts'
export type { MainDockSeatProps, MainDockSeatStoreProps } from './components/MainDockSeat.tsx'
export type { SessionTabBodyProps, SessionConversationProps } from './components/SessionTabBody.tsx'
export type { MainDockState } from './stores.ts'
export type { MainDockService } from './service.ts'
export type { MainDockKey } from './locales.ts'

/** This package's copy namespace. */
const NS = 'mainDock'

/** Required browser services. */
export const inject = ['slots', 'locale', 'sessions', 'uiSession', 'uiWorkspace']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Main-dock navigation and retention face. */
    mainDock: MainDockService
  }
}

/**
 * Client plugin body: drive one root store instance, retain Sessions per tab,
 * and register the dock seat plus its tab seats.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.get('sessions') as ISessions
  const created = createMainDockStore()
  const service = createMainDockService(ctx, sessions, created)
  // The framework mints the seat's root store instance at mount; adopt it so
  // the service writes the same instance the components read.
  const storeHandle: typeof created = {
    ...created,
    create: () => {
      const instance = created.create()
      service.adopt(instance)
      return instance
    },
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-main-dock: dictionaries')

  // The main seat: shadow the upstream Conversation at the conversation key.
  const disposeMain = ctx.slots.inject('main', function* () {
    yield ctx.slots.register({
      name: 'main',
      key: 'conversation',
      priority: -1,
      locale: NS,
      store: storeHandle,
      children: {
        'main.dock.tab.body': { kind: 'keyed', scope: 'session' },
      },
      inject: () => ({
        closeTab: (tabId: Parameters<MainDockService['closeTab']>[0]) => { service.closeTab(tabId) },
        startSession: () => { service.startSession() },
      }),
    }, MainDockSeat)
  })

  // Tab bodies: one keyed entry per tab kind, one Conversation entry per tab.
  const disposeBody = ctx.slots.inject('main.dock.tab.body', function* () {
    yield ctx.slots.register({
      name: 'main.dock.tab.body',
      key: 'session',
      inject: () => ({
        keyedHooks: { tabReference: (key: string) => service.referenceSource(key) },
      }),
      children: {
        'main.dock.tab.conversation': { kind: 'single', scope: 'session' },
      },
    }, SessionTabBody)
    yield ctx.slots.register({
      name: 'main.dock.tab.conversation',
    }, SessionConversation)
  })

  // Registered first, so it tears down last.
  ctx.effect(() => () => {
    void disposeMain()
    void disposeBody()
    service.dispose()
  }, 'ui-main-dock: service faces')
}
