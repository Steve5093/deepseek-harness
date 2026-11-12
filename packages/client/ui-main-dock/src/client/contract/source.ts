/**
 * Main-dock contract: the Session reference source this package owns and the
 * slot declarations its registrations use.
 */
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

/** The main-dock reference source: one retain per tab-visible Session. */
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    mainDock: unknown
  }
}
