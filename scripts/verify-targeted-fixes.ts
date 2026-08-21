import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

import { normalizeMomentCommentPage } from '../src/components/MomentCard/commentUtils'
import { AppPage } from '../src/enums/appEnums'
import { isAccountRequestCurrent } from '../src/utils/accountScope'
import { resolveActiveDockItemPage } from '../src/utils/dockActiveItem'
import { applyConfiguredPlaybackRate, resolvePlaybackRateChange } from '../src/utils/playbackRate'
import { getRangeProgress } from '../src/utils/range'

function verifyAccountScopes() {
  for (const flow of ['History load', 'UserPanel load', 'History delete']) {
    let currentAccountId = 1
    let requestGeneration = 0
    const requestAccountId = currentAccountId
    const generation = requestGeneration
    const state = ['account-b-state']

    currentAccountId = 2
    requestGeneration++
    if (isAccountRequestCurrent(requestAccountId, generation, currentAccountId, requestGeneration))
      state.push('stale-account-a-result')

    assert.deepEqual(state, ['account-b-state'], `${flow} must reject an account A response after switching to B`)
  }
}

function verifyPlaybackRatePolicy() {
  let savedPlaybackRate = 2
  const video = { defaultPlaybackRate: 1, playbackRate: 1 }
  const delayedResetDecision = resolvePlaybackRateChange(video.playbackRate, savedPlaybackRate, false)
  assert.equal(delayedResetDecision.type, 'restore')
  if (delayedResetDecision.type === 'restore')
    applyConfiguredPlaybackRate(video, savedPlaybackRate)
  assert.equal(video.playbackRate, 2)
  assert.equal(video.defaultPlaybackRate, 2)
  assert.equal(savedPlaybackRate, 2)

  video.playbackRate = 1.5
  const userDecision = resolvePlaybackRateChange(video.playbackRate, savedPlaybackRate, true)
  assert.deepEqual(userDecision, { type: 'save', rate: 1.5 })
  if (userDecision.type === 'save')
    savedPlaybackRate = userDecision.rate
  assert.equal(savedPlaybackRate, 1.5)
}

function verifySliderProgress() {
  let parentValue = 1
  parentValue = 50
  assert.equal(getRangeProgress(parentValue, 0, 100), 50)
  parentValue = 20
  assert.equal(getRangeProgress(parentValue, 0, 100), 20)
  assert.equal(getRangeProgress(20, 10, 10), 0)
}

function verifyDockReorderPolicy() {
  const initial = [AppPage.Home, AppPage.Anime, AppPage.History].map(page => ({ page }))
  const reordered = [AppPage.Anime, AppPage.History, AppPage.Home].map(page => ({ page }))
  assert.equal(resolveActiveDockItemPage(initial, AppPage.Home, true, true), AppPage.Home)
  assert.equal(resolveActiveDockItemPage(reordered, AppPage.Home, true, true), AppPage.Home)
  assert.equal(reordered.findIndex(item => item.page === AppPage.Home), 2)

  const hidden = reordered.filter(item => item.page !== AppPage.Home)
  assert.equal(resolveActiveDockItemPage(hidden, AppPage.Home, true, true), undefined)
  assert.equal(resolveActiveDockItemPage(reordered, AppPage.Home, true, true), AppPage.Home)

  const nonActiveReorder = [AppPage.History, AppPage.Anime, AppPage.Home].map(page => ({ page }))
  assert.equal(resolveActiveDockItemPage(nonActiveReorder, AppPage.Home, true, true), AppPage.Home)
}

function verifyCommentRichText() {
  const response = {
    code: 0,
    data: {
      page: { num: 1, size: 8, count: 1 },
      replies: [{
        rpid: 1,
        ctime: 100,
        member: { mid: 10, uname: 'Author', avatar: 'author.webp', vip: {} },
        content: {
          message: 'plain [doge] @Alice [unknown]',
          emote: { '[doge]': { url: 'https://i.example/doge.webp' } },
          members: [{ mid: 20, uname: 'Alice' }],
        },
        replies: [{
          rpid: 2,
          ctime: 101,
          member: { mid: 11, uname: 'Reply', avatar: 'reply.webp', vip: {} },
          content: {
            message: 'nested [tv]',
            emote: { '[tv]': { url: 'https://i.example/tv.webp' } },
          },
        }],
      }],
    },
  }

  const page = normalizeMomentCommentPage(response, 1, 8)
  const comment = page.items[0]
  assert.ok(comment)
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('plain')))
  assert.ok(comment.segments.some(segment => segment.type === 'emote' && segment.text === '[doge]'))
  assert.ok(comment.segments.some(segment => segment.type === 'mention' && segment.mid === '20'))
  assert.ok(comment.segments.some(segment => segment.type === 'text' && segment.text.includes('[unknown]')))
  assert.ok(comment.replies[0]?.segments.some(segment => segment.type === 'emote' && segment.text === '[tv]'))
}

