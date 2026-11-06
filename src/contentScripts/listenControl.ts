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
import { isListenSession, LISTEN_ATTRIBUTE, LISTEN_GATE, LISTEN_RECOVER, LISTEN_RELEASE, LISTEN_SAVE, matchesListenUnit, returnVideoUrl } from '~/utils/listenPlayback'
import { listenStage } from '~/utils/listenStage'
import { readListenSources } from '~/utils/listenStreams'
import { createLoadingRingElement } from '~/utils/loadingRing'
import { getUserID } from '~/utils/main'
import { sendMessage } from '~/utils/messaging'
import { getPlayerRoot, getVideoElement, isPlayerAdvertisement } from '~/utils/playerMedia'
import { getNativePlaybackUnitKey, readNativeMediaSnapshot, releaseNativeListen, resumeNativeListen, suspendNativePlayback, switchNativePlaybackVisit, VIDEO_METADATA_CHANGED } from '~/utils/videoMetadataBridge'

import { prepareListenAudio } from './listenAudio'
import { bindListenNativeBar } from './listenNativeBar'
import { restoreListenReturn, saveListenReturn } from './listenReturn'
import { registerPlayerControlFit } from './playerControlFit'
import { createPlayerControlTooltip, updatePlayerControlTooltip } from './playerControlTooltip'
import { observePlayerDom } from './playerDomLifecycle'

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
  let pending: (AbortController & { finished: Promise<void> }) | undefined
  let media: AbortController | undefined
  let playingAudio: HTMLAudioElement | undefined
  let masked: HTMLElement | null = null
  let ownerChanges: MutationObserver | undefined
  let stageHost: ReturnType<typeof createPlaybackAppHost> | undefined
  // Bpx's bar drives the audio (listenNativeBar) for this root and audio.
  let bar: { root: HTMLElement, audio: HTMLAudioElement, controller: AbortController } | undefined
  let failed = false
  let suspendedNative: HTMLElement | undefined
  let shell: HTMLElement | undefined
  let fit: ReturnType<typeof registerPlayerControlFit> | undefined
  let leaving = false
  let unloading = false
  let recovering = false
  let lastSaved = ''
  const lifecycle = new AbortController()

  function save() {
    if (state) {
      if (playingAudio && !playingAudio.error && playingAudio.readyState >= HTMLMediaElement.HAVE_METADATA)
        state.time = playingAudio.currentTime
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
    listenStage.value = state && stageHost
      ? { mount: stageHost.mount, audio: playingAudio ?? null, unit: state.unit, loading: !!pending, failed, retry }
      : null
  }
  function bindBar() {
    if (bar && bar.root === masked && bar.audio === playingAudio)
      return
    bar?.controller.abort()
    bar = undefined
    if (masked && playingAudio) {
      bar = { root: masked, audio: playingAudio, controller: new AbortController() }
      bindListenNativeBar(masked, playingAudio, bar.controller.signal)
    }
  }
  function place() {
    const root = state ? getPlayerRoot() : null
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
      stageHost?.dispose()
      stageHost = undefined
      publish()
      return
    }
    // The stage covers the picture inside the player box, under Bpx's control
    // bar, in the Bewly playback page and on the native page alike.
    stageHost ??= createPlaybackAppHost('bewly-listen-stage')
    if (masked && stageHost.host.parentElement !== masked)
      masked.append(stageHost.host)
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
  function stop(keepCheckpoint = false, releasedGate?: number) {
    const previous = state
    const native = suspendedNative ?? getVideoElement()
    const nativeGate = (native && readNativeMediaSnapshot(native)?.listenOwner) ?? previous?.gate
    pending?.abort()
    pending = undefined
    media?.abort()
    media = undefined
    playingAudio = undefined
    state = undefined
    suspendedNative = undefined
    failed = false
    place()
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
    if (!state || leaving)
      return
    leaving = true
    const previous = state
    try {
      const preparing = pending
      preparing?.abort()
      await preparing?.finished
      if (state !== previous || !matchesListenUnit(location.href, previous.unit))
        return
      save()
      const gate = previous.gate
      await sendMessage(LISTEN_RELEASE, gate)
      if (state !== previous || !matchesListenUnit(location.href, previous.unit))
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
      stop(false, gate)
      saveListenReturn(snapshot)
      restoreListenReturn(lifecycle.signal)
    }
    catch { fail() }
    finally { leaving = false }
  }
  async function begin(saved?: ListenSession) {
    if (leaving)
      return
    if (pending) {
      pending.abort()
      return
    }
    const original = getVideoElement()
    const originalSnapshot = original && readNativeMediaSnapshot(original)
    const unit = saved?.unit ?? originalSnapshot?.unit
    if (originalSnapshot?.btr.installed && originalSnapshot.btr.listenHandoffVersion !== 1) {
      useToast().info(t('widescreen.listen_btr_companion_required'))
      if (saved)
        fail()
      return
    }
    if (!unit || !matchesListenUnit(location.href, unit) || (!saved && (!original || isPlayerAdvertisement(original)))) {
      useToast().info(t('widescreen.listen_not_ready'))
      return
    }
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
    let finish!: () => void
    const finished = new Promise<void>(resolve => finish = resolve)
    const attempt = Object.assign(new AbortController(), { finished })
    const stopNavigation = onRouteChange(() => {
      if (!matchesListenUnit(location.href, unit))
        attempt.abort()
    })
    pending = attempt
    setBusy(true)
    let gate: number | undefined
    let prepared: ReturnType<typeof prepareListenAudio> | undefined
    let handoffMedia: HTMLElement | undefined
    const isCurrent = () => !attempt.signal.aborted && !unloading && account === getUserID() && matchesListenUnit(location.href, unit)
    try {
      const probe = document.createElement('audio')
      const sources = await readListenSources(unit, type => probe.canPlayType(type), attempt.signal)
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
        gate = await sendMessage(LISTEN_GATE, { unit, sources, state: saved })
        if (!gate || !isCurrent())
          throw new Error('Listening grant unavailable')
        candidate.gate = gate
        save()
      }
      prepared = prepareListenAudio(candidate, sources, attempt.signal, fail)
      const timeout = setTimeout(() => attempt.abort(new DOMException('Audio timed out', 'TimeoutError')), 20_000)
      try {
        await prepared.ready
      }
      finally { clearTimeout(timeout) }
      if (!isCurrent())
        return
      if (!saved) {
        gate = await sendMessage(LISTEN_GATE, { unit, sources })
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
        const suspended = suspendNativePlayback(video, unit, gate, current.listenOwner)
        if (suspended === true || suspended === 'interrupted')
          handoffMedia = video
        if (suspended !== true)
          throw new Error('Native player could not release its source')
        suspendedNative = video
      }
      else {
        const suspended = original && suspendNativePlayback(original, unit, gate!, originalSnapshot?.listenOwner)
        if (original && (suspended === true || suspended === 'interrupted'))
          handoffMedia = original
        if (suspended !== true)
          throw new Error('Native player could not renew its listening owner')
        suspendedNative = original!
      }
      if (!isCurrent())
        return
      candidate.gate = gate!
      state = candidate
      media?.abort()
      media = attempt
      playingAudio = prepared.audio
      failed = false
      prepared.commit()
      place()
      save()
      for (const event of ['pause', 'seeked', 'ended'])
        playingAudio.addEventListener(event, save, { signal: attempt.signal })
      window.addEventListener(VIDEO_METADATA_CHANGED, checkNativeUnit, { signal: attempt.signal })
      document.addEventListener('loadedmetadata', (event) => {
        if (event.target instanceof HTMLVideoElement)
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
      if (media !== attempt)
        attempt.abort()
      if (gate && state?.gate !== gate) {
        if (unloading && saved) {
          await sendMessage(LISTEN_SAVE, { ...saved, gate }).catch(() => {})
        }
        else {
          await sendMessage(LISTEN_RELEASE, gate).catch(() => {})
          if (handoffMedia && matchesListenUnit(location.href, unit)) {
            resumeNativeListen(handoffMedia, { unit: getNativePlaybackUnitKey(unit), gate, time: candidate.time, playing: candidate.playing, rate: candidate.rate, volume: candidate.volume, muted: candidate.muted, bind: true })
          }
        }
      }
      if (pending === attempt) {
        pending = undefined
        setBusy(false)
      }
      finish()
    }
  }
  function activate() {
    if (state)
      void returnVideo()
    else void begin()
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
  const stopPlayer = observePlayerDom(sync)
  const stopShell = watch(() => session.current?.sidebarEl, place)
  const stopLanguage = watch(() => settings.value.language, () => {
    button.setAttribute('aria-label', t('widescreen.listen'))
    updatePlayerControlTooltip(button, t('widescreen.listen'))
    fit?.refresh()
  }, { immediate: true })
  const stopRoute = onRouteChange(() => {
    if (state && !matchesListenUnit(location.href, state.unit))
      stop()
  })
  restoreListenReturn(lifecycle.signal)
  function checkNativeUnit() {
    if (!state || leaving || unloading)
      return
    const video = getVideoElement()
    const snapshot = video && readNativeMediaSnapshot(video)
    if (!video || !snapshot?.unit)
      return
    if (getNativePlaybackUnitKey(snapshot.unit) !== getNativePlaybackUnitKey(state.unit)) {
      stop()
    }
    else if ((video !== suspendedNative || snapshot.btr.ownsMedia) && suspendNativePlayback(video, state.unit, state.gate, snapshot.listenOwner) === true) {
      suspendedNative = video
    }
  }
  window.addEventListener('pagehide', () => {
    unloading = true
    save()
    stop(true)
  }, { capture: true, signal: lifecycle.signal })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden)
      save()
  }, { signal: lifecycle.signal })
  async function restore() {
    if (recovering || state || pending)
      return
    recovering = true
    try {
      const saved = await sendMessage(LISTEN_RECOVER)
      if (!lifecycle.signal.aborted && !unloading && !state && !pending && isListenSession(saved, location.href)) {
        state = saved
        place()
        void begin(saved)
      }
    }
    catch { /* An unavailable worker leaves normal playback in place. */ }
    finally { recovering = false }
  }
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted)
      return
    unloading = false
    void restore()
  }, { signal: lifecycle.signal })
  void restore()
  return () => {
    lifecycle.abort()
    stopRoute()
    stopShell()
    stopLanguage()
    stopPlayer()
    if (state || pending) {
      const preserve = unloading || (!!state && matchesListenUnit(location.href, state.unit))
      if (preserve)
        save()
      stop(preserve)
    }
    fit?.dispose()
    button.remove()
  }
}
