/**
 * The dock's tab body and its embedded Conversation: one Session's
 * Conversation per tab, bound explicitly to the tab's retained reference so
 * panes can run side by side without cross-talk.
 */
import type { ReactNode } from 'react'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  InjectFace, PropsRenderFactories, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { MainDockTabBodyInjected } from '../contract/slots.ts'
import css from './MainDock.module.css'

/** Fixed Chat selection used by an embedded Conversation occurrence. */
export function FixedChatConversationView(props: ConversationViewsProps): ReactNode {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

/** The tab body entry's composed share: tab id, reference hook, provider seat, child dispatch. */
export type SessionTabBodyProps = PropsRuntime<'main.dock.tab.body'> &
  PropsRenderSlots<'main.dock.tab.conversation'> &
  InjectFace<MainDockTabBodyInjected>

/**
 * Bind one tab's Session and render its declared Conversation child.
 * @param props - tab id, reference hook, provider seat, and child dispatch.
 */
export function SessionTabBody({
  tabId, SessionProvider, renderSlot, useTabReference,
}: SessionTabBodyProps): ReactNode {
  const reference = useTabReference(tabId)
  if (reference === undefined) return null
  return (
    <div className={css.tabBody} data-main-dock-tab={tabId}>
      <SessionProvider session={reference}>
        {renderSlot('main.dock.tab.conversation', {})}
      </SessionProvider>
    </div>
  )
}

/** The Conversation entry's composed share. */
export type SessionConversationProps = PropsRuntime<'main.dock.tab.conversation'> & PropsRenderFactories

/**
 * Render the shared embedded Conversation under the inherited Session binding.
 * @param props - session snapshot hooks and the Conversation factory seat.
 */
export function SessionConversation(props: SessionConversationProps): ReactNode {
  const { sessionId, useSession, useConversation, useSessions, renderFactorySlot } = props
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  const active = conversation.activeTargets.size > 0
    || (!session.blank && !session.awaitingFirstTurn)
    || session.running
  const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank)
  const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
  const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, {
    slots: { views: FixedChatConversationView },
  })
}
