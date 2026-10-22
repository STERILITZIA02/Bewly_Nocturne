/**
 * Prefer the OS/UA text scale where exposed, otherwise use the browser's default
 * font size. Sample independently of Bilibili's pinned root size. Do not multiply
 * the two signals: preferred-text-scale can already include the browser setting.
 */
export function readBrowserFontScale() {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:medium!important;--bew-preferred-text-scale:env(preferred-text-scale,1)'
  document.documentElement.append(probe)
  const style = getComputedStyle(probe)
  const pixels = Number.parseFloat(style.fontSize)
  const preferred = Number.parseFloat(style.getPropertyValue('--bew-preferred-text-scale'))
  probe.remove()
  if (Number.isFinite(preferred) && preferred > 0 && preferred !== 1)
    return preferred
  return Number.isFinite(pixels) && pixels > 0 ? pixels / 16 : 1
}
