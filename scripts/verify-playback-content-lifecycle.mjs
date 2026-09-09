import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerPlaybackContentChecks(check) {
  check('playback music: late native app escapes the sidebar and restores beside the original tags', async () => {
    const f = await fixture()
    const { native, state, constants } = f
    const entry = document.createElement('div')
    entry.id = 'bgm-entry'
    const open = document.createElement('button')
    entry.append(open)
    let clicks = 0
    open.addEventListener('click', () => clicks++)
    try {
      native.moveOrReplaceNode(constants.selectors.tags, state.tagsSlot, state.movedNodes)
      const observer = new MutationObserver(() => {})
      observer.observe(state.root, { childList: true, subtree: true })
      state.tagsSlot.prepend(entry)
      const [created] = observer.takeRecords()
      observer.disconnect()
      assert.equal(native.classifyWidescreenMutation(created, state).relevant, true)
      assert.equal(native.moveNativeMusicPanel(state.movedNodes), true)
      assert.equal(entry.parentElement, document.body)
      assert.equal(native.moveNativeMusicPanel(state.movedNodes), false)
      open.click()
      assert.equal(clicks, 1)
      observer.observe(entry, { childList: true, subtree: true })
      entry.appendChild(document.createElement('p'))
      assert.equal(native.classifyWidescreenMutation(observer.takeRecords()[0], state).relevant, false)
      observer.disconnect()
      native.restoreMovedNodes(state.movedNodes)
      assert.equal(entry.parentElement, f.origin, 'the temporary Bewly tags slot is never used as the restored music host')
      open.click()
      assert.equal(clicks, 2)
    }
    finally {
      f.dispose()
      entry.remove()
    }
  })

  async function fixture(pgc = false) {
    const constants = await import('../src/utils/bewlyWidescreen/constants')
    const ready = new WeakMap()
    const native = await loadSourceModule('../src/utils/bewlyWidescreen/nativeDom.ts', {
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/commentDomTransfer': await import('../src/utils/commentDomTransfer'),
      '~/utils/player': { getVideoElement: () => null },
      '~/utils/playerMedia': { getPlayerRoot: () => null },
      '~/utils/videoMetadataBridge': { isNativeVideoComponentReady: node => ready.get(node) ?? true, isPgcPlaybackPage: () => pgc, releaseNativeVideoComponent() {} },
    })
    const description = await loadSourceModule('../src/utils/bewlyWidescreen/description.ts', {
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/labels': { t: key => key },
      '~/utils/bewlyWidescreen/nativeDom': native,
    })
    const root = document.body.appendChild(document.createElement('div'))
    root.id = constants.ROOT_ID
    const sidebarTop = root.appendChild(document.createElement('header'))
    const state = { root, sidebarTop, movedNodes: [], descriptionExpanded: false, activeTab: 'comment', controlsLayoutReady: true, hydratedTabs: new Set() }
    for (const name of ['upSlot', 'toolbarSlot', 'descriptionSlot', 'tagsSlot', 'metadataSlot'])
      state[name] = sidebarTop.appendChild(document.createElement('div'))
    state.panels = Object.fromEntries(['comment', 'danmaku', 'playlist'].map(name => [name, root.appendChild(document.createElement('section'))]))
    state.tabButtons = Object.fromEntries(['comment', 'danmaku', 'playlist'].map(name => [name, document.createElement('button')]))
    state.panels.comment.innerHTML = '<div class="commentapp"><div class="reply-list">Native comments</div></div>'
    const origin = document.body.appendChild(document.createElement('main'))
    origin.innerHTML = '<div class="up-info-container">Native author</div><div id="arc_toolbar_report" class="video-toolbar-container"><button>Like</button><button>Coin</button><button>Favorite</button><button>Share</button></div><div id="v_desc" class="video-desc-container"><div class="basic-desc-info"></div></div><div class="video-tag-container"><a href="#tag">Native tag</a></div>'
    return {
      state,
      origin,
      constants,
      native,
      description,
      ready,
      dispose() {
        state.descriptionCleanup?.()
        native.restoreMovedNodes(state.movedNodes)
        root.remove()
        origin.remove()
      },
    }
  }

  check('PGC content: mounted info/actions and complete paginated directory preserve native controls without BV-only nodes', async () => {
    const f = await fixture(true)
    f.origin.className = 'player-left-components'
    f.origin.innerHTML = '<div class="mediainfo_mediaInfoWrap_fixture"><a>Series</a><button>Follow</button></div><div class="toolbar"><button>Share</button></div><div class="PaginatedEpList_root_fixture"><section><header class="SectionHeader_header_fixture"><button>Sort</button></header><div class="PageTabs_container_fixture"><button>1-50</button></div><div class="EpisodeVirtualList_scroll_fixture"><a href="/bangumi/play/ep123">Episode</a></div></section></div>'
    const info = f.origin.firstElementChild
    const toolbar = info.nextElementSibling
    const playlist = toolbar.nextElementSibling
    const buttons = [...f.origin.querySelectorAll('button')]
    const clicks = []
    buttons.forEach(button => button.addEventListener('click', () => clicks.push(button.textContent)))
    try {
      f.ready.set(info, false)
      assert.equal(f.native.isWidescreenTransferContentReady(), false)
      f.ready.set(info, true)
      assert.equal(f.native.isWidescreenTransferContentReady(), true)
      f.native.moveOrReplaceNode(f.constants.selectors.mediaInfo, f.state.metadataSlot, f.state.movedNodes)
      f.native.moveOrReplaceNode(f.constants.selectors.toolbar, f.state.toolbarSlot, f.state.movedNodes)
      f.native.moveOrReplaceNode(f.constants.selectors.playlist, f.state.panels.playlist, f.state.movedNodes)
      assert.equal(f.state.panels.playlist.firstElementChild, playlist)
      assert.equal(playlist.querySelectorAll('button').length, 2, 'sort and page tabs stay in the same native event boundary')
      buttons.forEach(button => button.click())
      assert.deepEqual(clicks, ['Follow', 'Share', 'Sort', '1-50'])
      f.native.restoreMovedNodes(f.state.movedNodes)
      assert.equal(info.parentElement, f.origin)
      assert.equal(toolbar.parentElement, f.origin)
      assert.equal(playlist.parentElement, f.origin)
      f.native.moveOrReplaceNode(f.constants.selectors.playlist, f.state.panels.playlist, f.state.movedNodes)
      playlist.remove()
      f.ready.set(playlist, false)
      f.native.restoreMovedNodes(f.state.movedNodes)
      assert.equal(playlist.isConnected, false, 'episode navigation never restores an already destroyed React shell')
    }
    finally { f.dispose() }
  })

  check('playback content: native transfer retains four listeners and never resurrects discarded component DOM', async () => {
    const f = await fixture()
    const { state, native, constants } = f
    try {
      const buttons = [...f.origin.querySelectorAll('button')]
      const invoked = []
      buttons.forEach(button => button.addEventListener('click', () => invoked.push(button.textContent)))
      native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes)
      native.moveOrReplaceNode(constants.selectors.tags, state.tagsSlot, state.movedNodes)
      const toolbar = state.toolbarSlot.firstElementChild
      const tags = state.tagsSlot.firstElementChild
      for (const button of buttons)
        button.click()
      assert.deepEqual(invoked, ['Like', 'Coin', 'Favorite', 'Share'])
      native.restoreMovedNodes(state.movedNodes)
      assert.equal(toolbar.parentElement, f.origin)
      native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes)
      native.moveOrReplaceNode(constants.selectors.tags, state.tagsSlot, state.movedNodes)
      const observer = new MutationObserver(() => {})
      observer.observe(state.root, { childList: true, subtree: true })
      toolbar.remove()
      tags.remove()
      const removals = observer.takeRecords()
      observer.disconnect()
      assert.ok(removals.every(record => native.classifyWidescreenMutation(record, state).relevant))
      assert.equal(native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes).found, false)
      assert.equal(native.moveOrReplaceNode(constants.selectors.tags, state.tagsSlot, state.movedNodes).found, false)
      assert.equal(state.toolbarSlot.firstElementChild, null)
      assert.equal(state.tagsSlot.firstElementChild, null)
      observer.observe(state.root, { childList: true, subtree: true })
      const animationHost = state.toolbarSlot.appendChild(document.createElement('div'))
      animationHost.className = 'video-toolbar-container'
      observer.takeRecords()
      animationHost.appendChild(document.createElement('canvas'))
      state.panels.comment.firstElementChild.appendChild(document.createElement('p'))
      const localUpdates = observer.takeRecords()
      observer.disconnect()
      assert.ok(localUpdates.every(record => !native.classifyWidescreenMutation(record, state).relevant), 'action animation and comment rows must not trigger full sidebar hydration')
      native.restoreMovedNodes(state.movedNodes)
      assert.equal(toolbar.isConnected, false)
      animationHost.remove()
      assert.equal(native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes).found, false, 'released navigation state cannot recover old nodes')
    }
    finally {
      f.dispose()
    }
  })

  check('playback content: SSR and unmounted replacements wait for the MAIN component owner', async () => {
    const f = await fixture()
    const { state, native, constants, ready } = f
    try {
      const toolbar = f.origin.querySelector('#arc_toolbar_report')
      ready.set(toolbar, false)
      assert.equal(native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes).found, false)
      assert.equal(toolbar.parentElement, f.origin)
      assert.equal(state.movedNodes.length, 0)
      ready.set(toolbar, true)
      assert.equal(native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes).found, true)
      const replacement = f.origin.appendChild(document.createElement('div'))
      replacement.id = 'arc_toolbar_report'
      replacement.className = 'video-toolbar-container'
      ready.set(replacement, false)
      assert.equal(native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes).changed, false)
      assert.equal(state.toolbarSlot.firstElementChild, toolbar, 'pending markup does not replace the working native toolbar')
      ready.set(replacement, true)
      assert.equal(native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes).changed, true)
      assert.equal(state.toolbarSlot.firstElementChild, replacement)
      ready.set(replacement, false)
      assert.equal(native.moveOrReplaceNode(constants.selectors.toolbar, state.toolbarSlot, state.movedNodes).found, false)
      assert.equal(state.toolbarSlot.firstElementChild, null)
    }
    finally {
      f.dispose()
    }
  })

  check('playback content: late native descriptions become visible and outer aliases cannot replace their inner content', async () => {
    const f = await fixture()
    const { state, native, constants, description } = f
    try {
      const nativeDescription = f.origin.querySelector('#v_desc')
      const outer = document.createElement('div')
      outer.className = 'video-desc-container'
      nativeDescription.before(outer)
      nativeDescription.classList.remove('video-desc-container')
      outer.append(nativeDescription)
      native.moveOrReplaceNode(constants.selectors.description, state.descriptionSlot, state.movedNodes)
      description.syncDescription(state)
      assert.equal(state.descriptionSlot.classList.contains('is-empty'), true)
      const basic = nativeDescription.querySelector('.basic-desc-info')
      const observer = new MutationObserver(() => {})
      observer.observe(state.root, { childList: true, subtree: true })
      basic.textContent = 'Description loaded after the initial sidebar pass'
      const mutations = observer.takeRecords()
      observer.disconnect()
      assert.equal(native.classifyWidescreenMutation(mutations[0], state).relevant, true)
      assert.equal(native.moveOrReplaceNode(constants.selectors.description, state.descriptionSlot, state.movedNodes).changed, false)
      assert.equal(state.descriptionSlot.contains(nativeDescription), true)
      description.syncDescription(state)
      assert.equal(state.descriptionSlot.classList.contains('is-empty'), false)
      assert.equal(state.descriptionSlot.lastElementChild.className, 'bewly-widescreen-description-toggle')
      native.restoreMovedNodes(state.movedNodes)
      assert.equal(nativeDescription.parentElement, outer)
    }
    finally {
      f.dispose()
    }
  })

  check('playback content: actual sidebar hydration cannot treat API counters as working native actions', async () => {
    const f = await fixture()
    const { state, constants, native, description } = f
    const session = { current: state }
    let now = 0
    const timers = new Map()
    let timerId = 0
    const sidebar = await loadSourceModule('../src/utils/bewlyWidescreen/sidebar.ts', {
      '~/utils/bewlyWidescreen/actionEffects': { scheduleActionGeometrySync() {}, syncActionAnimationTheme() {} },
      '~/utils/bewlyWidescreen/constants': constants,
      '~/utils/bewlyWidescreen/danmaku': { activateDanmakuTab() {}, clearDanmakuActivation() {}, isDanmakuPanelReady: () => false, syncDanmakuInputSource() {} },
      '~/utils/bewlyWidescreen/description': description,
      '~/utils/bewlyWidescreen/geometry': { ensureAnchoredPlayer() {}, schedulePlayerResizeSync() {}, syncAuxiliaryControlGeometry() {}, syncControlsGlassGeometry() {} },
      '~/utils/bewlyWidescreen/labels': { t: key => key },
      '~/utils/bewlyWidescreen/nativeControls': { syncNativePlayerControlVisibility() {} },
      '~/utils/bewlyWidescreen/nativeDom': native,
      '~/utils/bewlyWidescreen/playlist': { clearEpisodeSectionMarker() {}, placeRecommendAfterPlaylist() {}, syncEpisodeSectionMarker() {}, syncPlaylistToggleButton() {} },
      '~/utils/bewlyWidescreen/session': { session },
      '~/utils/bewlyWidescreen/shell': { scheduleInitialPanelScrollReset() {} },
      '~/utils/bewlyWidescreen/videoInfo': { syncVideoMetadata: () => true, renderFallbackVideoInfo() {}, syncSidebarTitle() {} },
      '~/utils/bewlyWidescreenPolicy': await import('../src/utils/bewlyWidescreenPolicy'),
      '~/utils/videoMetadataBridge': { isNativeVideoComponentReady: () => true },
    }, {
      Date: { now: () => now },
      setTimeout: (run) => {
        timers.set(++timerId, run)
        return timerId
      },
      clearTimeout: id => timers.delete(id),
    })
    try {
      const toolbar = f.origin.querySelector('#arc_toolbar_report')
      toolbar.remove()
      state.videoInfoData = { title: 'Known video', stat: { like: 1 } }
      state.toolbarSlot.innerHTML = '<div class="bewly-widescreen-fallback-stats">Known counters</div>'
      sidebar.startSidebarHydration(state)
      assert.equal(state.root.dataset.sidebarCommentReady, 'true')
      assert.equal(state.root.dataset.sidebarTopReady, 'false')
      assert.equal(state.root.dataset.sidebarContentReady, 'false')
      now = constants.SIDEBAR_HYDRATION_TIMEOUT
      const next = timers.values().next().value
      timers.clear()
      next()
      assert.equal(state.sidebarHydrationTimedOut, true)
      assert.ok(state.sidebarTop.querySelector('.bewly-widescreen-panel-error'))
      f.origin.append(toolbar)
      sidebar.startSidebarHydration(state)
      assert.equal(state.toolbarSlot.querySelector('#arc_toolbar_report'), toolbar)
      assert.equal(state.root.dataset.sidebarContentReady, 'true')
      assert.equal(state.sidebarTop.querySelector('.bewly-widescreen-panel-error'), null)
      assert.equal(timers.size, 0)
    }
    finally {
      sidebar.clearSidebarHydration(state)
      f.dispose()
    }
  })
}
