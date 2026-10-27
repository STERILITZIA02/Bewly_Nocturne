import type { LocalLoudnessConfig, LocalLoudnessMeasurement, LocalLoudnessState } from '~/utils/localLoudnessProtocol'
import { LOCAL_LOUDNESS_DEFAULTS } from '~/utils/localLoudnessProtocol'

import { canReadMediaAudio, readNativeLoudnessState } from './localLoudnessCompatibility'
import { disposeLoudnessNode, prepareLoudnessNode } from './localLoudnessGraph'
import type { trackMediaSourceOwnership } from './mediaSourceOwnership'

interface OwnedGraph { source: MediaElementAudioSourceNode, node?: AudioWorkletNode, delay?: DelayNode, owner?: AbortController, connected: boolean, processing: boolean }
interface MediaSession { video: HTMLVideoElement, token: string, source: string, abort: AbortController, failed: boolean }

/** One current media owner; historical media are weakly held only for bypass. */
export function createLocalLoudnessController(report: (token: string, state: LocalLoudnessState, measurement?: LocalLoudnessMeasurement, delayState?: LocalLoudnessState) => void, ownership: ReturnType<typeof trackMediaSourceOwnership>) {
  const graphs = new WeakMap<HTMLMediaElement, OwnedGraph>()
  const outputs = new Set<OwnedGraph>()
  let context: AudioContext | undefined
  let captured = false
  let config: LocalLoudnessConfig = { ...LOCAL_LOUDNESS_DEFAULTS }
  let session: MediaSession | undefined
  let preparation: AbortController | undefined
  let panel = false
  let suspended = false
  let disposed = false
  let state: LocalLoudnessState = 'off'
  let delayMs = 0
  const processing = () => config.enabled || delayMs > 0
  let enabledListeners: AbortController | undefined
  let bypassListeners: AbortController | undefined
  function handleConflict(media: HTMLMediaElement) {
    const graph = graphs.get(media)
    if (graph)
      bypass(graph)
    if (session?.video === media) {
      session.failed = true
      preparation?.abort()
      status('reload-required')
    }
  }

  function status(next: LocalLoudnessState, sample?: LocalLoudnessMeasurement) {
    state = next
    report(session?.token ?? '', config.enabled ? next : 'off', sample, delayMs ? next : 'off')
  }
  function park(graph: OwnedGraph) {
    // Connect the dry path before removing DSP. Capturing a media element cannot
    // be undone, so disable must retain this owned output instead of closing it.
    if (!graph.connected || graph.processing)
      graph.source.connect(graph.source.context.destination)
    if (graph.processing)
      graph.source.disconnect(graph.node ?? graph.delay!)
    graph.processing = false
    graph.connected = true
    outputs.add(graph)
    graph.node?.disconnect()
    graph.node?.port.postMessage({ type: 'configure', active: false, report: false })
    graph.node?.port.postMessage({ type: 'reset' })
    // DelayNode has no flush operation. Only this buffered branch is retired.
    graph.delay?.disconnect()
    graph.delay = undefined
  }
  function bypass(graph: OwnedGraph) {
    park(graph)
    graph.owner?.abort()
    graph.owner = undefined
    if (graph.node) {
      const node = graph.node
      graph.node = undefined
      disposeLoudnessNode(node)
    }
  }
  function activate(graph: OwnedGraph) {
    if (graph.processing)
      return
    if (delayMs) {
      graph.delay = context!.createDelay(1)
      graph.delay.delayTime.value = delayMs / 1000
      graph.delay.connect(context!.destination)
    }
    graph.node?.connect(graph.delay ?? context!.destination)
    graph.source.connect(graph.node ?? graph.delay!)
    if (graph.connected)
      graph.source.disconnect(context!.destination)
    graph.connected = graph.processing = true
    outputs.add(graph)
  }
  function pauseProcessing() {
    const graph = session && graphs.get(session.video)
    if (graph && graph.processing)
      park(graph)
    if (!preparation && context?.state === 'running' && [...outputs].every((output) => {
      const media = output.source.mediaElement
      return media.paused || media.muted || media.seeking || media.ended
    })) {
      void context.suspend().catch(() => {})
    }
  }
  function releaseOutput(graph: OwnedGraph) {
    graph.owner?.abort()
    graph.owner = undefined
    graph.source.disconnect()
    graph.connected = false
    graph.processing = false
    if (graph.node) {
      disposeLoudnessNode(graph.node)
      graph.node = undefined
    }
    graph.delay?.disconnect()
    graph.delay = undefined
    outputs.delete(graph)
  }
  function retireOutputs(current?: HTMLMediaElement) {
    for (const graph of outputs) {
      const media = graph.source.mediaElement
      if (media === document.pictureInPictureElement)
        continue
      if (!media.isConnected || (current && media !== current))
        releaseOutput(graph)
    }
  }
  function stopProcessing() {
    preparation?.abort()
    preparation = undefined
    const graph = session && graphs.get(session.video)
    if (graph)
      bypass(graph)
  }
  function configure() {
    if (!session)
      return
    const { video } = session
    const graph = graphs.get(video)
    if (!graph || (!graph.node && !graph.delay))
      return
    const paused = video.paused || video.muted || video.seeking || video.ended
    const ready = video.readyState >= 2
    graph.node?.port.postMessage({ type: 'configure', target: config.target, strength: config.strength / 100, volume: video.volume, active: graph.processing && !paused && ready, report: panel && !document.hidden })
    status(paused ? 'paused' : !ready ? 'waiting' : context?.state !== 'running' ? 'gesture' : graph.processing ? 'active' : 'waiting')
    return true
  }
  function recoverPlay(event: Event) {
    const video = event.target
    if (!(video instanceof HTMLMediaElement))
      return
    const graph = graphs.get(video)
    if (!graph)
      return
    if (video !== document.pictureInPictureElement)
      retireOutputs(video)
    if (!graph.connected)
      bypass(graph)
    void context?.resume().catch(() => status('gesture'))
  }
  function installBypassLifetime() {
    if (bypassListeners)
      return
    bypassListeners = new AbortController()
    document.addEventListener('play', recoverPlay, { capture: true, signal: bypassListeners.signal })
    for (const name of ['pause', 'ended', 'leavepictureinpicture']) {
      document.addEventListener(name, (event) => {
        if (event.target instanceof HTMLMediaElement && event.target !== session?.video && event.target !== document.pictureInPictureElement) {
          const graph = graphs.get(event.target)
          if (graph)
            releaseOutput(graph)
        }
      }, { capture: true, signal: bypassListeners.signal })
    }
  }
  function compatibility(video: HTMLVideoElement): LocalLoudnessState | undefined {
    if (!globalThis.isSecureContext || !globalThis.AudioContext || (config.enabled && !globalThis.AudioWorkletNode) || !ownership.available())
      return 'unsupported'
    const native = readNativeLoudnessState(video.closest('.bpx-player-container, .bilibili-player'))
    if (native !== 'off')
      return native === 'on' ? 'native-on' : 'native-unknown'
    if (ownership.occupied(video) && !graphs.has(video))
      return 'source-in-use'
  }
  async function reconcile() {
    if (disposed || suspended || !processing() || !session || preparation)
      return
    const current = session
    const { video } = current
    if (current.failed)
      return
    if (!video.isConnected || video.readyState < 2 || video.paused || video.muted || video.seeking || video.ended) {
      if (!configure())
        status(video.paused || video.muted || video.seeking || video.ended ? 'paused' : 'waiting')
      return
    }
    const incompatible = compatibility(video)
    if (incompatible) {
      stopProcessing()
      status(incompatible)
      return
    }
    if (!canReadMediaAudio(video)) {
      // A captured element cannot be returned to the browser's pre-WebAudio
      // route. If a later source becomes tainted/DRM, do not claim bypass proves
      // audible recovery: the document needs a fresh native media element.
      stopProcessing()
      status(graphs.has(video) ? 'reload-required' : 'unsupported')
      return
    }
    if (context && context.state !== 'running') {
      void context.resume().catch(() => status('gesture'))
      status('gesture')
      return
    }
    const existing = graphs.get(video)
    if (existing && (existing.node || !config.enabled)) {
      activate(existing)
      configure()
      return
    }
    const owner = new AbortController()
    preparation = owner
    const src = video.currentSrc
    let node: AudioWorkletNode | undefined
    const valid = () => !owner.signal.aborted && !disposed && !suspended && processing() && session === current && video.isConnected
    try {
      if (!context) {
        context = new AudioContext()
        context.onstatechange = () => {
          if (context?.state === 'running' && state === 'gesture')
            void reconcile()
        }
      }
      // A suspended context would silence an otherwise playing native video.
      // Do not capture until the browser has allowed this owned context to run.
      void context.resume().catch(() => {})
      if (context.state !== 'running') {
        status('gesture')
        return
      }
      if (config.enabled) {
        node = await prepareLoudnessNode(context, config, video.volume, owner.signal, (sample) => {
          if (valid() && graphs.get(video)?.processing && panel && !document.hidden && !video.paused && !video.muted && !video.seeking)
            status('active', sample)
        }, () => {
          if (!valid())
            return
          current.failed = true
          stopProcessing()
          status('error')
        })
      }
      if (!valid() || video.currentSrc !== src)
        return
      const reason = compatibility(video)
      if (reason) {
        status(reason)
        return
      }
      let graph = graphs.get(video)
      if (!graph) {
        const source = ownership.capture(context, video)
        graph = { source, connected: false, processing: false }
        graphs.set(video, graph)
        captured = true
        installBypassLifetime()
      }
      bypass(graph)
      graph.node = node
      graph.owner = owner
      node = undefined
      if (!video.paused && !video.muted && !video.seeking && !video.ended)
        activate(graph)
      else
        pauseProcessing()
      configure()
    }
    catch {
      if (valid()) {
        current.failed = true
        stopProcessing()
        status('error')
      }
    }
    finally {
      if (node)
        disposeLoudnessNode(node)
      if (preparation === owner)
        preparation = undefined
      if (session === current && (video.paused || video.muted || video.seeking || video.ended) && processing())
        pauseProcessing()
      if (context && !captured && (disposed || !processing() || current.failed)) {
        void context.close().catch(() => {})
        context = undefined
      }
      if (owner.signal.aborted && session === current && !disposed && !suspended && processing())
        void reconcile()
    }
  }
  function onMediaEvent(event: Event) {
    if (!session)
      return
    const source = session.video.currentSrc
    if (source !== session.source || event.type === 'emptied' || event.type === 'loadedmetadata') {
      preparation?.abort()
      const graph = graphs.get(session.video)
      if (graph)
        park(graph)
      session.source = source
      session.failed = false
    }
    if (session.video.paused || session.video.muted || session.video.seeking || session.video.ended) {
      if (processing())
        pauseProcessing()
      if (!session.failed || !processing())
        status(processing() ? 'paused' : 'off')
      return
    }
    if (!processing()) {
      void context?.resume().catch(() => {})
      status('off')
      return
    }
    void reconcile()
  }
  function nativeChange(event: Event) {
    if (!(event.target instanceof Element) || !event.target.closest('.bpx-player-ctrl-setting'))
      return
    if (session && compatibility(session.video))
      stopProcessing()
    void reconcile()
  }
  function setEnabledListeners(enabled: boolean) {
    if (Boolean(enabledListeners) === enabled)
      return
    enabledListeners?.abort()
    enabledListeners = undefined
    if (!enabled)
      return
    enabledListeners = new AbortController()
    const { signal } = enabledListeners
    document.addEventListener('pointerdown', () => {
      if (state !== 'gesture')
        return
      void context?.resume().then(() => reconcile()).catch(() => status('gesture'))
    }, { capture: true, passive: true, signal })
    document.addEventListener('change', nativeChange, { capture: true, signal })
    document.addEventListener('visibilitychange', configure, { signal })
  }
  return {
    handleConflict,
    bind(video: HTMLVideoElement | undefined, token: string) {
      if (session && session.video === video && session.token === token) {
        void reconcile()
        return
      }
      stopProcessing()
      delayMs = 0
      setEnabledListeners(config.enabled)
      session?.abort.abort()
      retireOutputs(video)
      session = video ? { video, token, source: video.currentSrc, abort: new AbortController(), failed: false } : undefined
      if (session) {
        for (const name of ['play', 'playing', 'pause', 'volumechange', 'seeking', 'seeked', 'emptied', 'loadedmetadata', 'loadeddata', 'ended'])
          video!.addEventListener(name, onMediaEvent, { signal: session.abort.signal })
      }
      status(processing() ? 'waiting' : 'off')
      void reconcile()
    },
    update(next: LocalLoudnessConfig) {
      if (next.enabled === config.enabled && next.target === config.target && next.strength === config.strength)
        return
      const changed = next.enabled !== config.enabled
      config = next
      if (changed) {
        stopProcessing()
        setEnabledListeners(processing())
      }
      if (!processing()) {
        if (!changed)
          stopProcessing()
        status('off')
        if (captured && session && !session.video.paused && !session.video.muted)
          void context?.resume().catch(() => {})
        if (!captured && context) {
          void context.close().catch(() => {})
          context = undefined
        }
      }
      else {
        if (changed && session)
          session.failed = false
        void reconcile()
      }
    },
    setDelay(milliseconds: number) {
      if (disposed || delayMs === milliseconds)
        return
      const wasProcessing = processing()
      delayMs = milliseconds
      if (wasProcessing !== processing())
        setEnabledListeners(processing())
      const graph = session && graphs.get(session.video)
      if (milliseconds > 0 && graph?.delay)
        graph.delay.delayTime.setValueAtTime(milliseconds / 1000, graph.source.context.currentTime)
      else if (graph && processing())
        park(graph)
      else stopProcessing()
      if (processing()) {
        if (session)
          session.failed = false
        void reconcile()
      }
      else {
        status('off')
        if (captured && session && !session.video.paused && !session.video.muted)
          void context?.resume().catch(() => {})
      }
    },
    showPanel(visible: boolean) {
      panel = visible
      if (!configure())
        status(state)
    },
    suspend(persisted: boolean) {
      suspended = true
      stopProcessing()
      if (persisted)
        return
      disposed = true
      session?.abort.abort()
      enabledListeners?.abort()
      bypassListeners?.abort()
      ownership.dispose()
      for (const graph of [...outputs])
        releaseOutput(graph)
      void context?.close().catch(() => {})
      context = undefined
      session = undefined
    },
    resume() {
      if (disposed)
        return
      suspended = false
      if (captured && session && !session.video.paused)
        void context?.resume().catch(() => status('gesture'))
      void reconcile()
    },
  }
}