async function verifyComponentContracts() {
  const root = process.cwd()
  const [
    dock,
    sidebar,
    slider,
    watchLater,
    gridCard,
    commentSection,
    commentRichText,
    layoutEdit,
    historyPop,
    userPanelPop,
    player,
  ] = await Promise.all([
    readFile(`${root}/src/components/Dock/Dock.vue`, 'utf8'),
    readFile(`${root}/src/components/SideBar/SideBar.vue`, 'utf8'),
    readFile(`${root}/src/components/Slider.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/WatchLater/WatchLater.vue`, 'utf8'),
    readFile(`${root}/src/contentScripts/views/WatchLater/WatchLaterGridCard.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCommentSection.vue`, 'utf8'),
    readFile(`${root}/src/components/MomentCard/MomentCommentRichText.vue`, 'utf8'),
    readFile(`${root}/src/logic/layoutEdit.ts`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/HistoryPop.vue`, 'utf8'),
    readFile(`${root}/src/components/TopBar/components/pops/UserPanelPop.vue`, 'utf8'),
    readFile(`${root}/src/utils/player.ts`, 'utf8'),
  ])

  assert.match(dock, /ref="dockIndicatorRef"/)
  assert.match(dock, /updateIndicator\(false\)/)
  assert.match(dock, /:aria-label="\$t\(dockItem\.i18nKey\)"/)
  assert.match(dock, /dock-theme-toggle/)
  assert.match(dock, /dock-collapse-toggle/)
  assert.match(dock, /dock-refresh-back-to-top-action/)
  assert.match(sidebar, /sidebar-theme-toggle/)
  assert.match(sidebar, /sidebar-auto-hide/)
  assert.match(sidebar, /:aria-label="isLayoutEditing/)

  assert.doesNotMatch(slider, /ref\(props\.modelValue\)/)
  assert.doesNotMatch(slider, /addEventListener\('input'/)
  assert.match(slider, /v-model\.number="model"/)
  assert.match(slider, /--slider-progress/)

  assert.match(watchLater, /function playAndRemove/)
  assert.match(watchLater, /function playInWatchLater/)
  assert.match(watchLater, /function remove/)
  assert.match(watchLater, /<IconButton/)
  assert.match(gridCard, /:disabled="disabled"/)

  assert.match(commentSection, /tabindex="-1"/)
  assert.match(commentSection, /aria-hidden="true"/)
  assert.match(commentSection, /MomentCommentRichText :segments="reply\.segments"/)
  assert.match(commentRichText, /@error="markEmoteFailed/)

  assert.match(historyPop, /watch\(currentAccountId/)
  assert.match(historyPop, /async function deleteHistoryItem[\s\S]*isAccountRequestCurrent/)
  assert.match(userPanelPop, /watch\(\[currentAccountId, shouldLoadLoginLog\]/)
  assert.match(userPanelPop, /function clearAccountData/)
  assert.match(player, /PLAYBACK_RATE_USER_INTENT_DURATION_MS/)
  assert.match(player, /bpx-player-ctrl-playbackrate-menu-item/)
  assert.match(player, /playbackRateEnhancementTimers/)
  assert.match(player, /playbackRateLifecycleActive = false/)
  assert.match(player, /resolvePlaybackRateChange/)

  for (const id of [
    'dock-theme-toggle',
    'dock-collapse-toggle',
    'dock-refresh-action',
    'dock-back-to-top-action',
    'dock-refresh-back-to-top-action',
    'dock-undo-refresh-action',
    'dock-forward-refresh-action',
    'sidebar-theme-toggle',
    'sidebar-auto-hide',
  ]) {
    assert.match(layoutEdit, new RegExp(`id: '${id}'`))
  }
}

async function verify() {
  verifyAccountScopes()
  verifyPlaybackRatePolicy()
  verifySliderProgress()
  verifyDockReorderPolicy()
  verifyCommentRichText()
  await verifyComponentContracts()
  console.log('Targeted fix verification passed.')
}

void verify()
