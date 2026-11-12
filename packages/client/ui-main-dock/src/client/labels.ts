/**
 * The docking kit's vocabulary, projected from this package's dictionary.
 * The kit renders no string of its own.
 */
import type { DockLabels } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { NS } from './locales.ts'

/**
 * Project the dictionary into the kit's label contract.
 * @param t - namespace-bound translate.
 * @returns every string the kit renders.
 */
export function dockLabels(t: TranslateNS<typeof NS>): DockLabels {
  return {
    emptyPane: t('dock.emptyPane'),
    splitPane: t('dock.splitPane'),
    splitPaneDisabled: t('dock.splitPaneDisabled'),
    splitPaneNarrow: t('dock.splitPaneNarrow'),
    closeTab: t('dock.closeTab'),
    addTab: t('dock.addTab'),
    dockFloat: t('dock.dockFloat'),
    closeFloat: t('dock.closeFloat'),
    dropZone: {
      center: t('dock.drop.center'),
      left: t('dock.drop.left'),
      right: t('dock.drop.right'),
      top: t('dock.drop.top'),
      bottom: t('dock.drop.bottom'),
    },
  }
}
