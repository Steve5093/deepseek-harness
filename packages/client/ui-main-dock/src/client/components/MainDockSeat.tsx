/**
 * Main dock seat: the conversation column's session tabs as one docking
 * surface. Each tab body renders an embedded Conversation bound to its
 * Session; panes split tabs into side-by-side conversations.
 *
 * The seat registers at the `main` slot's `conversation` key with priority -1,
 * shadowing the upstream ConversationPanel (which stays mounted and owns the
 * `main.conversation` declaration).
 */
import type { ReactNode } from 'react'
import { DockSurface, canSplit } from '@deepseek-ai/dsh-client-ui-dockkit'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LayoutState, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { MainDockInjected } from '../contract/slots.ts'
import type { MainDockStoreHandle } from '../service.ts'
import { canCloseMainTab, type MainDockState } from '../stores.ts'
import { dockLabels } from '../labels.ts'
import type { NS } from '../locales.ts'
import css from './MainDock.module.css'

/** The seat's store share, derived from the declared handle. */
export type MainDockSeatStoreProps = PropsStore<MainDockStoreHandle>

/** The seat's composed share: runtime + declared children + store + inject face + copy. */
export type MainDockSeatProps = PropsRuntime<'main', 'conversation'> &
  PropsRenderSlots<'main.dock.tab.body'> &
  MainDockSeatStoreProps &
  InjectFace<MainDockInjected> &
  PropsLocale<typeof NS>

/**
 * The dock surface: kit chrome and session tab bodies.
 * @param props - the seat's composed share.
 */
export function MainDockSeat(props: MainDockSeatProps): ReactNode {
  const { useStore, actions, closeTab, startSession, renderSlot, t } = props
  const state = useStore(s => s as MainDockState)
  const layout: LayoutState = state.layout

  const renderTab = (tab: TabRecord): ReactNode =>
    tab.contentId.startsWith('session:')
      ? renderSlot('main.dock.tab.body', { tabId: tab.id }, { entryKey: 'session' })
      : <div className={css.unavailable}>{t('dock.emptyPane')}</div>

  const renderTabTitle = (tab: TabRecord): ReactNode =>
    tab.contentId.startsWith('session:')
      ? tab.title
      : t('dock.emptyPane')

  return (
    <div className={css.root} data-main-dock="">
      {/* Transient AI-handoff status line; the seq re-showing restarts the
          fade cycle instead of reusing the faded banner. */}
      {state.handoffNotice !== undefined && (
        <Toast
          key={state.handoffNotice.seq}
          text={state.handoffNotice.text}
          onDone={() => { actions.notifyHandoff(undefined) }}
        />
      )}
      <DockSurface
        state={layout}
        canSplit={canSplit(layout)}
        dropZones="edges"
        minPaneFraction={0.2}
        canCloseTab={tabId => canCloseMainTab(state, tabId)}
        intents={{
          focusTab: (tabId) => { actions.focusTab(tabId) },
          focusPane: (paneId) => { actions.focusPane(paneId) },
          splitPane: (paneId) => { actions.splitPane(paneId) },
          addTab: () => { startSession() },
          closeTab: (tabId) => { closeTab(tabId) },
          // One tab per Session: a duplicate request focuses the tab it names.
          duplicateTab: (tabId) => { actions.focusTab(tabId) },
          floatTab: (tabId, rect) => { actions.floatTab(tabId, rect) },
          unfloatPane: (paneId) => { actions.unfloatPane(paneId) },
          placeTab: (tabId, toPaneId, index) => { actions.placeTab(tabId, toPaneId, index) },
          dropTab: (tabId, paneId, zone) => { actions.dropTab(tabId, paneId, zone) },
          moveFloat: (paneId, x, y) => { actions.moveFloat(paneId, x, y) },
          resizeFloat: (paneId, rect) => { actions.resizeFloat(paneId, rect) },
          resizeSplit: (splitId, sizes) => { actions.resizeSplit(splitId, sizes) },
        }}
        labels={dockLabels(t)}
        renderTab={renderTab}
        renderTabTitle={renderTabTitle}
      />
    </div>
  )
}
