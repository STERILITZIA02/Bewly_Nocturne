import { LOADING_RING_MASK } from '~/utils/loadingRing'
import { reducedMotionCss } from '~/utils/reducedMotion'

/**
 * `bili-comments-spinner` is every native comment loader (first page, more
 * pages, replies): a GIF and a caption. Inside the playback page it becomes
 * the one Bewly loading ring; the caption stays for assistive technology.
 */
export const COMMENT_SPINNER_RING_CSS = `
  :host-context(#bewly-widescreen-root) #spinner {
    display: flex !important;
    align-items: center;
    justify-content: center;
    padding: var(--bew-space-4, 16px) 0 !important;
    color: var(--bew-text-3) !important;
  }

  :host-context(#bewly-widescreen-root) #spinner img {
    display: none !important;
  }

  :host-context(#bewly-widescreen-root) #spinner span {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    clip-path: inset(50%) !important;
    white-space: nowrap !important;
  }

  :host-context(#bewly-widescreen-root) #spinner::before {
    content: "";
    flex: none;
    width: var(--bew-icon-size-lg, 24px);
    height: var(--bew-icon-size-lg, 24px);
    background: currentColor;
    mask: ${LOADING_RING_MASK} center / contain no-repeat;
    -webkit-mask: ${LOADING_RING_MASK} center / contain no-repeat;
    animation: bewly-comment-loading-ring-spin var(--bew-loading-ring-spin-duration, 900ms) linear infinite;
  }

  @keyframes bewly-comment-loading-ring-spin {
    to {
      rotate: 1turn;
    }
  }

  ${reducedMotionCss(':host-context(#bewly-widescreen-root) #spinner::before', 'animation:none;', 'native-shadow')}
`
