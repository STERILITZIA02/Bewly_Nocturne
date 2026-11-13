// @unocss-include
import { watch } from 'vue'
import { useToast } from 'vue-toastification'

import { onRouteChange } from '~/composables/useRouteState'
import { settings } from '~/logic'
import { createPlaybackAppHost } from '~/utils/bewlyWidescreen/appHost'
import { syncNativePlayerControlVisibility } from '~/utils/bewlyWidescreen/nativeControls'
import { session } from '~/utils/bewlyWidescreen/session'
import { i18n } from '~/utils/i18n'
import type { ListenSession } from '~/utils/listenPlayback'
import { isListenSession, LISTEN_ATTRIBUTE, LISTEN_GATE, LISTEN_LEAVING_ATTRIBUTE, LISTEN_RECOVER, LISTEN_RELEASE, LISTEN_SAVE, listenGainDb, matchesListenUnit, returnVideoUrl } from '~/utils/listenPlayback'
import { listenStage } from '~/utils/listenStage'
import { readListenSources } from '~/utils/listenStreams'
import { createLoadingRingElement } from '~/utils/loadingRing'
import { getUserID } from '~/utils/main'
import { sendMessage } from '~/utils/messaging'
import { readNativeAudioSettings } from '~/utils/nativeLoudness'
import { getPlayerRoot, getVideoElement, isPlayerAdvertisement } from '~/utils/playerMedia'
import { getNativePlaybackUnitKey, readNativeMediaSnapshot, releaseNativeListen, resumeNativeListen, suspendNativePlayback, switchNativePlaybackVisit, VIDEO_METADATA_CHANGED } from '~/utils/videoMetadataBridge'

import { prepareListenAudio } from './listenAudio'
import { bindListenNativeBar } from './listenNativeBar'
import { restoreListenReturn, saveListenReturn } from './listenReturn'
import { captureListenFrame, dissolveListenStage } from './listenStageMotion'
import { registerPlayerControlFit } from './playerControlFit'
import { createPlayerControlTooltip, updatePlayerControlTooltip } from './playerControlTooltip'
import { observePlayerDom } from './playerDomLifecycle'

type ListenPreparation = AbortController & { finished: Promise<void>, keepCheckpoint: boolean }
type ListenOperation
  = | { phase: 'idle' }
    | { phase: 'recovering' }
    | { phase: 'preparing', attempt: ListenPreparation }
    | { phase: 'returning' }

const LISTEN_MODE_KEY = 'listenPlayback:mode'

