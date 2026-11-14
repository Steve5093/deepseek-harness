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
  'handoff.command': 'AI handoff to a new session',
  'handoff.commandDescription':
    'Summarize this session\'s goals, tasks, and files into a prompt, then open a new session with it',
  'handoff.collecting': 'AI handoff: collecting this session\'s context…',
  'handoff.summarizing': 'AI handoff: summarizing…',
  'handoff.failed': 'AI handoff failed',
  'handoff.sessionUnavailable': 'AI handoff failed: session is not open',
  'handoff.emptyTranscript': 'AI handoff failed: nothing to summarize yet',
  'handoff.done': 'AI handoff ready: the new session received the summary prompt',
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
  'handoff.command': 'AI 交接新会话',
  'handoff.commandDescription': '用 AI 总结本会话的目标、任务与代码文件去向，生成提示词并自动开新会话发送',
  'handoff.collecting': 'AI 交接：正在收集本会话上下文…',
  'handoff.summarizing': 'AI 交接：正在总结…',
  'handoff.failed': 'AI 交接失败',
  'handoff.sessionUnavailable': 'AI 交接失败：会话未打开',
  'handoff.emptyTranscript': 'AI 交接失败：还没有可总结的内容',
  'handoff.done': 'AI 交接完成：新会话已收到总结提示词',
} as const

export type MainDockKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The dock surface's copy: tab bodies, chrome controls, and drop-zone captions. */
    mainDock: MainDockKey
  }
}
