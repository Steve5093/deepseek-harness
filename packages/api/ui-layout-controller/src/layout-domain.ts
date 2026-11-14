/**
 * The UI layout domain declaration: the persisted browser-layout snapshot
 * schema and the `defineDomain` spec the facility opens.
 *
 * One table keyed by browser profile id, one record per client profile: the
 * whole persisted client state (dock layout, panel geometry) as one opaque
 * JSON document. The schema validates structure at the durable boundary but
 * keeps the document body open — the client owns its layout versioning, and
 * a server-side schema would force a server release for every client layout
 * evolution.
 * @module @deepseek-ai/dsh-api-ui-layout-controller/src/layout-domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { LayoutSnapshot } from './types.ts'

/** Persisted snapshot: versioned, opaque to the Host beyond these envelope fields. */
export const layoutSnapshotSchema = z.object({
  /** Client-owned layout format version; the client rejects foreign versions. */
  version: z.number().int().min(1),
  /** The whole persisted client state as one JSON document. */
  document: z.record(z.string(), z.custom<JsonValue>(() => true)),
  /** ISO-8601 UTC instant of the last client write; advisory display data. */
  updatedAt: z.string(),
}).strict()

/** Authoritative UI-layout storage; malformed snapshots reject opening the domain. */
export const uiLayoutDomain = defineDomain({
  name: 'ui_layout', version: 1,
  tables: { layouts: domainTable<string, LayoutSnapshot>(layoutSnapshotSchema) },
})