export function setupListenControl(onLayoutReady?: () => void) {
  const t = (key: string) => String(i18n.global.t(key, settings.value.language))
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bpx-player-ctrl-btn bewly-listen-control'
  const iconBox = document.createElement('span')
  iconBox.className = 'bpx-player-ctrl-btn-icon'
  const glyph = document.createElement('i')
  glyph.className = 'i-tabler:headphones bewly-player-glyph'
  glyph.setAttribute('aria-hidden', 'true')
  const ring = createLoadingRingElement()
  ring.classList.add('bewly-player-glyph')
  iconBox.append(glyph)
  button.append(iconBox, createPlayerControlTooltip(''))

  let state: ListenSession | undefined
  let operation: ListenOperation = { phase: 'idle' }
  let media: AbortController | undefined
  let playingAudio: HTMLAudioElement | undefined
  let masked: HTMLElement | null = null
  let ownerChanges: MutationObserver | undefined
  let stageHost: ReturnType<typeof createPlaybackAppHost> | undefined
  // The picture's last frame for the next stage to arrive over
  // (listenStageMotion.ts), then the one lying under the stage shown.
  let frame: HTMLCanvasElement | undefined
  let stageFrame: HTMLCanvasElement | undefined
  // A finished session's stage, dissolving over the picture on its old root.
  let leave: { root: HTMLElement | null, controller: AbortController } | undefined
  // Bpx's bar drives the audio (listenNativeBar) for this root and audio.
  let bar: { root: HTMLElement, audio: HTMLAudioElement, controller: AbortController } | undefined
  let failed = false
  let suspendedNative: HTMLElement | undefined
  let shell: HTMLElement | undefined
  let fit: ReturnType<typeof registerPlayerControlFit> | undefined
  let lifetime: 'active' | 'suspended' | 'disposed' = 'active'
  let lastSaved = ''
  const lifecycle = new AbortController()
  let preferListening = false
  let attemptedUnit: string | undefined
  try {
    preferListening = sessionStorage.getItem(LISTEN_MODE_KEY) === 'listen'
  }
  catch { /* The current document still remembers the choice when storage is unavailable. */ }

  function rememberMode(listening: boolean) {
    preferListening = listening
    try {
      if (listening)
        sessionStorage.setItem(LISTEN_MODE_KEY, 'listen')
      else sessionStorage.removeItem(LISTEN_MODE_KEY)
    }
    catch { /* Mode persistence must not interrupt playback. */ }
  }

  function save() {
    if (state) {
      if (playingAudio && !playingAudio.error && playingAudio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        state.time = playingAudio.currentTime
        state.volume = playingAudio.volume
        state.muted = playingAudio.muted
        state.rate = playingAudio.playbackRate
      }
      const signature = JSON.stringify(state)
      if (signature !== lastSaved) {
        lastSaved = signature
        void sendMessage(LISTEN_SAVE, state).catch(() => {
          if (lastSaved === signature)
            lastSaved = ''
        })
      }
    }
  }
  function publish() {
    if (leave)
      return
    listenStage.value = state && stageHost
      ? { mount: stageHost.mount, audio: playingAudio ?? null, unit: state.unit, loading: operation.phase === 'preparing', failed, retry, frame: stageFrame }
      : null
  }
  function removeStage() {
    leave?.root?.removeAttribute(LISTEN_LEAVING_ATTRIBUTE)
    leave?.controller.abort()
    leave = undefined
    frame = stageFrame = undefined
    stageHost?.dispose()
    stageHost = undefined
    publish()
  }
  /**
   * The session is over. Its stage stays where it was, with the needle up,
   * until the returning picture shows (`awaitPicture`), dissolves over it and
   * is removed; a session that starts meanwhile takes the stage back.
   */
  function dismissStage(root: HTMLElement | null, awaitPicture: boolean) {
    const shown = listenStage.value
    if (!stageHost || !shown || lifetime !== 'active') {
      removeStage()
      return
    }
    const controller = new AbortController()
    leave = { root, controller }
    root?.setAttribute(LISTEN_LEAVING_ATTRIBUTE, '')
    listenStage.value = { ...shown, audio: null, loading: false, failed: false, frame: undefined, leaving: true }
    void dissolveListenStage(stageHost.host, awaitPicture, controller.signal).then(() => {
      if (leave?.controller === controller)
        removeStage()
    })
  }
  function bindBar() {
    if (bar && bar.root === masked && bar.audio === playingAudio)
      return
    bar?.controller.abort()
    bar = undefined
    if (masked && playingAudio) {
      bar = { root: masked, audio: playingAudio, controller: new AbortController() }
      bindListenNativeBar(masked, playingAudio, bar.controller.signal, state!.unit)
    }
  }
  function place(awaitPicture = false) {
    const root = state ? getPlayerRoot() : null
    const previousRoot = masked
    if (state && leave) {
      // The dissolving stage is taken back by the new session.
      leave.root?.removeAttribute(LISTEN_LEAVING_ATTRIBUTE)
      leave.controller.abort()
      leave = undefined
      stageFrame = undefined
    }
    if (root !== masked) {
      ownerChanges?.disconnect()
      ownerChanges = undefined
      masked?.removeAttribute(LISTEN_ATTRIBUTE)
      masked = root
      if (root) {
        root.setAttribute(LISTEN_ATTRIBUTE, '')
        ownerChanges = new MutationObserver((records) => {
          if (records.some(record => record.attributeName === 'data-btr-mse-active' || (record.target instanceof Element && record.target.matches('video,bwp-video'))))
            checkNativeUnit()
        })
        ownerChanges.observe(root, { attributes: true, subtree: true, attributeFilter: ['src', 'data-btr-mse-active'] })
        onLayoutReady?.()
        checkNativeUnit()
      }
    }
    const wide = state ? session.current : null
    if (shell !== wide?.root) {
      shell?.removeAttribute(LISTEN_ATTRIBUTE)
      shell = wide?.root
      shell?.setAttribute(LISTEN_ATTRIBUTE, '')
      if (session.current)
        syncNativePlayerControlVisibility(session.current)
    }
    // The session's listening glyph: the same control returns to the video.
    glyph.className = `${state ? 'i-tabler:headphones-filled' : 'i-tabler:headphones'} bewly-player-glyph`
    bindBar()
    if (!state) {
      if (!leave)
        dismissStage(previousRoot, awaitPicture)
      return
    }
    // The stage covers the picture inside the player box, under Bpx's control
    // bar, in the Bewly playback page and on the native page alike.
    stageHost ??= createPlaybackAppHost('bewly-listen-stage')
    if (masked && stageHost.host.parentElement !== masked)
      masked.append(stageHost.host)
    if (frame) {
      stageHost.mount.before(frame)
      stageFrame = frame
      frame = undefined
    }
    publish()
  }
  function fail() {
    failed = true
    publish()
  }
  function retry() {
    if (state)
      void begin(state)
  }
  function setBusy(busy: boolean) {
    if (busy)
      button.setAttribute('aria-busy', 'true')
    else button.removeAttribute('aria-busy')
    iconBox.replaceChildren(busy ? ring : glyph)
    publish()
  }
  function stop(keepCheckpoint = false, releasedGate?: number, awaitPicture = false) {
    const previous = state
    const native = suspendedNative ?? getVideoElement()
    const nativeGate = (native && readNativeMediaSnapshot(native)?.listenOwner) ?? previous?.gate
    if (operation.phase === 'preparing') {
      operation.attempt.keepCheckpoint = keepCheckpoint
      operation.attempt.abort()
    }
    operation = { phase: 'idle' }
    media?.abort()
    media = undefined
    playingAudio = undefined
    state = undefined
    suspendedNative = undefined
    failed = false
    place(awaitPicture)
    setBusy(false)
    if (!keepCheckpoint) {
      if (previous?.gate && previous.gate !== releasedGate) {
        void sendMessage(LISTEN_RELEASE, previous.gate).then(() => {
          if (nativeGate)
            releaseNativeListen(nativeGate)
        }).catch(() => {})
      }
    }
  }
  async function returnVideo() {
    if (!state || operation.phase === 'returning' || lifetime !== 'active')
      return
    const preparing = operation.phase === 'preparing' ? operation.attempt : undefined
    const returning: ListenOperation = { phase: 'returning' }
    operation = returning
    const previous = state
    try {
      preparing?.abort()
      await preparing?.finished
      if (operation !== returning || state !== previous || !matchesListenUnit(location.href, previous.unit))
        return
      save()
      const gate = previous.gate
      await sendMessage(LISTEN_RELEASE, gate)
      if (operation !== returning || state !== previous || !matchesListenUnit(location.href, previous.unit))
        return
      // Read before stopping: ending the audio pauses it.
      const video = getVideoElement()
      const intent = {
        unit: getNativePlaybackUnitKey(previous.unit),
        gate: (video && readNativeMediaSnapshot(video)?.listenOwner) ?? gate,
        time: previous.time,
        playing: previous.playing,
        muted: previous.muted,
        volume: previous.volume,
        rate: previous.rate,
        bind: true,
      }
      const snapshot = { ...previous }
      // The page stays as it is. A suspended native stream reconnects in place;
      // one with no source left (BTR released it, or the page was reloaded
      // mid-listen) is reloaded by the player's own in-page switch, and the
      // saved return restores time, speed, volume and playing on it.
      if (!video)
        throw new Error('Native playback unavailable')
      if (!resumeNativeListen(video, intent)) {
        const switched = switchNativePlaybackVisit(video, returnVideoUrl(snapshot), snapshot.unit)
        if (!switched || switched === 'needs-unit')
          throw new Error('Native playback could not resume')
        releaseNativeListen(intent.gate)
      }
      rememberMode(false)
      stop(false, gate, true)
      saveListenReturn(snapshot)
      restoreListenReturn(lifecycle.signal)
    }
    catch {
      if (operation === returning && state === previous)
        fail()
    }
    finally {
      if (operation === returning) {
        operation = { phase: 'idle' }
        setBusy(false)
      }
    }
  }
  async function begin(saved?: ListenSession) {
    if (operation.phase === 'returning' || lifetime !== 'active')
      return
    if (operation.phase === 'preparing') {
      operation.attempt.abort()
      return
    }
    const original = getVideoElement()
    const originalSnapshot = original && readNativeMediaSnapshot(original)
    const unit = saved?.unit ?? originalSnapshot?.unit
    if (!unit || !matchesListenUnit(location.href, unit) || (!saved && (!original || isPlayerAdvertisement(original)))) {
      useToast().info(t('widescreen.listen_not_ready'))
      return
    }
    attemptedUnit = getNativePlaybackUnitKey(unit)
    const candidate = saved ?? {
      unit,
      href: location.href,
      gate: 0,
      time: 0,
      playing: false,
      rate: 1,
      volume: 1,
      muted: false,
    }
    const account = getUserID()
    // An unpatched BTR keeps its paused media owner. Blocking that owner's
    // buffered requests would trigger BTR's error recovery and automatic retake.
    const retainNative = saved?.retainNative === true || (originalSnapshot?.btr.installed === true && originalSnapshot.btr.listenHandoffVersion !== 1)
    candidate.retainNative = retainNative
    let finish!: () => void
    const finished = new Promise<void>(resolve => finish = resolve)
    const attempt = Object.assign(new AbortController(), { finished, keepCheckpoint: false })
    const stopNavigation = onRouteChange(() => {
      if (!matchesListenUnit(location.href, unit))
        attempt.abort()
    })
    const preparation: ListenOperation = { phase: 'preparing', attempt }
    operation = preparation
    setBusy(true)
    let gate: number | undefined
    let prepared: ReturnType<typeof prepareListenAudio> | undefined
    let handoffMedia: HTMLElement | undefined
    const isCurrent = () => operation === preparation && !attempt.signal.aborted && lifetime === 'active' && account === getUserID() && matchesListenUnit(location.href, unit)
    try {
      const probe = document.createElement('audio')
      const { sources, loudness } = await readListenSources(unit, type => probe.canPlayType(type), attempt.signal)
      if (!isCurrent())
        return
      if (!sources.length) {
        if (state)
          fail()
        else useToast().info(t('widescreen.listen_unavailable'))
        return
      }
      // A fresh grant comes before preloading: a restored session can have
      // expired CDN signatures still pinned in its previous network rules.
      if (saved) {
        gate = await sendMessage(LISTEN_GATE, { unit, sources, state: saved, retainNative })
        if (!gate || !isCurrent())
          throw new Error('Listening grant unavailable')
        candidate.gate = gate
        save()
      }
      prepared = prepareListenAudio(candidate, sources, attempt.signal, fail)
      const output = prepared
      const syncOutput = () => {
        if (attempt.signal.aborted)
          return
        const video = getVideoElement()
        const snapshot = video && readNativeMediaSnapshot(video)
        if (snapshot?.unit && getNativePlaybackUnitKey(snapshot.unit) !== getNativePlaybackUnitKey(unit))
          return
        output.setGain(listenGainDb(loudness, snapshot?.audio ?? readNativeAudioSettings(getPlayerRoot())))
      }
      syncOutput()
      const timeout = setTimeout(() => attempt.abort(new DOMException('Audio timed out', 'TimeoutError')), 20_000)
      try {
        await prepared.ready
      }
      finally { clearTimeout(timeout) }
      if (!isCurrent())
        return
      if (!saved) {
        gate = await sendMessage(LISTEN_GATE, { unit, sources, retainNative })
        if (!gate || !isCurrent() || prepared.exhausted)
          throw new Error('Listening grant unavailable')
        const video = getVideoElement()
        const current = video && readNativeMediaSnapshot(video)
        if (!video || !current?.unit || getNativePlaybackUnitKey(current.unit) !== getNativePlaybackUnitKey(unit) || isPlayerAdvertisement(video)) {
          useToast().info(t('widescreen.listen_not_ready'))
          return
        }
        candidate.time = video.currentTime
        candidate.playing = !video.paused && !video.ended
        candidate.rate = video.playbackRate
        candidate.volume = video.volume
        candidate.muted = video.muted
        candidate.gate = gate
        // Drawn before the stream lets go of its frame.
        const root = getPlayerRoot()
        frame = root ? captureListenFrame(video, root) : undefined
        const suspended = suspendNativePlayback(video, unit, gate, current.listenOwner)
        if (suspended === true || suspended === 'interrupted')
          handoffMedia = video
        if (suspended !== true)
          throw new Error('Native player could not release its source')
        suspendedNative = video
      }
      else {
        // The native element may have mounted while restored audio was loading.
        const video = getVideoElement()
        const snapshot = video && readNativeMediaSnapshot(video)
        const suspended = video && suspendNativePlayback(video, unit, gate!, snapshot?.listenOwner)
        if (video && (suspended === true || suspended === 'interrupted'))
          handoffMedia = video
        if (suspended !== true)
          throw new Error('Native player could not renew its listening owner')
        suspendedNative = video!
      }
      if (!isCurrent())
        return
      candidate.gate = gate!
      state = candidate
      rememberMode(true)
      media?.abort()
      media = attempt
      playingAudio = prepared.audio
      failed = false
      syncOutput()
      prepared.commit()
      place()
      save()
      for (const event of ['pause', 'seeked', 'ended'])
        playingAudio.addEventListener(event, save, { signal: attempt.signal })
      // Read after native controls commit their choice, including a gain slider
      // or preset in the original sound-effects panel. No polling while playing.
      let outputSyncQueued = false
      const scheduleOutputSync = (event: Event) => {
        if (outputSyncQueued || !(event.target instanceof Node) || !getPlayerRoot()?.contains(event.target))
          return
        outputSyncQueued = true
        queueMicrotask(() => {
          outputSyncQueued = false
          try {
            syncOutput()
          }
          catch { fail() }
        })
      }
      for (const name of ['input', 'change', 'pointerup', 'click'])
        document.addEventListener(name, scheduleOutputSync, { capture: true, signal: attempt.signal })
      // A BTR start already in flight can attach after the listening session.
      // Pause through MAIN so the owner's playback intent follows the element.
      document.addEventListener('play', (event) => {
        if (event.target === getVideoElement())
          checkNativeUnit()
      }, { capture: true, signal: attempt.signal })
    }
    catch {
      if (!attempt.signal.aborted || attempt.signal.reason?.name === 'TimeoutError') {
        if (state)
          fail()
        else useToast().error(t('common.load_failed'))
      }
    }
    finally {
      stopNavigation()
      if (media !== attempt) {
        attempt.abort()
        if (!state)
          frame = undefined
      }
      if (gate && state?.gate !== gate) {
        if (attempt.keepCheckpoint && saved) {
          await sendMessage(LISTEN_SAVE, { ...saved, gate }).catch(() => {})
        }
        else {
          await sendMessage(LISTEN_RELEASE, gate).catch(() => {})
          if (handoffMedia && matchesListenUnit(location.href, unit)) {
            resumeNativeListen(handoffMedia, { unit: getNativePlaybackUnitKey(unit), gate, time: candidate.time, playing: candidate.playing, rate: candidate.rate, volume: candidate.volume, muted: candidate.muted, bind: true })
          }
        }
      }
      if (operation === preparation) {
        operation = { phase: 'idle' }
        setBusy(false)
      }
      finish()
      checkNativeUnit()
    }
  }
  function activate() {
    if (state) {
      void returnVideo()
    }
    else {
      if (operation.phase === 'preparing')
        rememberMode(false)
      void begin()
    }
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    activate()
  })
  for (const name of ['keydown', 'keyup'] as const) {
    button.addEventListener(name, (event) => {
      if (['Enter', ' '].includes(event.key))
        event.stopPropagation()
    })
  }
  const barSelector = '.bpx-player-control-bottom-right'
  function sync(records?: MutationRecord[]) {
    if (preferListening && !state && (!attemptedUnit || !button.isConnected))
      checkNativeUnit()
    if (records && button.isConnected && (!state || (masked?.isConnected && stageHost?.host.isConnected)))
      return
    if (!state && records && !button.isConnected) {
      fit?.dispose()
      fit = undefined
      if (!records.some(record => Array.from(record.addedNodes).some(node => node instanceof Element
        && (node.matches(barSelector) || (node.childElementCount && node.querySelector(barSelector)))))) {
        return
      }
    }
    if (state)
      place()
    const bar = getPlayerRoot()?.querySelector(barSelector)
    if (bar && button.parentElement === bar)
      return
    fit?.dispose()
    fit = undefined
    if (bar) {
      bar.prepend(button)
      fit = registerPlayerControlFit(button, { priority: 35, label: () => t('widescreen.listen'), activate })
    }
    else { button.remove() }
  }
  const stopShell = watch(() => session.current?.sidebarEl, () => place())
  const stopLanguage = watch(() => settings.value.language, () => {
    button.setAttribute('aria-label', t('widescreen.listen'))
    updatePlayerControlTooltip(button, t('widescreen.listen'))
    fit?.refresh()
  }, { immediate: true })
  const stopRoute = onRouteChange(() => {
    if (state && !matchesListenUnit(location.href, state.unit)) {
      stop()
      attemptedUnit = undefined
    }
    checkNativeUnit()
  })
  restoreListenReturn(lifecycle.signal)
  function checkNativeUnit() {
    if ((!state && !preferListening) || operation.phase !== 'idle' || lifetime !== 'active')
      return
    const video = getVideoElement()
    const snapshot = video && readNativeMediaSnapshot(video)
    if (!video || !snapshot?.unit)
      return
    const key = getNativePlaybackUnitKey(snapshot.unit)
    if (state && key !== getNativePlaybackUnitKey(state.unit)) {
      stop()
      attemptedUnit = undefined
    }
    if (!state) {
      if (preferListening && attemptedUnit !== key && video.readyState >= HTMLMediaElement.HAVE_METADATA
        && matchesListenUnit(location.href, snapshot.unit) && !isPlayerAdvertisement(video)) {
        void begin()
      }
      return
    }
    if ((video !== suspendedNative || !video.paused || (snapshot.btr.ownsMedia && snapshot.btr.listenHandoffVersion === 1))
      && suspendNativePlayback(video, state.unit, state.gate, snapshot.listenOwner) === true) {
      suspendedNative = video
    }
  }
  // Metadata can arrive after a route change without replacing the player DOM.
  window.addEventListener(VIDEO_METADATA_CHANGED, checkNativeUnit, { signal: lifecycle.signal })
  document.addEventListener('loadedmetadata', checkNativeUnit, { capture: true, signal: lifecycle.signal })
  window.addEventListener('pagehide', () => {
    lifetime = 'suspended'
    save()
    stop(true)
  }, { capture: true, signal: lifecycle.signal })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden)
      save()
  }, { signal: lifecycle.signal })
  async function restore() {
    if (operation.phase !== 'idle' || state || lifetime !== 'active')
      return
    attemptedUnit = undefined
    const recovery: ListenOperation = { phase: 'recovering' }
    operation = recovery
    try {
      const saved = await sendMessage(LISTEN_RECOVER)
      if (operation === recovery && lifetime === 'active' && !state && isListenSession(saved, location.href)) {
        state = saved
        place()
        void begin(saved)
      }
    }
    catch { /* An unavailable worker leaves normal playback in place. */ }
    finally {
      if (operation === recovery)
        operation = { phase: 'idle' }
      checkNativeUnit()
    }
  }
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted)
      return
    lifetime = 'active'
    void restore()
  }, { signal: lifecycle.signal })
  void restore()
  const stopPlayer = observePlayerDom(sync)
  return () => {
    const suspended = lifetime === 'suspended'
    lifetime = 'disposed'
    lifecycle.abort()
    stopRoute()
    stopShell()
    stopLanguage()
    stopPlayer()
    if (state || operation.phase !== 'idle') {
      const preserve = suspended || (!!state && matchesListenUnit(location.href, state.unit))
      if (preserve)
        save()
      stop(preserve)
    }
    if (leave)
      removeStage()
    fit?.dispose()
    button.remove()
  }
}
