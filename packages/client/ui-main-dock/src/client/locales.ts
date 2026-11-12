/** Namespace-localized copy owned by this package. */
export const NS = 'mainDock'
/** English dictionary. */
export const en = {
  'dock.emptyPane': 'No conversation open in this pane',
  'dock.splitPane': 'Split pane',
  'dock.splitPaneDisabled': 'Pane budget spent',
  'dock.splitPaneNarrow': 'Too narrow to split',
  'dock.closeTab': 'Close tab',
  'dock.addTab': 'Add tab',
  'dock.dockFloat': 'Dock panel',
  'dock.closeFloat': 'Close panel',
  'dock.drop.center': 'Move here',
  'dock.drop.left': 'Split left',
  'dock.drop.right': 'Split right',
  'dock.drop.top': 'Split top',
  'dock.drop.bottom': 'Split bottom',
} as const

/** Simplified-Chinese dictionary. */
export const zh = {
  'dock.emptyPane': '此分栏没有打开的会话',
  'dock.splitPane': '拆分面板',
  'dock.splitPaneDisabled': '面板数量已达上限',
  'dock.splitPaneNarrow': '太窄，无法拆分',
  'dock.closeTab': '关闭标签页',
  'dock.addTab': '新建标签页',
  'dock.dockFloat': '停靠面板',
  'dock.closeFloat': '关闭面板',
  'dock.drop.center': '移到这里',
  'dock.drop.left': '拆分到左侧',
  'dock.drop.right': '拆分到右侧',
  'dock.drop.top': '拆分到上方',
  'dock.drop.bottom': '拆分到下方',
} as const

export type MainDockKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The dock surface's copy: tab bodies, chrome controls, and drop-zone captions. */
    mainDock: MainDockKey
  }
}
