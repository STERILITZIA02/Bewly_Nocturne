/** document_start only: weak ownership records, no context, graph or discovery. */
export function trackMediaSourceOwnership(onConflict: (media: HTMLMediaElement) => void) {
  const occupied = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
  const owned = new WeakSet<HTMLMediaElement>()
  const Context = globalThis.AudioContext
  const Source = globalThis.MediaElementAudioSourceNode
  const prototype = Context?.prototype
  const original = prototype?.createMediaElementSource
  const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'createMediaElementSource')
  const sourceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaElementAudioSourceNode')
  let installed = false
  let wrappedSource: typeof MediaElementAudioSourceNode | undefined

  const check = (media: HTMLMediaElement) => {
    if (owned.has(media))
      onConflict(media)
  }
  const wrapped: AudioContext['createMediaElementSource'] = function (this: AudioContext, media) {
    check(media)
    const source = Reflect.apply(original!, this, [media]) as MediaElementAudioSourceNode
    occupied.set(media, source)
    return source
  }
  if (prototype && descriptor?.configurable && sourceDescriptor?.configurable && Source) {
    try {
      wrappedSource = new Proxy(Source, { construct(target, args, newTarget) {
        const media = args[1]?.mediaElement as HTMLMediaElement
        if (media)
          check(media)
        const source = Reflect.construct(target, args, newTarget) as MediaElementAudioSourceNode
        occupied.set(source.mediaElement, source)
        return source
      } })
      Object.defineProperty(prototype, 'createMediaElementSource', { ...descriptor, value: wrapped })
      Object.defineProperty(globalThis, 'MediaElementAudioSourceNode', { ...sourceDescriptor, value: wrappedSource })
      installed = true
    }
    catch {
      if (prototype.createMediaElementSource === wrapped)
        Object.defineProperty(prototype, 'createMediaElementSource', descriptor)
    }
  }
  return {
    available: () => installed && prototype?.createMediaElementSource === wrapped && globalThis.MediaElementAudioSourceNode === wrappedSource,
    occupied: (media: HTMLMediaElement) => occupied.has(media),
    capture(context: AudioContext, media: HTMLMediaElement) {
      if (!installed || occupied.has(media))
        throw new Error('Media source already has an owner')
      const source = Reflect.apply(original!, context, [media]) as MediaElementAudioSourceNode
      occupied.set(media, source)
      owned.add(media)
      return source
    },
    dispose() {
      if (prototype?.createMediaElementSource === wrapped && descriptor)
        Object.defineProperty(prototype, 'createMediaElementSource', descriptor)
      if (globalThis.MediaElementAudioSourceNode === wrappedSource && sourceDescriptor)
        Object.defineProperty(globalThis, 'MediaElementAudioSourceNode', sourceDescriptor)
      installed = false
    },
  }
}
