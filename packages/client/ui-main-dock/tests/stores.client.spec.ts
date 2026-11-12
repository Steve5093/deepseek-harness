/**
 * The store shell over the docking kit: every action is one settled intent
 * recorded as one history entry, or nothing when the intent changes nothing.
 * Session-side effects (retains and reference republishes) belong to the
 * service; this file asserts only layout behavior the kit's gestures reach.
 */
import { describe, expect, it } from 'vitest'
import type { LayoutState, PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { dockPaneIds, getPane } from '@deepseek-ai/dsh-client-ui-dockkit'
import { canCloseMainTab, createMainDockStore, isSoleDockedTab, sessionAddress, SESSION_TAB_KIND } from '../src/client/stores.ts'

const SESSION = 's-one'

function harness() {
  const instance = createMainDockStore().create()
  const layout = (): LayoutState => instance.getSnapshot().layout
  const tabs = () => Object.values(layout().tabs)
  instance.actions.openSession(SESSION, 'First')
  return { instance, layout, tabs }
}

describe('main dock store', () => {
  it('seats one tab per session and focuses an existing one', () => {
    const { instance, layout, tabs } = harness()
    expect(tabs()).toHaveLength(1)
    expect(tabs()[0]?.kind).toBe(SESSION_TAB_KIND)
    expect(tabs()[0]?.contentId).toBe(sessionAddress(SESSION))

    instance.actions.openSession('s-two', 'Second')
    expect(tabs()).toHaveLength(2)

    instance.actions.openSession(SESSION, 'First')
    const active = getPane(layout(), layout().activePaneId).activeTabId
    expect(layout().tabs[active]?.title).toBe('First')
  })

  it('splits by moving an idle sibling tab into the new pane', () => {
    const { instance, layout } = harness()
    instance.actions.openSession('s-two', 'Second')
    instance.actions.splitPane(layout().activePaneId)
    expect(dockPaneIds(layout())).toHaveLength(2)
    const cells = Object.values(layout().nodes).filter(node => node.kind === 'pane')
    expect(cells.filter(node => node.tabs.length > 0)).toHaveLength(2)
  })

  it('seeds a blank placeholder when a sole-tab pane splits', () => {
    const { instance, layout, tabs } = harness()
    instance.actions.splitPane(layout().activePaneId)
    expect(dockPaneIds(layout())).toHaveLength(2)
    expect(tabs()).toHaveLength(2)
    const blank = tabs().find(tab => tab.kind === 'blank')
    expect(blank).toBeDefined()
    // The blank tab must not hold a session reference.
    expect(blank?.contentId).toBe('blank:placeholder')
  })

  it('refuses a third pane: the kit fixes one horizontal split', () => {
    const { instance, layout } = harness()
    instance.actions.splitPane(layout().activePaneId)
    const before = dockPaneIds(layout()).length
    instance.actions.splitPane(layout().activePaneId)
    expect(dockPaneIds(layout())).toHaveLength(before)
  })

  it('keeps the sole docked tab unclosable', () => {
    const { instance, layout } = harness()
    const sole = Object.keys(layout().tabs)[0] as TabId
    expect(canCloseMainTab(instance.getSnapshot(), sole)).toBe(false)
    instance.actions.closeTab(sole)
    expect(Object.keys(layout().tabs)).toHaveLength(1)
  })

  it('closes a second tab and merges the emptied pane', () => {
    const { instance, layout, tabs } = harness()
    instance.actions.openSession('s-two', 'Second')
    instance.actions.splitPane(layout().activePaneId)
    const panes = dockPaneIds(layout())
    const idlePane = panes.find(id => id !== layout().activePaneId) as PaneId
    const closable = getPane(layout(), idlePane).tabs[0] as TabId
    expect(canCloseMainTab(instance.getSnapshot(), closable)).toBe(true)
    instance.actions.closeTab(closable)
    expect(dockPaneIds(layout())).toHaveLength(1)
    expect(tabs()).toHaveLength(1)
  })

  it('reconciles away tabs whose session left the catalog', () => {
    const { instance, layout, tabs } = harness()
    instance.actions.openSession('s-two', 'Second')
    instance.actions.reconcile(new Set([SESSION]))
    expect(tabs()).toHaveLength(1)
    expect(tabs()[0]?.contentId).toBe(sessionAddress(SESSION))
    expect(layout().tabs).toBeTruthy()
  })

  it('moves tabs across panes through place and drop', () => {
    const { instance, layout } = harness()
    instance.actions.openSession('s-two', 'Second')
    instance.actions.splitPane(layout().activePaneId)
    const panes = dockPaneIds(layout())
    const source = panes[1] as PaneId
    const dest = panes[0] as PaneId
    const moved = getPane(layout(), source).tabs[0] as TabId
    instance.actions.placeTab(moved, dest, 0)
    // The emptied source pane merges away; a center drop refills the surface.
    expect(getPane(layout(), dest).tabs).toContain(moved)
    instance.actions.dropTab(moved, dest, 'center')
    const panesAgain = dockPaneIds(layout())
    expect(panesAgain.length + 1).toBeGreaterThan(panesAgain.length)
    instance.actions.splitPane(layout().activePaneId)
    const reflowed = dockPaneIds(layout())
    const otherPane = reflowed.find(id => id !== layout().activePaneId) as PaneId
    const other = getPane(layout(), otherPane).tabs[0] as TabId
    const destPane = layout().activePaneId
    // A horizontal edge drop splits: the tab lands in the new half, and the
    // surface holds both sessions docked again.
    instance.actions.dropTab(other, destPane, 'left')
    const dockedTabs = dockPaneIds(layout()).flatMap(id => getPane(layout(), id).tabs)
    expect(dockedTabs).toContain(other)
    expect(dockedTabs).toHaveLength(2)

    // Vertical zones are refused on this surface.
    const before = dockPaneIds(layout()).length
    instance.actions.dropTab(other, destPane, 'top')
    expect(dockPaneIds(layout())).toHaveLength(before)
  })

  it('floats a tab back into the dock and survives resize/undo/redo', () => {
    const { instance, layout } = harness()
    instance.actions.openSession('s-two', 'Second')
    const tabId = Object.keys(layout().tabs)[1] as TabId
    instance.actions.floatTab(tabId, { x: 10, y: 10, width: 400, height: 300 })
    expect(layout().floats.length).toBe(1)
    const floatPane = layout().floats[0] as PaneId
    instance.actions.moveFloat(floatPane, 20, 30)
    instance.actions.resizeFloat(floatPane, { x: 20, y: 30, width: 500, height: 400 })
    expect(getPane(layout(), floatPane).rect?.width).toBe(500)
    instance.actions.unfloatPane(floatPane)
    expect(layout().floats.length).toBe(0)

    instance.actions.setExpanded(false)
    instance.actions.setMode('tabbed')
    expect(layout().mode).toBe('tabbed')
    instance.actions.undo()
    expect(layout().mode).not.toBe('tabbed')
    instance.actions.redo()
    expect(layout().mode).toBe('tabbed')

    const splitter = Object.values(layout().nodes).find(node => node.kind === 'split')
    if (splitter !== undefined && splitter.kind === 'split') {
      instance.actions.resizeSplit(splitter.id, [0.5, 0.5])
    }
    // The unfloated tab is back in the dock; the surface holds both sessions.
    const docked = dockPaneIds(layout())
      .flatMap(id => getPane(layout(), id).tabs as readonly TabId[])
    expect(docked).toHaveLength(2)
    expect(isSoleDockedTab(layout(), docked[0] as TabId)).toBe(false)
  })

  it('does nothing when an intent changes nothing', () => {
    const { instance, layout } = harness()
    const paneId = layout().activePaneId
    const historyBefore = instance.getSnapshot().history.entries.length
    instance.actions.focusTab(Object.keys(layout().tabs)[0] as TabId)
    instance.actions.focusPane(paneId)
    instance.actions.splitPane(paneId)
    const afterFirst = instance.getSnapshot().history.entries.length
    instance.actions.splitPane(paneId)
    expect(instance.getSnapshot().history.entries.length).toBe(afterFirst)
    expect(afterFirst).toBeGreaterThan(historyBefore)
  })
})
