/**
 * Interface scale by display. The design is calibrated on a 14.2-inch MacBook Pro
 * at “More Space” (1800 points across an 11.91-inch panel, about 151 CSS px per
 * inch, seen from laptop distance). Displays whose CSS px look larger shrink the
 * interface toward that density; denser ones keep it. Browsers expose no inches,
 * so the panel comes from macOS's exact “looks like” sizes, then from the
 * common monitor resolutions, then from how other systems scale laptops.
 */

export type InterfaceSize = 'auto' | 'compact' | 'standard' | 'comfortable'
export const INTERFACE_SIZES: readonly InterfaceSize[] = ['auto', 'compact', 'standard', 'comfortable']

export interface DisplaySignals {
  /** `screen.width` and `screen.height` in CSS px. */
  width: number
  height: number
  dpr: number
  /** On macOS every built-in panel is in APPLE_PANELS; anything else is a monitor. */
  mac: boolean
}

const MIN_SCALE = 0.75
/** Windows and Linux laptop scaling settles near this many CSS px per inch. */
const LAPTOP_DENSITY = 120

/** Apple panels: diagonal in inches, then each size macOS draws at 2x on it. */
const APPLE_PANELS: [diagonal: number, modes: [width: number, height: number][]][] = [
  [13.3, [[1024, 640], [1280, 800], [1440, 900], [1680, 1050]]],
  [13.6, [[1024, 665], [1280, 832], [1470, 956], [1710, 1112]]],
  [14.2, [[1147, 745], [1352, 878], [1512, 982], [1800, 1169]]],
  [15.4, [[1920, 1200]]],
  [16, [[1152, 720], [1344, 840], [1536, 960], [1792, 1120], [2048, 1280]]],
  [16.2, [[1312, 848], [1496, 967], [1728, 1117], [2056, 1329]]],
  [23.5, [[2240, 1260]]],
  [31.6, [[3008, 1692]]],
]

/** The usual diagonal of a monitor with this many physical pixels, and the scale Windows gives it. */
const COMMON_MONITORS: [width: number, height: number, diagonal: number, windowsScale: number][] = [
  [1920, 1080, 24, 1],
  [1920, 1200, 24, 1],
  [2560, 1080, 29, 1],
  [2560, 1440, 27, 1],
  [2560, 1600, 30, 1],
  [3440, 1440, 34, 1],
  [3840, 1600, 38, 1],
  [3840, 2160, 27, 1.5],
  [5120, 1440, 49, 1],
  [5120, 2160, 40, 1.25],
  [5120, 2880, 27, 2],
  [6016, 3384, 32, 2],
]

function panelWidth(diagonal: number, width: number, height: number) {
  return diagonal * width / Math.hypot(width, height)
}

const REFERENCE_DENSITY = 1800 / panelWidth(14.2, 1800, 1169)

/** Desktop displays sit farther away (50 cm at 16" up to 75 cm at 32"), so each px may look larger. */
function viewingDistance(diagonal: number) {
  return Math.min(1.5, Math.max(1, 1 + (diagonal - 16) / 32))
}

/** CSS px per inch, weighted by viewing distance; null when the display is unknown. */
export function estimateDisplayDensity({ width, height, dpr, mac }: DisplaySignals): number | null {
  // Page zoom rounds `screen` to whole CSS px; the backing store stays within a pixel or two.
  const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance
  const backingWidth = width * dpr
  const backingHeight = height * dpr
  if (mac) {
    // Scaled modes are drawn at 2x, so the mode is half the backing store at any page zoom.
    for (const [diagonal, modes] of APPLE_PANELS) {
      const mode = modes.find(([w, h]) => near(w, backingWidth / 2, 1) && near(h, backingHeight / 2, 1))
      if (mode)
        return mode[0] / panelWidth(diagonal, ...mode) * viewingDistance(diagonal)
    }
  }
  else if (dpr >= 1.25 && width <= 1920) {
    return LAPTOP_DENSITY
  }
  const monitor = COMMON_MONITORS.find(([w, h]) => near(w, backingWidth, 2) && near(h, backingHeight, 2))
  if (!monitor)
    return null
  const [physicalWidth, physicalHeight, diagonal, windowsScale] = monitor
  // The panel's default system scale, not the current DPR: page zoom and a
  // larger system scale the user chose stay on top (macOS gives 4K-class monitors 2x).
  const systemScale = mac ? (physicalHeight >= 2160 ? 2 : 1) : windowsScale
  return physicalWidth / systemScale / panelWidth(diagonal, physicalWidth, physicalHeight) * viewingDistance(diagonal)
}

/**
 * Scales are whole numbers of device pixels per 4px grid unit, so the spacing,
 * radius and control steps land on the pixel grid (2x: 1, 0.875, 0.75).
 */
export function resolveInterfaceScale(size: InterfaceSize, display: DisplaySignals): number {
  const units = 4 * display.dpr
  if (size === 'standard')
    return 1
  if (size === 'compact')
    return (Math.ceil(units) - 1) / units
  if (size === 'comfortable')
    return (Math.floor(units) + 1) / units
  const density = estimateDisplayDensity(display)
  if (density === null)
    return 1
  const target = Math.min(1, Math.max(MIN_SCALE, density / REFERENCE_DENSITY))
  // 1 is always a step, even when page zoom leaves no whole pixel count per unit.
  const step = Math.min(1, Math.round(target * units) / units)
  return 1 - target <= Math.abs(step - target) ? 1 : step
}

/** The JS twin of the `ui()` Sass function: a design length on this display, in whole device pixels. */
export function scaleDesignLength(length: number, scale: number, devicePixel: number) {
  return scale === 1 ? length : Math.round(length * scale / devicePixel) * devicePixel
}
