import { computed, onScopeDispose, ref, shallowRef } from 'vue'

import type { ImageViewerRect } from '~/utils/imageViewer'
import { normalizeImageViewerGallery } from '~/utils/imageViewer'

export interface ImageViewerRequest {
  urls: readonly unknown[]
  index: number
  /** The clicked thumbnail: the viewer grows out of it and returns focus to it. */
  trigger?: HTMLElement | null
  /**
   * Where the image at `index` (with its normalised `url`) sits on screen, for
   * the open and close morph. Defaults to the trigger for the starting image.
   */
  getOrigin?: (index: number, url: string) => ImageViewerRect | undefined
  /** Corner radius of the origin, in screen pixels. Defaults to the trigger's. */
  originRadius?: number
  /** Accessible name of the gallery's images, e.g. the moment author. */
  label?: string
  /** Runs once when the viewer starts closing, with the image last shown. */
  onClose?: (index: number) => void
}

export interface ActiveImageViewer extends Omit<ImageViewerRequest, 'urls' | 'index'> {
  id: number
  urls: string[]
  startIndex: number
}

/**
 * The single image viewer of this document. Any caller opens it; the App host
 * renders it. Keeping the request until the leave transition finishes lets the
 * last image stay on screen while it animates out.
 */
const request = shallowRef<ActiveImageViewer | null>(null)
const open = ref(false)
const index = ref(0)
let nextId = 0

/** Opens the viewer and returns its id, or 0 when there is nothing to show. */
export function openImageViewer(input: ImageViewerRequest): number {
  const gallery = normalizeImageViewerGallery(input.urls, input.index)
  if (!gallery.urls.length)
    return 0
  // A new request replaces the current one; the previous owner still hears its close.
  if (open.value)
    request.value?.onClose?.(index.value)
  const id = ++nextId
  request.value = { ...input, id, urls: gallery.urls, startIndex: gallery.index }
  index.value = gallery.index
  open.value = true
  return id
}

/** Closes the viewer; with an id, only when that request is still the shown one. */
export function closeImageViewer(id?: number) {
  const current = request.value
  if (!open.value || !current || (id !== undefined && current.id !== id))
    return
  open.value = false
  current.onClose?.(index.value)
}

export function isImageViewerOpen() {
  return open.value
}

/** State for the App-level host only. */
export function useImageViewerHost() {
  return {
    // computed, not readonly(): a deep readonly proxy would wrap the trigger element.
    request: computed(() => request.value),
    open: computed(() => open.value),
    index,
    close: () => closeImageViewer(),
    /** After the leave transition: drop the gallery so its images are released. */
    release() {
      if (!open.value)
        request.value = null
    },
  }
}

/**
 * Component-scoped access: the viewer a component opened closes with the
 * component, and `close()` never closes a viewer someone else opened since.
 */
export function useImageViewer() {
  let owned = 0
  const isOpen = computed(() => open.value && request.value?.id === owned && owned !== 0)
  function close() {
    if (owned)
      closeImageViewer(owned)
  }
  onScopeDispose(close)
  return {
    isOpen,
    open(input: ImageViewerRequest) {
      owned = openImageViewer(input)
      return owned !== 0
    },
    close,
  }
}
