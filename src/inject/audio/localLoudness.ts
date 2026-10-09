import type { LocalLoudnessConfig, LocalLoudnessMeasurement, LocalLoudnessState } from '~/utils/localLoudnessProtocol'
import { LOCAL_LOUDNESS_DEFAULTS } from '~/utils/localLoudnessProtocol'

import { canReadMediaAudio, readNativeLoudnessState } from './localLoudnessCompatibility'
import { disposeLoudnessNode, prepareLoudnessNode } from './localLoudnessGraph'
import type { trackMediaSourceOwnership } from './mediaSourceOwnership'

interface OwnedGraph { source: MediaElementAudioSourceNode, node?: AudioWorkletNode, owner?: AbortController, connected: boolean }
interface MediaSession { video: HTMLVideoElement, token: string, source: string, abort: AbortController, failed: boolean }

/** One current media owner; historical media are weakly held only for bypass. */
export function createLocalLoudnessController(report: (token: string, state: LocalLoudnessState, measurement?: LocalLoudnessMeasurement) => void, ownership: ReturnType<typeof trackMediaSourceOwnership>) {
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
    report(session?.token ?? '', next, sample)
  }
  function bypass(graph: OwnedGraph) {
    // Connect the dry path before removing DSP. Capturing a media element cannot
    // be undone, so disable must retain this owned output instead of closing it.
    if (!graph.connected || graph.node)
      graph.source.connect(graph.source.context.destination)
    graph.connected = true
    outputs.add(graph)
    if (graph.node) {
      graph.owner?.abort()
      graph.owner = undefined
      const node = graph.node
      graph.source.disconnect(node)
      graph.node = undefined
      disposeLoudnessNode(node)
    }
  }
  function releaseOutput(graph: OwnedGraph) {
    graph.owner?.abort()
    graph.owner = undefined
    graph.source.disconnect()
    graph.connected = false
    if (graph.node) {
      disposeLoudnessNode(graph.node)
      graph.node = undefined
    }
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
    if (!graph?.node)
      return
    graph.node.port.postMessage({ type: 'configure', target: config.target, strength: config.strength / 100, volume: video.volume, active: !video.paused && !video.muted && !video.seeking && !video.ended, report: panel && !document.hidden })
    status(video.paused || video.muted || video.seeking || video.ended ? 'paused' : 'active')
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
    if (!globalThis.isSecureContext || !globalThis.AudioContext || !globalThis.AudioWorkletNode || !ownership.available())
      return 'unsupported'
    const native = readNativeLoudnessState(video.closest('.bpx-player-container, .bilibili-player'))
    if (native !== 'off')
      return native === 'on' ? 'native-on' : 'native-unknown'
    if (ownership.occupied(video) && !graphs.has(video))
      return 'source-in-use'
  }
  async function reconcile() {
    if (disposed || suspended || !config.enabled || !session || preparation)
      return
    const current = session
    const { video } = current
    if (current.failed)
      return
    if (!video.isConnected || video.readyState < 2 || video.paused || video.muted || video.seeking || video.ended) {
      configure()
      if (!graphs.get(video)?.node)
        status('waiting')
      return
    }
    const incompatible = compatibility(video)
    if (incompatible) {
      stopProcessing()
      status(incompatible)
      return
    }
    if (graphs.get(video)?.node) {
      configure()
      return
    }
    if (!canReadMediaAudio(video)) {
      // A captured element cannot be returned to the browser's pre-WebAudio
      // route. If a later source becomes tainted/DRM, do not claim bypass proves
      // audible recovery: the document needs a fresh native media element.
      status(graphs.has(video) ? 'reload-required' : 'unsupported')
      return
    }
    const owner = new AbortController()
    preparation = owner
    const src = video.currentSrc
    let node: AudioWorkletNode | undefined
    const valid = () => !owner.signal.aborted && !disposed && !suspended && config.enabled && session === current && video.isConnected && video.currentSrc === src
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
      node = await prepareLoudnessNode(context, config, video.volume, owner.signal, (sample) => {
        if (valid() && panel && !document.hidden && !video.paused)
          status('active', sample)
      }, () => {
        if (!valid())
          return
        current.failed = true
        stopProcessing()
        status('error')
      })
      if (!valid())
        return
      const reason = compatibility(video)
      if (reason) {
        status(reason)
        return
      }
      node.connect(context.destination)
      let graph = graphs.get(video)
      if (!graph) {
        const source = ownership.capture(context, video)
        graph = { source, connected: false }
        graphs.set(video, graph)
        captured = true
        installBypassLifetime()
      }
      bypass(graph)
      graph.source.connect(node)
      graph.source.disconnect(context.destination)
      graph.node = node
      graph.owner = owner
      node = undefined
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
      if (context && !captured && (disposed || !config.enabled || current.failed)) {
        void context.close().catch(() => {})
        context = undefined
      }
    }
  }
  function onMediaEvent(event: Event) {
    if (!session)
      return
    const source = session.video.currentSrc
    if (source !== session.source || event.type === 'emptied' || event.type === 'loadedmetadata') {
      stopProcessing()
      session.source = source
      session.failed = false
    }
    if (session.video.paused || session.video.muted || session.video.seeking || session.video.ended) {
      stopProcessing()
      if (!session.failed || !config.enabled)
        status(config.enabled ? 'paused' : 'off')
      return
    }
    const graph = graphs.get(session.video)
    if (event.type === 'seeking' || event.type === 'seeked')
      graph?.node?.port.postMessage({ type: 'reset' })
    configure()
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
      session?.abort.abort()
      retireOutputs(video)
      session = video ? { video, token, source: video.currentSrc, abort: new AbortController(), failed: false } : undefined
      if (session) {
        for (const name of ['play', 'playing', 'pause', 'volumechange', 'seeking', 'seeked', 'emptied', 'loadedmetadata', 'loadeddata', 'ended'])
          video!.addEventListener(name, onMediaEvent, { signal: session.abort.signal })
      }
      status(config.enabled ? 'waiting' : 'off')
      void reconcile()
    },
    update(next: LocalLoudnessConfig) {
      const changed = next.enabled !== config.enabled
      config = next
      if (changed)
        setEnabledListeners(next.enabled)
      if (!next.enabled) {
        stopProcessing()
        status('off')
        if (!captured && context) {
          void context.close().catch(() => {})
          context = undefined
        }
      }
      else {
        if (changed && session)
          session.failed = false
        configure()
        void reconcile()
      }
    },
    showPanel(visible: boolean) {
      panel = visible
      configure()
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
