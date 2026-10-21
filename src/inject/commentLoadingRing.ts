import { LOADING_RING_ARC } from '~/utils/loadingRing'

// The shared ring (styles/loadingRing.scss) drawn as a mask: the same 3/4 arc
// with round caps, so the native spinner needs no DOM of ours.
const RING_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='${LOADING_RING_ARC.cx}' cy='${LOADING_RING_ARC.cy}' r='${LOADING_RING_ARC.r}' pathLength='${LOADING_RING_ARC.pathLength}' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-dasharray='75 25'/></svg>`,
)}")`

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
    mask: ${RING_MASK} center / contain no-repeat;
    -webkit-mask: ${RING_MASK} center / contain no-repeat;
    animation: bewly-comment-loading-ring-spin var(--bew-loading-ring-spin-duration, 900ms) linear infinite;
  }

  @keyframes bewly-comment-loading-ring-spin {
    to {
      rotate: 1turn;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :host-context(#bewly-widescreen-root) #spinner::before {
      animation: none;
    }
  }
`
