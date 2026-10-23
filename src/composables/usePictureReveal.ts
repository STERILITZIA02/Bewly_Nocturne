import { shallowReactive } from 'vue'

import { hasLoadedPicture, rememberLoadedPicture } from '~/utils/pictureRevealMemory'

/**
 * Pictures fade in as they load (bind `is-ready` to `isRevealed`), unless the
 * same picture has loaded before anywhere: then they show at once.
 */
export function usePictureReveal() {
  const loaded = shallowReactive(new Set<string>())
  return {
    isRevealed: (src: string) => loaded.has(src) || hasLoadedPicture(src),
    reveal(src: string) {
      rememberLoadedPicture(src)
      loaded.add(src)
    },
  }
}
