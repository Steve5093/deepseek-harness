/** UiLayout Remote delegation: durable profile snapshots, whole-document semantics. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import UiLayoutController from '../src/index.ts'
import type { LayoutSnapshot } from '../src/layout-domain.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose())) })

const snapshot: LayoutSnapshot = {
  version: 1,
  document: { layout: { nodes: {}, tabs: {} }, history: { ops: [] }, minted: 4 },
  updatedAt: '2026-11-14T08:00:00.000Z',
}

function fixture() {
  const ctx = new Context()
  roots.push(ctx)
  const table = {
    get: vi.fn<(key: string) => LayoutSnapshot | undefined>(),
    put: vi.fn<(key: string, value: LayoutSnapshot) => Promise<void>>().mockResolvedValue(undefined),
  }
  const domain = { table: vi.fn((_name: string) => table) }
  ctx.provide('storageDomain', { open: vi.fn().mockResolvedValue(domain) } as never)
  return { ctx, table, controller: new UiLayoutController(ctx) }
}

it('reads one profile snapshot through the domain table', async () => {
  const { table, controller } = fixture()
  table.get.mockReturnValueOnce(undefined)
  expect(await controller.get('profile-a')).toBeUndefined()
  table.get.mockReturnValueOnce(snapshot)
  expect(await controller.get('profile-a')).toBe(snapshot)
  expect(table.get).toHaveBeenCalledWith('profile-a')
  expect(table.get).toHaveBeenCalledTimes(2)
})

it('replaces one profile snapshot durably without reading', async () => {
  const { table, controller } = fixture()
  await controller.set('profile-b', snapshot)
  expect(table.put).toHaveBeenCalledExactlyOnceWith('profile-b', snapshot)
})

it('propagates storage failures to the caller', async () => {
  const { table, controller } = fixture()
  const failure = new Error('backend unavailable')
  table.put.mockRejectedValueOnce(failure)
  await expect(controller.set('profile-c', snapshot)).rejects.toBe(failure)
})
