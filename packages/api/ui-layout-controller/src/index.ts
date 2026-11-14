/** Authenticated Remote read/write for the persisted browser UI layout. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { uiLayoutDomain } from './layout-domain.ts'
import type { LayoutSnapshot } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `uiLayout` Remote namespace. */
    uiLayoutController: UiLayoutController
  }
}

/**
 * Host service backing the generated `ctx.remote.uiLayout` namespace: one
 * durable layout snapshot per client profile key. Reads and writes are whole
 * documents — the client owns the document's internal versioning; the Host
 * only guarantees durable last-write-wins storage.
 */
export class UiLayoutController extends TypertRemoteService {
  static inject = ['storageDomain']

  private readonly ready: Promise<Domain<typeof uiLayoutDomain>>

  /** @param ctx - Host with the storage-domain facility mounted. */
  constructor(ctx: Context) {
    super(ctx, 'uiLayoutController', { namespace: 'uiLayout' })
    this.ready = ctx.storageDomain.open(uiLayoutDomain)
    ctx.effect(() => async () => {
      const domain = await this.ready
      await domain.close()
    }, 'ui-layout-controller: domain lifetime')
  }

  /**
   * Read one profile's persisted layout snapshot.
   * @param profile - client profile key.
   * @returns the stored snapshot, or undefined when the profile has none yet.
   */
  @Remote('get')
  async get(profile: string): Promise<LayoutSnapshot | undefined> {
    return (await this.ready).table('layouts').get(profile)
  }

  /**
   * Replace one profile's persisted layout snapshot durably.
   * @param profile - client profile key.
   * @param snapshot - the whole replacement snapshot.
   * @returns resolution after durability.
   */
  @Remote('set')
  async set(profile: string, snapshot: LayoutSnapshot): Promise<void> {
    await (await this.ready).table('layouts').put(profile, snapshot)
  }
}

export default UiLayoutController
