/** Wire-facing types of the UI-layout Remote namespace. */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/**
 * One persisted client layout snapshot: versioned, opaque to the Host beyond
 * the envelope fields. The client owns the document's internal versioning.
 */
export interface LayoutSnapshot {
  /** Client-owned layout format version; the client rejects foreign versions. */
  version: number
  /** The whole persisted client state as one JSON document. */
  document: Record<string, JsonValue>
  /** ISO-8601 UTC instant of the last client write; advisory display data. */
  updatedAt: string
}
