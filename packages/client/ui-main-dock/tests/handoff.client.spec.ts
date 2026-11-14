/**
 * The AI-handoff flow: transcript projection keeps only real user/assistant
 * conversation, the tail cap bounds long sessions, and the dock notice
 * publishes every progress and failure state.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { ISessions, SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { runHandoff, capTranscript, collectTranscript, handoffChildTitle, type HandoffDeps } from '../src/client/handoff.ts'
import type { MainDockService } from '../src/client/service.ts'
import { createMainDockStore } from '../src/client/stores.ts'

type Builder = (overrides: Partial<Record<string, unknown>>) => SessionEvent

const userEvent: Builder = overrides => ({
  type: 'user/message',
  seq: 1,
  time: 0,
  data: {
    id: 'm1',
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text: 'hello' }],
    ...overrides,
  },
} as SessionEvent)

const assistantEvent: Builder = overrides => ({
  type: 'assistant/message',
  seq: 2,
  time: 1,
  data: {
    id: 'm2',
    role: 'assistant',
    source: { kind: 'model', attemptId: 'a1' },
    message: { content: [{ type: 'text', text: 'hi there' }] },
    ...overrides,
  },
} as SessionEvent)

const entry = (event: SessionEvent): SessionEventLikeEntry => ({ type: 'event', event })

describe('collectTranscript', () => {
  it('projects user and assistant text in conversation order', () => {
    const transcript = collectTranscript([
      entry(userEvent({})),
      entry(assistantEvent({})),
    ])
    expect(transcript).toBe('【用户】hello\n\n【助手】hi there')
  })

  it('keeps only user-authored messages: injected sources stay out', () => {
    const transcript = collectTranscript([
      entry(userEvent({ source: { kind: 'compaction' } })),
      entry(userEvent({})),
    ])
    expect(transcript).toBe('【用户】hello')
  })

  it('ignores reasoning blocks and non-text blocks', () => {
    const transcript = collectTranscript([
      entry(userEvent({ content: [{ type: 'reasoning' }, { type: 'text', text: 'visible' }] })),
    ])
    expect(transcript).toBe('【用户】visible')
  })

  it('returns an empty string when nothing qualifies', () => {
    expect(collectTranscript([
      {
        type: 'transient',
        event: {
          type: 'assistant/live-chunk', seq: 1, time: 0,
          data: { attemptId: 'a', turn: 1, step: 1, chunk: { type: 'text', text: 'x' } },
        },
      } as unknown as SessionEventLikeEntry,
    ])).toBe('')
  })
})

describe('capTranscript', () => {
  it('keeps a transcript within its budget without altering short text', () => {
    expect(capTranscript('short')).toBe('short')
  })

  it('caps a long transcript to its tail with an ellipsis head note', () => {
    const long = 'a'.repeat(30_000) + 'TAIL'
    const capped = capTranscript(long)
    expect(capped.startsWith('（更早的内容已截断）')).toBe(true)
    expect(capped.endsWith('TAIL')).toBe(true)
    expect(capped.length).toBeLessThan(long.length)
  })
})

describe('notifyHandoff store action', () => {
  it('publishes a notice with a fresh sequence each show and clears it', () => {
    const instance = createMainDockStore().create()
    expect(instance.getSnapshot().handoffNotice).toBeUndefined()
    instance.actions.notifyHandoff('first')
    const first = instance.getSnapshot().handoffNotice
    expect(first?.text).toBe('first')
    instance.actions.notifyHandoff('second')
    const second = instance.getSnapshot().handoffNotice
    expect(second?.text).toBe('second')
    expect(second?.seq).toBe((first?.seq ?? 0) + 1)
    instance.actions.notifyHandoff(undefined)
    expect(instance.getSnapshot().handoffNotice).toBeUndefined()
    expect(instance.getSnapshot().handoffNoticeSeq).toBe(second?.seq)
  })

  it('keeps the notice across layout actions so the Toast survives splits', () => {
    const instance = createMainDockStore().create()
    instance.actions.notifyHandoff('working')
    instance.actions.splitPane(instance.getSnapshot().layout.activePaneId)
    expect(instance.getSnapshot().handoffNotice?.text).toBe('working')
    expect(instance.getSnapshot().handoffNoticeSeq).toBe(1)
  })
})

describe('handoffChildTitle', () => {
  it('appends (1) to an unnumbered title', () => {
    expect(handoffChildTitle('前端')).toBe('前端 (1)')
  })

  it('increments a half-width trailing number', () => {
    expect(handoffChildTitle('前端(1)')).toBe('前端(2)')
    expect(handoffChildTitle('前端(9)')).toBe('前端(10)')
  })

  it('increments a full-width trailing number in place', () => {
    expect(handoffChildTitle('前端（1）')).toBe('前端（2）')
  })

  it('keeps a blank title blank-plus-suffix', () => {
    expect(handoffChildTitle('')).toBe(' (1)')
  })
})

describe('runHandoff flow', () => {
  type Recorded = { readonly notice?: string; readonly newSessions: string[]; readonly prompts: string[]; readonly renames: string[] }

  /** Stub every dep runHandoff touches; fetch and notices are captured per test. */
  function stubDeps(over?: {
    bindingGone?: boolean
    transcriptEmpty?: boolean
    fetchBody?: { status?: number; payload?: Record<string, unknown> | undefined; throw?: Error }
    promptFails?: boolean
    renameFails?: boolean
  }): { deps: HandoffDeps; recorded: Recorded; fetches: string[] } {
    const recorded: Recorded = { newSessions: [], prompts: [], renames: [] }
    const source = createSnapshotStore({ phase: 'ready' as const, ids: [], byId: {} })
    const sourceEvent = userEvent({})
    const entries = over?.transcriptEmpty === true ? [] : [entry(sourceEvent)]
    const window = { entries, hasMore: false, revision: 1, change: { kind: 'replace' as const, entries: [] } }
    const binding = over?.bindingGone === true ? undefined :
      {
        eventSource: { getSnapshot: () => window, subscribe: () => () => {} },
        session: {
          loadOlder: async () => {},
          rename: async (title: string) => {
            recorded.renames.push(title)
            if (over?.renameFails === true) return { ok: false, error: { message: 'rename refused' } } as never
            return { ok: true, value: { title, seq: 1 } } as never
          },
          prompt: async (content: readonly { readonly type: string; readonly text?: string }[]) => {
            recorded.prompts.push(content.map(part => part.type === 'text' ? part.text : '').join(''))
            if (over?.promptFails === true) return { ok: false, error: { message: 'refused' } } as never
            return { ok: true, value: { accepted: true } } as never
          },
        },
      }
    const deps: HandoffDeps = {
      sessions: {
        list: source,
        binding: () => binding as never,
        using: async (
          target: unknown,
          _options: unknown,
          operation: (reference: { ready: Promise<unknown>; binding: unknown }) => unknown,
        ) => {
          if (over?.bindingGone !== true) {
            return await operation({ ready: Promise.resolve(), binding })
          }
          throw new Error('session acquisition failed')
        },
        create: async (opts?: { cwd?: string }) => {
          recorded.newSessions.push(opts?.cwd ?? '(none)')
          return 's-new' as never
        },
      } as unknown as ISessions,
      service: {
        notifyHandoff: (text?: string) => { recorded.notice = text },
        openSession: () => {},
      } as unknown as MainDockService,
      t: key => key,
    }
    const fetches: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: { body?: string }) => {
      fetches.push(init?.body ?? '')
      if (over?.fetchBody?.throw !== undefined) throw over.fetchBody.throw
      return new Response(JSON.stringify(over?.fetchBody?.payload ?? { summary: 'SUMMARY' }), {
        status: over?.fetchBody?.status ?? 200,
      })
    })
    return { deps, recorded, fetches }
  }

  it('summarizes, creates a session with the same cwd, and prompts it', async () => {
    const source = createSnapshotStore({ phase: 'ready' as const, ids: [], byId: { 's-one': { cwd: '/work/a', displayTitle: 'OPC' } } })
    const { deps, recorded, fetches } = stubDeps()
    ;(deps.sessions as unknown as { list: typeof source }).list = source
    await runHandoff(deps, 's-one' as never)
    expect(recorded.newSessions).toEqual(['/work/a'])
    expect(recorded.prompts).toEqual(['SUMMARY'])
    expect(recorded.renames).toEqual(['OPC (1)'])
    expect(JSON.parse(fetches[0]).transcript).toBe('【用户】hello')
  })

  it('aborts before prompting when the child rename is refused', async () => {
    const source = createSnapshotStore({
      phase: 'ready' as const,
      ids: [],
      byId: { 's-one': { cwd: '/work/a', displayTitle: '前端 (1)' } },
    })
    const { deps, recorded } = stubDeps({ renameFails: true })
    ;(deps.sessions as unknown as { list: typeof source }).list = source
    await runHandoff(deps, 's-one' as never)
    expect(recorded.renames).toEqual(['前端 (2)'])
    // The rename aborts before the prompt: no summary prompt was ever sent.
    expect(recorded.prompts).toEqual([])
    expect(recorded.notice).toBe('handoff.renameFailed：rename refused')
  })

  it('publishes the failure notice when the summarizer rejects', async () => {
    const { deps, recorded } = stubDeps({ fetchBody: { status: 502, payload: { error: 'model down' } } })
    await runHandoff(deps, 's-one' as never)
    expect(recorded.notice).toBe('handoff.failed：model down')
    expect(recorded.newSessions).toEqual([])
  })

  it('publishes the empty-transcript notice without calling the summarizer', { timeout: 20_000 }, async () => {
    const { deps, recorded, fetches } = stubDeps({ transcriptEmpty: true })
    await runHandoff(deps, 's-one' as never)
    expect(recorded.notice).toBe('handoff.emptyTranscript')
    expect(fetches).toHaveLength(0)
  })

  it('publishes the failure notice when session acquisition throws', async () => {
    const { deps, recorded } = stubDeps({ bindingGone: true })
    await runHandoff(deps, 's-one' as never)
    expect(recorded.notice).toBe('handoff.failed：session acquisition failed')
  })

  it('publishes the failure notice when the new prompt is refused', async () => {
    const { deps, recorded } = stubDeps({ promptFails: true })
    await runHandoff(deps, 's-one' as never)
    expect(recorded.notice).toBe('handoff.failed：refused')
  })
})

afterEach(() => { vi.unstubAllGlobals() })
