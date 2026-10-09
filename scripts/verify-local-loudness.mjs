import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

import { loadSourceModule } from './sourceModuleHarness'

const source = await readFile(new URL('../src/inject/audio/localLoudnessProcessor.js', import.meta.url), 'utf8')
function processor(rate, volume = 1) {
  let Processor
  class AudioWorkletProcessor {
    port = { messages: [], postMessage(data) { this.messages.push(data) }, close() {} }
  }
  vm.runInNewContext(source, { AudioWorkletProcessor, sampleRate: rate, registerProcessor: (_, value) => Processor = value })
  return new Processor({ processorOptions: { active: true, volume, report: true, target: -18, strength: 0.75 } })
}

function render(dsp, rate, channels, seconds, signal, offset = 0) {
  let peak = 0
  let energy = 0
  let count = 0
  const input = Array.from({ length: channels }, () => new Float32Array(128))
  const output = [new Float32Array(128), new Float32Array(128)]
  const total = Math.ceil(seconds * rate / 128) * 128
  for (let frame = 0; frame < total; frame += 128) {
    for (let channel = 0; channel < channels; channel++) {
      for (let i = 0; i < 128; i++)
        input[channel][i] = signal(frame + i + offset, channel)
    }
    assert.equal(dsp.process([input], [output]), true)
    for (const channel of output) {
      for (const value of channel) {
        assert.ok(Number.isFinite(value))
        peak = Math.max(peak, Math.abs(value))
        if (frame > total - rate) {
          energy += value * value
          count++
        }
      }
    }
  }
  return { peak, rms: Math.sqrt(energy / Math.max(count, 1)) }
}

