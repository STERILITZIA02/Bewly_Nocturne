import assert from 'node:assert/strict'

import { loadSourceModule } from './sourceModuleHarness'

export function registerAdvertisingRuleChecks(check, { flush }) {
  check('advertising: real observer identifies explicit ads without hiding normal recommendations or native controls', async () => {
    const frames = new Map()
    let frameId = 0
    const blocker = await loadSourceModule('../src/contentScripts/features/blockUselessFeedCards.ts', {}, {
      MutationObserver,
      requestAnimationFrame: (run) => {
        frames.set(++frameId, run)
        return frameId
      },
      cancelAnimationFrame: id => frames.delete(id),
    })
    const settle = async () => {
      for (let i = 0; i < 5; i++) {
        await flush()
        for (const [id, run] of frames) {
          frames.delete(id)
          run()
        }
      }
      assert.equal(frames.size, 0, 'marking a card must not leave a repaint loop')
    }
    const host = document.body.appendChild(document.createElement('section'))
    host.innerHTML = '<div class="feed-card" id="normal"><div class="bili-video-card is-rcmd"><a href="https://www.bilibili.com/video/BV1ab411c7mD/">Normal video</a><span></span></div></div><div class="feed-card" id="commercial"><div class="bili-feed-card"><div class="bili-video-card"><span class="bili-video-card__info--ad">广告</span></div></div></div><div id="arc_toolbar_report"><button>Native action</button><input value="draft"><span class="ad-feedback-entry"></span></div><div id="v_desc">简介中的广告一词不是广告标记</div>'
    const normal = host.querySelector('#normal')
    const commercial = host.querySelector('#commercial')
    const marker = normal.querySelector('span')
    const link = normal.querySelector('a')
    try {
      assert.equal(blocker.shouldEnableUselessFeedCardBlocker({ blockAds: true, homePage: false, searchPage: true, inIframe: true }), true)
      assert.equal(blocker.shouldEnableUselessFeedCardBlocker({ blockAds: false, homePage: true, searchPage: true, inIframe: false }), false)
      blocker.setUselessFeedCardBlockerEnabled(true)
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), false, 'missing no-interest controls do not imply an advertisement')
      assert.equal(commercial.classList.contains('bewly-blocked-feed-card'), true)
      assert.equal(commercial.firstElementChild.classList.contains('bewly-blocked-feed-card'), false, 'only the outer card owns the hidden slot')
      marker.className = 'ad-feedback-entry'
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), true)
      marker.className = ''
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), false)
      link.href = 'https://cm.bilibili.com/cm/api/noticeUrl?fixture=1'
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), true)
      link.href = 'https://www.bilibili.com/video/BV1ab411c7mD/'
      await settle()
      assert.equal(normal.classList.contains('bewly-blocked-feed-card'), false)
      assert.equal(host.querySelector('#arc_toolbar_report').classList.contains('bewly-blocked-feed-card'), false)
      assert.equal(host.querySelector('input').value, 'draft')
      assert.equal(host.querySelector('#v_desc').textContent, '简介中的广告一词不是广告标记')
      blocker.setUselessFeedCardBlockerEnabled(false)
      host.innerHTML = '<div class="video-list"><div class="col_3"><div class="bili-video-card"><span class="ad-feedback-entry"></span></div></div><div class="col_3"><div class="bili-video-card">Normal search result</div></div></div>'
      blocker.setUselessFeedCardBlockerEnabled(true)
      await settle()
      const results = host.querySelectorAll('.col_3')
      assert.equal(results[0].classList.contains('bewly-blocked-feed-card'), true)
      assert.equal(results[1].classList.contains('bewly-blocked-feed-card'), false)
      results[0].querySelector('span').remove()
      await settle()
      assert.equal(results[0].classList.contains('bewly-blocked-feed-card'), false)
    }
    finally {
      blocker.setUselessFeedCardBlockerEnabled(false)
      host.remove()
    }
    await settle()
    assert.equal(frames.size, 0)
  })
}
