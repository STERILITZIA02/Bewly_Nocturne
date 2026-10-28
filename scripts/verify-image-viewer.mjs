import assert from 'node:assert/strict'

/**
 * The shared image viewer: gallery normalisation and view geometry as pure
 * functions, the document-wide open/close ownership, and the real component
 * (load, zoom, navigation, keyboard, failure and close) with stand-in images.
 */
export function registerImageViewerChecks(check, { Vue, compileComponent, flush }) {
  check('image viewer geometry: gallery de-duplication, fit, anchored zoom, pan limits and origin morph', async () => {
    const geometry = await import('../src/utils/imageViewer')
    const gallery = geometry.normalizeImageViewerGallery([
      '//i0.hdslb.com/bfs/a.jpg@240w.webp',
      'https://i0.hdslb.com/bfs/b.png',
      'https://i0.hdslb.com/bfs/a.jpg',
      '',
      'blob:https://www.bilibili.com/1',
    ], 2)
    assert.deepEqual(gallery.urls, ['https://i0.hdslb.com/bfs/a.jpg', 'https://i0.hdslb.com/bfs/b.png', 'blob:https://www.bilibili.com/1'], 'one entry per resource, original format kept, drafts kept')
    assert.equal(gallery.index, 0, 'the clicked duplicate maps onto its resource')
    assert.equal(geometry.normalizeImageViewerGallery(['https://example.test/a.png'], 9).index, 0)
    assert.equal(geometry.normalizeImageViewerGallery(['javascript:alert(1)'], 0).urls.length, 0)

    assert.equal(geometry.getFitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }), 0.5)
    assert.equal(geometry.getFitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, 90), 0.5)
    assert.equal(geometry.getFitScale({ width: 200, height: 100 }, { width: 1000, height: 1000 }), 1, 'small images are never enlarged to fit')
    assert.equal(geometry.clampScale(99, 0.5), geometry.IMAGE_VIEWER_MAX_SCALE)
    assert.equal(geometry.clampScale(0.1, 0.5), 0.5)
    assert.equal(geometry.getDetailScale(0.3), 1)
    assert.equal(geometry.getDetailScale(1), 2)

    const point = { x: 120, y: -40 }
    const pan = geometry.zoomPanAt({ x: 10, y: 20 }, 0.5, 2, point)
    // The image pixel under the point is the same before and after.
    assert.deepEqual({ x: (point.x - 10) / 0.5, y: (point.y - 20) / 0.5 }, { x: (point.x - pan.x) / 2, y: (point.y - pan.y) / 2 })

    const bounds = geometry.getPanBounds({ width: 1000, height: 500 }, { width: 800, height: 600 }, { x: 400, y: 300 }, 1, 0)
    assert.deepEqual(bounds.x, { min: -100, max: 100 }, 'a wider image moves until an edge meets the viewport edge')
    assert.deepEqual(bounds.y, { min: -50, max: 50 }, 'a shorter image moves within the viewport')
    assert.deepEqual(geometry.clampPan({ x: 500, y: -500 }, bounds), { x: 100, y: -50 })
    assert.ok(geometry.resistPan({ x: 160, y: 0 }, bounds).x === 120, 'past the limit the image follows at a third')

    const morph = geometry.getOriginMorph({ left: 0, top: 0, width: 100, height: 100 }, { left: 200, top: 100, width: 400, height: 200 }, { width: 800, height: 400 }, 8)
    assert.equal(morph.scale, 0.5, 'covers the square thumbnail')
    assert.equal(morph.dx, 50 - 400)
    assert.equal(morph.dy, 50 - 200)
    assert.equal(morph.clip, 'inset(0px 200px round 32px)', 'crops the sides like object-fit: cover, radius in image pixels')
    assert.equal(geometry.isUsableOrigin({ left: -500, top: 0, width: 100, height: 100 }, { width: 800, height: 600 }), false)
  })

  check('image viewer ownership: one viewer per document, owners close only their own, closing reports the last image', async () => {
    const viewer = await import('../src/composables/useImageViewer')
    const host = viewer.useImageViewerHost()
    const closed = []
    const first = viewer.openImageViewer({ urls: ['https://example.test/a.png', 'https://example.test/b.png'], index: 1, onClose: index => closed.push(['first', index]) })
    assert.ok(first)
    assert.equal(host.index.value, 1)
    assert.equal(viewer.openImageViewer({ urls: [], index: 0 }), 0, 'an empty gallery does not open')
    host.index.value = 0
    const second = viewer.openImageViewer({ urls: ['https://example.test/c.png'], index: 0, onClose: index => closed.push(['second', index]) })
    assert.deepEqual(closed, [['first', 0]], 'a replaced request still hears its close')
    viewer.closeImageViewer(first)
    assert.equal(host.open.value, true, 'a stale owner cannot close the current viewer')
    viewer.closeImageViewer(second)
    assert.equal(host.open.value, false)
    assert.deepEqual(closed.at(-1), ['second', 0])
    host.release()
    assert.equal(host.request.value, null, 'the gallery is dropped after the leave animation')

    const scope = Vue.effectScope()
    const owner = scope.run(() => viewer.useImageViewer())
    owner.open({ urls: ['https://example.test/d.png'], index: 0 })
    assert.equal(owner.isOpen.value, true)
    scope.stop()
    assert.equal(host.open.value, false, 'the viewer closes with the component that opened it')
    host.release()
  })

  check('image viewer component: loads, zooms around the pointer, navigates, retries failures and closes', async () => {
    const sizes = new Map([['https://example.test/a.png', [2000, 1000]], ['https://example.test/b.png', [400, 300]]])
    class FakeImage {
      decoding = 'auto'
      naturalWidth = 0
      naturalHeight = 0
      onload = null
      onerror = null
      source = ''
      get src() { return this.source }
      set src(value) {
        this.source = value
        queueMicrotask(() => {
          const size = sizes.get(value)
          if (!size) {
            this.onerror?.()
            return
          }
          ;[this.naturalWidth, this.naturalHeight] = size
          this.onload?.()
        })
      }

      decode() { return Promise.resolve() }
    }
    const passthrough = { inheritAttrs: false, setup: (_props, { slots }) => () => slots.default?.() }
    // jsdom has no element scrolling; the filmstrip centres its active thumbnail with it.
    window.HTMLElement.prototype.scrollTo ??= function scrollTo() {}
    const Viewer = await compileComponent('../src/components/ImageViewer/ImageViewer.vue', {
      'tabbable': await import('tabbable'),
      'vue-i18n': { useI18n: () => ({ t: (key, values) => values ? `${key}:${JSON.stringify(values)}` : key }) },
      '~/components/CloseButton.vue': { default: { props: ['label'], setup: (props, { attrs }) => () => Vue.h('button', { ...attrs, 'aria-label': props.label }) } },
      '~/components/Tooltip.vue': { default: passthrough },
      '~/components/MomentCard/utils': { getMomentThumbnailUrl: source => source },
      '~/utils/imageViewer': await import('../src/utils/imageViewer'),
      '~/utils/reducedMotion': { prefersReducedMotion: () => true },
    }, { globals: { Image: FakeImage, queueMicrotask } })

    const index = Vue.ref(0)
    const open = Vue.ref(true)
    const events = []
    const request = { id: 1, startIndex: 0, urls: ['https://example.test/a.png', 'https://example.test/b.png', 'https://example.test/missing.png'] }
    const host = document.body.appendChild(document.createElement('div'))
    const app = Vue.createApp({ render: () => Vue.h(Viewer, {
      'request': request,
      'open': open.value,
      'index': index.value,
      'onUpdate:index': value => index.value = value,
      'onClose': () => events.push('close'),
      'onClosed': () => events.push('closed'),
    }) })
    const errors = []
    app.config.errorHandler = error => errors.push(error)
    try {
      app.mount(host)
      await flush()
      await flush()
      const root = host.querySelector('.bew-image-viewer')
      assert.equal(root.getAttribute('role'), 'dialog')
      assert.equal(document.activeElement, root, 'the viewer takes focus for its keys')
      let image = host.querySelector('.bew-image-viewer__image')
      assert.ok(image, 'the decoded image is shown')
      assert.equal(image.style.width, '2000px')
      const percent = () => host.querySelector('.bew-image-viewer__percent').textContent.trim()
      const fitted = percent()
      assert.match(fitted, /^\d+%$/)
      assert.ok(Number.parseInt(fitted) < 100, 'a large image starts fitted')

      host.querySelector('[aria-label="image_viewer.zoom_in"]').click()
      await flush()
      assert.ok(Number.parseInt(percent()) > Number.parseInt(fitted))
      assert.equal(root.dataset.zoomed, '')
      root.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
      await flush()
      assert.equal(percent(), fitted, '0 returns to the fitted view')
      root.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
      await flush()
      assert.equal(percent(), '100%', '1 shows actual pixels')

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await flush()
      await flush()
      assert.equal(index.value, 1)
      image = host.querySelector('.bew-image-viewer__image')
      assert.equal(image.getAttribute('src'), 'https://example.test/b.png')
      assert.equal(percent(), '100%', 'a small image is not enlarged and the view resets per image')
      assert.equal(host.querySelector('[aria-current="true"]').getAttribute('aria-label'), 'image_viewer.position:{"index":2,"count":3}')

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await flush()
      await flush()
      assert.equal(index.value, 2)
      assert.ok(host.querySelector('[role="alert"]'), 'a failed image explains itself')
      sizes.set('https://example.test/missing.png', [800, 800])
      host.querySelector('.bew-image-viewer__retry').click()
      await flush()
      await flush()
      assert.equal(host.querySelector('[role="alert"]'), null)
      assert.ok(host.querySelector('.bew-image-viewer__image'), 'retry loads the image')

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await flush()
      assert.equal(index.value, 0, 'navigation wraps')
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
      await flush()
      assert.equal(index.value, 2)

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      assert.deepEqual(events, ['close'])
      open.value = false
      await flush()
      assert.deepEqual(events, ['close', 'closed'], 'without motion the viewer finishes closing at once')
      assert.equal(document.documentElement.classList.contains('bewly-image-viewer-open'), false)
      assert.deepEqual(errors, [])
    }
    finally {
      app.unmount()
      host.remove()
    }
  })
}
