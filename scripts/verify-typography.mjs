import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileAsync } from 'sass'

export function registerTypographyChecks(check) {
  check('typography: actual CSS isolates UI font preferences and numeric/inline emphasis from the native page', async () => {
    const [fonts, main, reset] = await Promise.all([
      compileAsync(fileURLToPath(new URL('../src/styles/fonts.scss', import.meta.url))),
      compileAsync(fileURLToPath(new URL('../src/styles/main.scss', import.meta.url))),
      readFile(new URL('../src/styles/reset.css', import.meta.url), 'utf8'),
    ])
    const style = document.head.appendChild(document.createElement('style'))
    const fixture = document.body.appendChild(document.createElement('div'))
    fixture.className = 'bewly-design'
    fixture.innerHTML = '<p class="native">原站 123</p><div class="bewly-wrapper"><p class="body">正文 123 <strong>强调</strong></p><time>12:34</time><svg class="iconify--tabler" stroke-width="2"><path /></svg><svg class="explicit-chevron" stroke-width="2.5"><path /></svg></div>'
    style.textContent = `${reset}\n${fonts.css}\n${main.css}`.replaceAll('var(--bew-font-weight-semibold, 600)', '600')
    try {
      const ui = fixture.querySelector('.bewly-wrapper')
      assert.equal(getComputedStyle(ui).fontFamily, 'var(--bew-fonts-ui)')
      assert.equal(getComputedStyle(ui).getPropertyValue('font-synthesis-weight'), 'none')
      assert.equal(getComputedStyle(fixture.querySelector('.body')).fontFeatureSettings, 'normal')
      assert.equal(getComputedStyle(fixture.querySelector('.native')).fontFeatureSettings, '"tnum"')
      assert.equal(getComputedStyle(fixture.querySelector('time')).fontVariantNumeric, 'tabular-nums')
      assert.equal(getComputedStyle(fixture.querySelector('strong')).fontWeight, '600')
      fixture.classList.add('modify-fonts')
      assert.equal(getComputedStyle(ui).fontFamily, 'var(--bew-fonts)', 'recommended/custom modes retain their existing override')
      assert.equal(getComputedStyle(fixture.querySelector('.native')).fontFamily, 'var(--bew-fonts)')
      assert.equal(getComputedStyle(fixture.querySelector('.iconify--tabler')).strokeWidth, '1.75px')
      assert.equal(fixture.querySelector('.explicit-chevron').getAttribute('stroke-width'), '2.5')
      assert.notEqual(getComputedStyle(fixture.querySelector('.explicit-chevron')).strokeWidth, '1.75px')
    }
    finally {
      fixture.remove()
      style.remove()
    }
  })

  check('typography: actual UnoCSS mask generation applies Tabler 1.75 without altering filled state icons', async () => {
    const { createGenerator } = await import('unocss')
    const { default: config } = await import('../unocss.config')
    const uno = await createGenerator(config)
    const { css } = await uno.generate('i-tabler:search i-tabler:star-filled i-tabler:copy font-medium')
    const decoded = css.replace(/data:image\/svg\+xml;utf8,[^"]+/g, svg => decodeURIComponent(svg))
    const search = decoded.split('.i-tabler\\:search{')[1]?.split('}')[0]
    assert.ok(search?.includes('stroke-width=\'1.75\''))
    assert.ok(!search?.includes('stroke-width=\'2\''))
    assert.ok(decoded.includes('.i-tabler\\:star-filled{'))
    assert.ok(decoded.includes('.i-tabler\\:copy{'))
    assert.ok(css.includes('font-weight:var(--bew-font-weight-medium)'))
  })
}