export function registerLocalLoudnessChecks(check, { Vue, flush }) {
  check('local loudness control: shared player discovery/fit is dormant when off and keeps an accessible unsupported-media panel entry', async () => {
    const player = document.body.appendChild(document.createElement('section'))
    player.innerHTML = '<bwp-video></bwp-video><div class="bpx-player-control-bottom-right"></div>'
    const protocol = await import('../src/utils/localLoudnessProtocol')
    const settings = Vue.ref({ localLoudnessEnabled: false, language: 'en' })
    const ui = { localLoudnessPanelOpen: Vue.ref(false), localLoudnessState: Vue.ref('off'), notifyLocalLoudnessPanel() {}, observeLocalLoudnessState: () => () => {}, setLocalLoudnessMediaToken() {} }
    let discoveries = 0
    let active = 0
    let fit
    const control = await loadSourceModule('../src/contentScripts/localLoudnessControl.ts', {
      'vue': Vue,
      '~/composables/useLocalLoudness': ui,
      '~/composables/useRouteState': { onRouteChange: () => () => {} },
      '~/logic': { settings },
      '~/utils/i18n': { i18n: { global: { t: key => key } } },
      '~/utils/localLoudnessProtocol': protocol,
      '~/utils/main': { isVideoPlaybackPage: () => true },
      '~/utils/pageBridgeChannel': { getPageBridgeChannelId: () => 'channel' },
      '~/utils/playerMedia': { getVideoElement: () => player.querySelector('bwp-video'), getPlayerRoot: () => player },
      '~/utils/videoMetadataBridge': await import('../src/utils/videoMetadataBridge'),
      './playerControlFit': { registerPlayerControlFit: (_button, options) => {
        fit = options
        return { refresh() {}, dispose() {} }
      } },
      './playerControlTooltip': await import('../src/contentScripts/playerControlTooltip'),
      './playerDomLifecycle': { hasPlayerMediaMutation: () => true, observePlayerDom: (callback) => {
        discoveries++
        active++
        callback()
        return () => active--
      } },
    }, { location: window.location, crypto, CustomEvent })
    const stop = control.setupLocalLoudnessControl()
    try {
      assert.equal(discoveries, 0)
      settings.value.localLoudnessEnabled = true
      await flush()
      const button = player.querySelector('.bewly-local-loudness-control')
      assert.ok(button)
      assert.equal(fit.priority, 40)
      assert.equal(ui.localLoudnessState.value, 'unsupported')
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      assert.equal(ui.localLoudnessPanelOpen.value, false)
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      assert.equal(ui.localLoudnessPanelOpen.value, true)
      settings.value.localLoudnessEnabled = false
      await flush()
      assert.equal(active, 0)
      assert.equal(player.querySelector('.bewly-local-loudness-control'), null)
    }
    finally {
      stop()
      player.remove()
    }
  })

  check('local loudness bridge: only enabled current media creates a controller; native identity and session token reject stale bindings', async () => {
    const protocol = await import('../src/utils/localLoudnessProtocol')
    const metadata = await import('../src/utils/videoMetadataBridge')
    const href = window.location.href
    window.history.replaceState(null, '', '/video/BV1dpBoB7EMV/')
    const media = document.body.appendChild(document.createElement('video'))
    let created = 0
    let restored = 0
    const bindings = []
    const source = await loadSourceModule('../src/inject/audio/localLoudnessBridge.ts', {
      '~/utils/localLoudnessProtocol': protocol,
      '~/utils/videoMetadataBridge': { ...metadata, isPgcPlaybackPage: () => false },
      '../videoMetadata': { getNativePlayer: () => ({ mediaElement: () => media, getManifest: () => ({ aid: 1, bvid: 'BV1dpBoB7EMV', p: 1, cid: 2 }) }) },
      './mediaSourceOwnership': { trackMediaSourceOwnership: () => ({ dispose: () => restored++ }) },
      './localLoudness': { createLocalLoudnessController: () => {
        created++
        return { bind: (...args) => bindings.push(args), update() {}, showPanel() {}, suspend() {}, resume() {} }
      } },
    }, { location: window.location, CustomEvent, HTMLVideoElement: window.HTMLVideoElement })
    const bridge = source.setupLocalLoudnessBridge('channel')
    const bind = (token, extra = {}) => media.dispatchEvent(new CustomEvent(protocol.LOCAL_LOUDNESS_BIND, { bubbles: true, detail: JSON.stringify({ token, channelId: 'channel', href: window.location.href, ...extra }) }))
    try {
      bridge.update({ localLoudnessEnabled: false, localLoudnessTarget: -18, localLoudnessStrength: 75 })
      bind('old')
      assert.equal(created, 0)
      bridge.update({ localLoudnessEnabled: true, localLoudnessTarget: -18, localLoudnessStrength: 75 })
      assert.equal(created, 0, 'enabled preference without a valid media does not create an empty controller')
      bind('one')
      assert.equal(created, 1)
      bind('two')
      bind('one', { clear: true })
      bind('foreign', { channelId: 'wrong' })
      bind('old-page', { href: 'https://www.bilibili.com/video/av1/' })
      assert.equal(bindings.length, 2)
      assert.equal(bindings.at(-1)[1], 'two')
      bind('two', { clear: true })
      assert.equal(bindings.at(-1)[0], undefined)
    }
    finally {
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }))
      assert.equal(restored, 1)
      media.remove()
      window.history.replaceState(null, '', href)
    }
  })

  check('local loudness DSP: actual worklet handles 44.1/48/96 kHz mono/stereo, silence, steps, peaks and volume ratios with fixed buffers', () => {
    for (const rate of [44100, 48000, 96000]) {
      for (const channels of [1, 2]) {
        const dsp = processor(rate)
        const buffers = [dsp.blocks, ...dsp.delay, dsp.peakValues, dsp.peakFrames]
        const silence = render(dsp, rate, channels, 1, () => 0)
        assert.equal(silence.peak, 0)
        assert.equal(dsp.gainDb, 0)
        const quiet = render(dsp, rate, channels, 5, frame => Math.sin(2 * Math.PI * 997 * frame / rate) * 0.015)
        assert.ok(quiet.rms > 0.015 / Math.sqrt(2))
        assert.ok(dsp.gainDb <= 6.0001 && dsp.gainDb > 0)
        const loud = render(dsp, rate, channels, 4, frame => frame % 4096 < 128 ? 2 : Math.sin(2 * Math.PI * 997 * frame / rate) * 0.7)
        assert.ok(loud.peak <= 0.891251, `sample peak bound at ${rate}/${channels}: ${loud.peak}`)
        assert.ok(dsp.gainDb >= -18.001)
        assert.deepEqual([dsp.blocks, ...dsp.delay, dsp.peakValues, dsp.peakFrames], buffers)
        assert.equal(dsp.blocks.length, 30)
        assert.equal(dsp.delay[0].length, Math.ceil(rate * 0.005) + 2)
        const before = dsp.port.messages.length
        dsp.port.onmessage({ data: { type: 'configure', active: true, report: false } })
        render(dsp, rate, channels, 2, frame => 0.1 * Math.sin(frame))
        assert.equal(dsp.port.messages.length, before, 'closed panels cause no worklet telemetry')
        assert.ok(before <= 11)
        const low = processor(rate, 0.25)
        const high = processor(rate, 1)
        const a = render(low, rate, channels, 5, frame => Math.sin(2 * Math.PI * 997 * frame / rate) * 0.025)
        const b = render(high, rate, channels, 5, frame => Math.sin(2 * Math.PI * 997 * frame / rate) * 0.1)
        assert.ok(Math.abs(a.rms / b.rms - 0.25) < 0.002, 'automatic gain must not undo the user volume slider')
        dsp.port.onmessage({ data: { type: 'dispose' } })
        assert.equal(dsp.process([], []), false)
      }
    }
  })

  async function engineFixture() {
    const contexts = []
    const nodes = []
    const sourceOwners = new WeakMap()
    const urls = new Set()
    let moduleGate
    let allowResume = true
    let safeMedia = true
    let sourceCount = 0
    class Node {
      connections = new Set()
      connect(target) { this.connections.add(target) }
      disconnect(target) {
        if (target)
          this.connections.delete(target)
        else this.connections.clear()
      }
    }
    class Source extends Node {
      constructor(context, { mediaElement }) {
        super()
        if (sourceOwners.has(mediaElement))
          throw new Error('InvalidStateError')
        sourceCount++
        this.context = context
        this.mediaElement = mediaElement
        sourceOwners.set(mediaElement, this)
      }
    }
    class Context {
      state = 'suspended'
      destination = new Node()
      audioWorklet = { addModule: () => moduleGate ?? Promise.resolve() }
      constructor() { contexts.push(this) }
      createMediaElementSource(media) { return new Source(this, { mediaElement: media }) }
      resume() {
        if (allowResume) {
          this.state = 'running'
          queueMicrotask(() => this.onstatechange?.())
        }
        return Promise.resolve()
      }

      close() {
        this.state = 'closed'
        return Promise.resolve()
      }
    }
    class Worklet extends Node {
      port = {
        closed: false,
        messages: [],
        postMessage(data) { this.messages.push(data) },
        close() { this.closed = true },
      }

      constructor(context) {
        super()
        this.context = context
        nodes.push(this)
        queueMicrotask(() => this.port.onmessage?.({ data: { type: 'ready' } }))
      }
    }
    const environment = { AudioContext: Context, MediaElementAudioSourceNode: Source, AudioWorkletNode: Worklet, isSecureContext: true }
    const globals = { ...environment, globalThis: environment, HTMLMediaElement: window.HTMLMediaElement, HTMLVideoElement: window.HTMLVideoElement }
    const protocol = await import('../src/utils/localLoudnessProtocol')
    const ownership = await loadSourceModule('../src/inject/audio/mediaSourceOwnership.ts', {}, globals)
    const graph = await loadSourceModule('../src/inject/audio/localLoudnessGraph.ts', {
      '~/utils/abort': await import('../src/utils/abort'),
      '~/utils/localLoudnessProtocol': protocol,
      './localLoudnessProcessor.js?raw': { default: source },
    }, { ...globals, Blob, URL: {
      createObjectURL: () => {
        const id = crypto.randomUUID()
        urls.add(id)
        return id
      },
      revokeObjectURL: id => urls.delete(id),
    } })
    const compat = await loadSourceModule('../src/inject/audio/localLoudnessCompatibility.ts', {}, {
      document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() {
        if (!safeMedia)
          throw new Error('SecurityError')
      } }) }) },
    })
    const engine = await loadSourceModule('../src/inject/audio/localLoudness.ts', {
      '~/utils/localLoudnessProtocol': protocol,
      './localLoudnessCompatibility': compat,
      './localLoudnessGraph': graph,
      './mediaSourceOwnership': ownership,
    }, globals)
    const events = []
    const player = document.body.appendChild(document.createElement('section'))
    player.className = 'bpx-player-container'
    player.innerHTML = '<div class="bpx-player-ctrl-setting-loudness"><input type="radio" value="0" checked><input type="radio" value="1"></div>'
    const media = player.appendChild(document.createElement('video'))
    Object.defineProperties(media, { currentSrc: { value: 'blob:https://www.bilibili.com/media', writable: true }, readyState: { value: 4 }, paused: { value: false, writable: true }, videoWidth: { value: 1920 }, videoHeight: { value: 1080 } })
    let controller
    const trace = ownership.trackMediaSourceOwnership(media => controller?.handleConflict(media))
    controller = engine.createLocalLoudnessController((...args) => events.push(args), trace)
    return {
      controller,
      media,
      player,
      contexts,
      nodes,
      events,
      urls,
      environment,
      Source,
      Context,
      source: (video = media) => sourceOwners.get(video),
      count: () => sourceCount,
      setGate(value) { moduleGate = value },
      setResume(value) { allowResume = value },
      setSafe(value) { safeMedia = value },
      async settle() {
        for (let i = 0; i < 5; i++)
          await flush()
      },
      close() {
        controller.suspend(false)
        player.remove()
      },
    }
  }

  check('local loudness ownership: dormant creates no context; repeated toggles reuse one source and errors restore bypass before disposal', async () => {
    const fixture = await engineFixture()
    const { controller, media, contexts, nodes, events } = fixture
    try {
      controller.update({ enabled: false, target: -18, strength: 75 })
      assert.equal(contexts.length, 0)
      assert.equal(fixture.count(), 0)
      controller.bind(media, 'one')
      controller.update({ enabled: true, target: -18, strength: 75 })
      await fixture.settle()
      assert.equal(fixture.count(), 1)
      assert.equal(fixture.source().connections.has(nodes[0]), true)
      assert.equal(events.at(-1)[1], 'active')
      assert.equal(fixture.urls.size, 0)
      for (let i = 0; i < 4; i++) {
        controller.update({ enabled: false, target: -18, strength: 75 })
        assert.equal(fixture.source().connections.has(contexts[0].destination), true)
        assert.equal(nodes.at(-1).port.closed, true)
        controller.update({ enabled: true, target: -18, strength: 75 })
        await fixture.settle()
      }
      assert.equal(fixture.count(), 1)
      const lateProcessorError = nodes.at(-1).onprocessorerror
      media.paused = true
      media.dispatchEvent(new Event('pause'))
      assert.equal(nodes.at(-1).port.closed, true, 'pause removes idle DSP work, keeping the source bypass')
      assert.equal(fixture.source().connections.has(contexts[0].destination), true)
      media.paused = false
      media.dispatchEvent(new Event('play', { bubbles: true }))
      await fixture.settle()
      assert.equal(fixture.count(), 1)
      lateProcessorError()
      assert.equal(nodes.at(-1).port.closed, false, 'a retired processor cannot fail a newer processor on the same media')
      controller.showPanel(false)
      assert.equal(nodes.at(-1).port.messages.at(-1).report, false)
      nodes.at(-1).onprocessorerror()
      assert.equal(fixture.source().connections.has(contexts[0].destination), true)
      assert.equal(nodes.at(-1).port.closed, true)
      assert.equal(events.at(-1)[1], 'error')
      assert.equal(contexts[0].state, 'running')
    }
    finally { fixture.close() }
  })

  check('local loudness compatibility: native-on/unknown, foreign source, tainted media and suspended contexts never capture audio', async () => {
    for (const scenario of ['native-on', 'native-unknown', 'source-in-use', 'unsupported', 'gesture']) {
      const fixture = await engineFixture()
      try {
        if (scenario === 'native-on') {
          fixture.player.querySelector('input[value="0"]').checked = false
          fixture.player.querySelector('input[value="1"]').checked = true
        }
        if (scenario === 'native-unknown')
          fixture.player.querySelector('.bpx-player-ctrl-setting-loudness').remove()
        if (scenario === 'source-in-use')
          new fixture.Context().createMediaElementSource(fixture.media)
        if (scenario === 'unsupported')
          fixture.setSafe(false)
        if (scenario === 'gesture')
          fixture.setResume(false)
        const before = fixture.count()
        fixture.controller.bind(fixture.media, 'one')
        fixture.controller.update({ enabled: true, target: -18, strength: 75 })
        await fixture.settle()
        assert.equal(fixture.events.at(-1)[1], scenario)
        assert.equal(fixture.count(), before)
        assert.equal(fixture.nodes.length, 0)
      }
      finally { fixture.close() }
    }
  })

  check('local loudness navigation: retired outputs disconnect, active PiP retains a dry path, hidden playback keeps DSP and stops only telemetry', async () => {
    const fixture = await engineFixture()
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const pip = Object.getOwnPropertyDescriptor(document, 'pictureInPictureElement')
    const second = fixture.player.appendChild(document.createElement('video'))
    Object.defineProperties(second, { currentSrc: { value: 'blob:https://www.bilibili.com/second' }, readyState: { value: 4 }, paused: { value: false }, videoWidth: { value: 1920 }, videoHeight: { value: 1080 } })
    try {
      fixture.controller.bind(fixture.media, 'first')
      fixture.controller.update({ enabled: true, target: -18, strength: 75 })
      await fixture.settle()
      fixture.controller.showPanel(true)
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      assert.equal(fixture.nodes.at(-1).port.closed, false)
      assert.equal(fixture.nodes.at(-1).port.messages.at(-1).active, true)
      assert.equal(fixture.nodes.at(-1).port.messages.at(-1).report, false)
      Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: fixture.media })
      fixture.controller.bind(second, 'second')
      await fixture.settle()
      assert.equal(fixture.source().connections.has(fixture.contexts[0].destination), true)
      assert.equal(fixture.source(second).connections.has(fixture.nodes.at(-1)), true)
      Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: null })
      fixture.media.dispatchEvent(new Event('leavepictureinpicture', { bubbles: true }))
      assert.equal(fixture.source().connections.size, 0)
      assert.equal(fixture.source(second).connections.size, 1)
    }
    finally {
      fixture.close()
      if (hidden)
        Object.defineProperty(document, 'hidden', hidden)
      else delete document.hidden
      if (pip)
        Object.defineProperty(document, 'pictureInPictureElement', pip)
      else delete document.pictureInPictureElement
    }
  })

  check('local loudness lifetime: disabling a pending module prevents late capture; BFCache and foreign-source conflict retain original output', async () => {
    const fixture = await engineFixture()
    let resolve
    fixture.setGate(new Promise(done => resolve = done))
    try {
      fixture.controller.bind(fixture.media, 'one')
      fixture.controller.update({ enabled: true, target: -18, strength: 75 })
      await fixture.settle()
      fixture.controller.update({ enabled: false, target: -18, strength: 75 })
      assert.equal(fixture.urls.size, 0, 'disable revokes the URL even if addModule has not settled')
      resolve()
      await fixture.settle()
      assert.equal(fixture.count(), 0)
      assert.equal(fixture.urls.size, 0)
      fixture.setGate(undefined)
      fixture.controller.update({ enabled: true, target: -18, strength: 75 })
      await fixture.settle()
      const context = fixture.contexts.at(-1)
      fixture.controller.suspend(true)
      assert.equal(context.state, 'running', 'BFCache never closes the captured context')
      assert.equal(fixture.source().connections.has(context.destination), true)
      fixture.controller.resume()
      await fixture.settle()
      assert.equal(fixture.count(), 1)
      assert.throws(() => new fixture.Context().createMediaElementSource(fixture.media))
      assert.equal(fixture.events.at(-1)[1], 'reload-required')
      assert.equal(fixture.source().connections.has(context.destination), true)
      const laterPatch = () => 'another owner'
      fixture.Context.prototype.createMediaElementSource = laterPatch
      fixture.controller.suspend(false)
      assert.equal(fixture.Context.prototype.createMediaElementSource, laterPatch)
    }
    finally { fixture.close() }
  })

  check('local loudness UI: telemetry is session-scoped and bounded; closed/hidden panels do not update their curve', async () => {
    const protocol = await import('../src/utils/localLoudnessProtocol')
    const ui = await loadSourceModule('../src/composables/useLocalLoudness.ts', { vue: Vue, '~/utils/localLoudnessProtocol': protocol, '~/utils/pageBridgeChannel': { getPageBridgeChannelId: () => 'channel' }, '~/utils/videoMetadataBridge': await import('../src/utils/videoMetadataBridge') }, { location: window.location, CustomEvent })
    const stop = ui.observeLocalLoudnessState()
    const send = (token = 'one') => window.dispatchEvent(new CustomEvent(protocol.LOCAL_LOUDNESS_STATE, { detail: JSON.stringify({ channelId: 'channel', token, href: window.location.href, state: 'active', measurement: { loudness: -18, gainDb: 3, peakReductionDb: 0 } }) }))
    try {
      ui.setLocalLoudnessMediaToken('one')
      ui.localLoudnessPanelOpen.value = true
      for (let i = 0; i < 100; i++) send()
      assert.equal(ui.localLoudnessSamples.value.length, 60)
      const samples = ui.localLoudnessSamples.value
      ui.localLoudnessPanelOpen.value = false
      send()
      assert.equal(ui.localLoudnessSamples.value, samples)
      ui.setLocalLoudnessMediaToken('two')
      send('one')
      assert.equal(ui.localLoudnessSamples.value.length, 0)
    }
    finally { stop() }
  })
}
