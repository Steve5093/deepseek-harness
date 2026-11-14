/**
 * AI handoff: summarize the current session into a handoff prompt and open a
 * new dock tab that receives it. The flow runs entirely on the client: the
 * session's event window is projected to a user/assistant transcript, the
 * [davinci] webchat gateway turns it into the summary prompt (the same
 * deployment edge the composer's prompt-polish uses), and the new Session is
 * created with the current cwd, seated as a dock tab, and prompted.
 */
import type { ISessions, SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MainDockService } from './service.ts'
import type { MainDockKey } from './locales.ts'

/** [davinci] webchat base URL — the prompt-polish precedent in ui-conversation. */
export const HANDOFF_WEBCHAT_BASE = 'http://100.120.56.8:7800'

/** Transcript tail cap sent to the summarizer, in characters. */
const TRANSCRIPT_CHAR_CAP = 28_000

/** loadOlder pages pulled before summarizing with whatever history is loaded. */
const MAX_HISTORY_PAGES = 8

/** The translate face the flow needs; typed to this package's keys. */
export type HandoffTranslate = (key: MainDockKey) => string

/** The services the handoff flow reads and writes. */
export interface HandoffDeps {
  readonly sessions: ISessions
  readonly service: MainDockService
  readonly t: HandoffTranslate
}

/** Text of one message content block list: text blocks joined, others ignored. */
function textOf(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string).join('').trim()
}

/**
 * Project the event window to a user/assistant transcript; tool traffic,
 * reasoning, and lifecycle events stay out (the summarizer wants the
 * conversation, not the trace).
 * @param entries - the session's event-window entries.
 * @returns the transcript, oldest first, or an empty string when nothing qualified.
 */
export function collectTranscript(entries: readonly SessionEventLikeEntry[]): string {
  const lines: string[] = []
  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const event = entry.event
    if (event.type === 'user/message') {
      if (event.data.source?.kind !== 'user') continue
      const text = textOf(event.data.content)
      if (text !== '') lines.push(`【用户】${text}`)
      continue
    }
    if (event.type === 'assistant/message') {
      const text = textOf(event.data.message.content)
      if (text !== '') lines.push(`【助手】${text}`)
    }
  }
  return lines.join('\n\n')
}

/**
 * Cap a transcript to its tail so recent context wins when the session is
 * longer than the summarizer's budget.
 * @param transcript - the full projected transcript.
 * @returns the transcript within {@link TRANSCRIPT_CHAR_CAP}, with an ellipsis head note when trimmed.
 */
export function capTranscript(transcript: string): string {
  if (transcript.length <= TRANSCRIPT_CHAR_CAP) return transcript
  return `（更早的内容已截断）\n\n${transcript.slice(-TRANSCRIPT_CHAR_CAP)}`
}

/**
 * Ask the webchat gateway to compress a transcript into the handoff prompt.
 * @param transcript - capped transcript text.
 * @param t - translate face for the failure copy.
 * @returns the summary prompt, or a failure notice the caller publishes.
 */
async function summarize(transcript: string, t: HandoffTranslate): Promise<{ prompt?: string; notice?: string }> {
  let response: Response
  try {
    response = await fetch(`${HANDOFF_WEBCHAT_BASE}/api/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    })
  } catch (error: unknown) {
    return { notice: `${t('handoff.failed')}：${error instanceof Error ? error.message : String(error)}` }
  }
  const payload = (await response.json().catch(() => ({}))) as { summary?: string; error?: string }
  if (!response.ok || typeof payload.summary !== 'string' || payload.summary === '') {
    return { notice: `${t('handoff.failed')}：${payload.error ?? `HTTP ${response.status}`}` }
  }
  return { prompt: payload.summary }
}

/**
 * Run the handoff flow for one session. Progress and failures surface through
 * the dock's handoff notice; success opens the new tab, which is its own
 * feedback, so no success toast is published.
 * @param deps - sessions, dock service, and translate face.
 * @param sessionId - the session being handed off.
 */
export async function runHandoff(deps: HandoffDeps, sessionId: SessionId): Promise<void> {
  const { sessions, service, t } = deps
  service.notifyHandoff(t('handoff.collecting'))
  // An independent read retain under the dock's own source: `ready` waits for
  // the shared initial history opening, so the event window holds the tail
  // even when the flow fires right after a fresh page load.
  try {
    await sessions.using(sessionId, { source: 'mainDock' }, async (reference) => {
      await reference.ready
      const binding = reference.binding
      // History events fill the window asynchronously after the opening
      // settles, so a fresh acquisition can still observe an empty window:
      // poll briefly before reading, then page the older history in.
      let window = binding.eventSource.getSnapshot()
      for (let wait = 0; wait < 20 && window.entries.length === 0; wait += 1) {
        await new Promise(resolve => setTimeout(resolve, 250))
        window = binding.eventSource.getSnapshot()
      }
      for (let page = 0; page < MAX_HISTORY_PAGES && window.hasMore; page += 1) {
        await binding.session.loadOlder()
        window = binding.eventSource.getSnapshot()
      }
      const transcript = capTranscript(collectTranscript(window.entries))
      if (transcript.trim() === '') {
        service.notifyHandoff(t('handoff.emptyTranscript'))
        return
      }
      service.notifyHandoff(t('handoff.summarizing'))
      const summary = await summarize(transcript, t)
      if (summary.prompt === undefined) {
        service.notifyHandoff(summary.notice ?? t('handoff.failed'))
        return
      }
      const info = sessions.list.getSnapshot().byId[sessionId]
      const newId = await sessions.create(info?.cwd === undefined ? {} : { cwd: info.cwd })
      // Seat the tab first: the retention write is synchronous, so the binding
      // is live by the time the prompt fires.
      service.openSession(newId)
      const next = sessions.binding(newId)
      if (next === undefined) {
        service.notifyHandoff(t('handoff.sessionUnavailable'))
        return
      }
      const admitted = await next.session.prompt([{ type: 'text', text: summary.prompt }], 'queue')
      if (!admitted.ok) {
        service.notifyHandoff(`${t('handoff.failed')}：${admitted.error?.message ?? 'prompt refused'}`)
        return
      }
      service.notifyHandoff(t('handoff.done'))
    })
  } catch (error: unknown) {
    service.notifyHandoff(`${t('handoff.failed')}：${error instanceof Error ? error.message : String(error)}`)
  }
}
