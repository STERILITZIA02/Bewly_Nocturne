import { createApp, h, nextTick, provide, ref, withDirectives } from 'vue'

import { gridLayout } from '~/logic/storage'

import LayoutEditorOverlay from '../../src/components/LayoutEditorOverlay.vue'
import { activeLayoutEditTargetElement, activeLayoutEditTargetId, enterLayoutEditMode, exitLayoutEditMode, getLayoutEditableDescriptors, isLayoutEditing, useLayoutEditSettingValue, vLayoutEditable } from '../../src/logic/layoutEdit'
import { measureLayoutEditTarget } from '../../src/utils/layoutEditGeometry'

declare global {
  interface Window {
    fixtureStyles: string[]
    fixtureDone: Promise<unknown>
    fixtureInput: (payload: string) => void
    resolveFixtureInput: (id: number) => void
    ScrollTimeline: new (options: { source: Element }) => AnimationTimeline
  }
}

const checks: { name: string, ok: boolean, detail?: string }[] = []
const runtimeErrors: string[] = []
const reportError = console.error
console.error = (...values) => {
  runtimeErrors.push(values.map(String).join(' '))
  reportError(...values)
}
window.addEventListener('error', event => runtimeErrors.push(event.message))
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
const inputRequests = new Map<number, () => void>()
let inputSequence = 0
window.resolveFixtureInput = (id) => {
  inputRequests.get(id)!()
  inputRequests.delete(id)
}
async function input(data: Record<string, unknown>) {
  await new Promise<void>((resolve) => {
    const id = ++inputSequence
    inputRequests.set(id, resolve)
    window.fixtureInput(JSON.stringify({ id, ...data }))
  })
}
async function pointAt(element: Element, click = false, modifiers = 0) {
  const rect = element.getBoundingClientRect()
  await input({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, click, modifiers })
}
function check(name: string, ok: boolean, detail?: unknown) {
  checks.push({ name, ok, detail: detail === undefined ? undefined : JSON.stringify(detail) })
}
async function settle() {
  await nextTick()
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
  await nextTick()
}

async function run() {
  document.documentElement.style.cssText = 'margin:0;width:100%;overflow-x:hidden'
  document.body.style.cssText = 'margin:0;width:100%;overflow-x:hidden'
  const host = document.body.appendChild(document.createElement('div'))
  host.id = 'bewly'
  host.style.cssText = 'position:fixed;inset:0;height:100dvh;overflow:hidden'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = shadow.appendChild(document.createElement('style'))
  style.textContent = `
    :host { --bew-z-layout-editor:10005; --bew-layout-editor-outline-color:#555; --bew-hairline:1px; --bew-edge-color:#888; --bew-surface-radius:16px; --bew-corner-shape:round; --bew-elevated-alt-solid:white; --bew-space-1:4px; --bew-space-2:8px; --bew-font-size-title:13px; --bew-font-size-control:13px; --bew-font-size-caption:11px; --bew-line-height-title:16px; --bew-line-height-control:16px; --bew-line-height-caption:14px }
    :host { --bew-icon-size-sm:16px; --bew-control-height-sm:28px; --bew-control-press-scale:0.97 }
    .fixture-wrapper { position:relative;height:100%;overflow:hidden }
    .fixture-viewport { height:100%;overflow:auto }
    .fixture-grid { margin:100px 20px 0;width:500px;height:240px;background:#ddd;border-radius:16px }
    .fixture-topbar { position:fixed;top:20px;left:20px;width:160px;height:40px;border-radius:9999px }
    .fixture-dock { position:fixed;bottom:16px;left:500px;width:200px;height:56px;border-radius:9999px;background:#ccc }
    .fixture-audit { position:fixed;left:300px;top:120px;width:160px;height:44px;background:#ddd;border:0;box-sizing:border-box }
    .fixture-tail { height:1600px }
    ${window.fixtureStyles.join('\n')}`
  const mount = shadow.appendChild(document.createElement('div'))
  mount.style.height = '100%'
  const mainAppRef = ref<HTMLElement>()
  const scrollViewportRef = ref<HTMLElement>()
  let businessClicks = 0
  const auditTarget = ref<string>()
  const auditRound = ref(false)
  const showEditor = ref(true)
  const app = createApp({
    setup() {
      provide('BEWLY_APP', { mainAppRef, scrollViewportRef })
      const preview = useLayoutEditSettingValue('page.home.gridLayout', () => gridLayout.value.home)
      return () => h('main', { ref: mainAppRef, class: 'fixture-wrapper' }, [
        h('div', { ref: scrollViewportRef, class: 'fixture-viewport' }, [
          withDirectives(h('button', { class: 'fixture-topbar', onClick: () => businessClicks++ }, 'Top bar'), [[vLayoutEditable, 'topbar-search']]),
          withDirectives(h('div', { class: 'fixture-grid', style: { width: preview.value === 'twoColumns' ? '420px' : '500px' }, onClick: () => businessClicks++ }, 'Grid'), [[vLayoutEditable, 'home-video-grid']]),
          h('div', { class: 'fixture-tail' }),
        ]),
        withDirectives(h('div', { class: 'fixture-dock' }), [[vLayoutEditable, 'dock']]),
        auditTarget.value && withDirectives(h('button', { key: auditTarget.value, class: 'fixture-audit', style: { borderRadius: auditRound.value ? '50%' : '16px', width: auditRound.value ? '44px' : '160px', cornerShape: auditRound.value ? 'round' : 'superellipse(1.7)' } }, auditTarget.value), [[vLayoutEditable, auditTarget.value]]),
        showEditor.value && h(LayoutEditorOverlay),
      ])
    },
  })
  app.mount(mount)
  const target = shadow.querySelector<HTMLElement>('.fixture-grid')!
  const topbar = shadow.querySelector<HTMLElement>('.fixture-topbar')!
  const dock = shadow.querySelector<HTMLElement>('.fixture-dock')!
  const button = (selector: string, text: string) => [...shadow.querySelectorAll<HTMLElement>(selector)].find(item => item.textContent?.includes(text))!
  try {
    check('real page shell has a zero-height body and a visible fixed app', document.body.clientHeight === 0 && host.clientHeight > 0, { body: document.body.clientHeight, host: host.clientHeight })
    check('visible grid survives ancestor clipping in the real page shell', !!measureLayoutEditTarget(target))
    check('fixed top bar survives ancestor clipping in the real page shell', !!measureLayoutEditTarget(topbar))
    enterLayoutEditMode()
    await settle()
    check('editor uses the non-modal top layer without making page objects inert', !!shadow.querySelector('.layout-editor-overlay:popover-open') && !mainAppRef.value!.inert)
    check('editor toolbar stays above the Dock surface', shadow.querySelector('.layout-editor-toolbar')!.getBoundingClientRect().bottom < dock.getBoundingClientRect().top)
    await pointAt(target)
    await settle()
    check('enter without selection then hover produces a visible outline', !!shadow.querySelector('.layout-editor-outline--hovered'))
    await pointAt(target, true)
    await settle()
    check('click stores the correct target', activeLayoutEditTargetId.value === 'home-video-grid')
    check('click renders both the selection outline and editor controls', !!shadow.querySelector('.layout-editor-outline:not(.layout-editor-outline--hovered)') && !!shadow.querySelector('.layout-editor-menu'))
    check('editing blocks business clicks', businessClicks === 0)
    scrollViewportRef.value!.scrollTop = 80
    await settle()
    const outline = shadow.querySelector<HTMLElement>('.layout-editor-outline:not(.layout-editor-outline--hovered)')
    check('selection outline follows actual scrolling', !!outline && Math.abs(outline.getBoundingClientRect().top - target.getBoundingClientRect().top) < 1)
    await pointAt(button('.layout-editor-menu button', 'layout_two_columns'), true)
    await settle()
    check('real pointer clicks update preview without persisting', target.getBoundingClientRect().width === 420 && gridLayout.value.home === 'adaptive')
    check('selection outline follows the changed preview size', shadow.querySelector('.layout-editor-outline:not(.layout-editor-outline--hovered)')?.getBoundingClientRect().width === 420)
    await pointAt(topbar, true)
    await settle()
    check('switching to a fixed control keeps a visible selection', activeLayoutEditTargetId.value === 'topbar-search' && !!shadow.querySelector('.layout-editor-menu'))
    await pointAt(dock, true)
    await settle()
    check('Dock selection matches the painted capsule bounds', activeLayoutEditTargetId.value === 'dock' && shadow.querySelector('.layout-editor-outline:not(.layout-editor-outline--hovered)')?.getBoundingClientRect().width === dock.getBoundingClientRect().width)
    await pointAt(button('.layout-editor-toolbar button', 'layout_editor.done'), true)
    await settle()
    check('Done saves the draft after switching targets', !isLayoutEditing.value && gridLayout.value.home === 'twoColumns')
    enterLayoutEditMode()
    await settle()
    await pointAt(target, true)
    await settle()
    await pointAt(button('.layout-editor-menu button', 'layout_one_column'), true)
    await settle()
    await input({ key: 'Tab' })
    check('native Tab keeps focus within editor controls', shadow.querySelector('.layout-editor-overlay')!.contains(shadow.activeElement))
    await input({ key: 'Escape' })
    await settle()
    check('Escape exits and removes editor UI', !isLayoutEditing.value && !shadow.querySelector('.layout-editor-overlay'))
    check('Escape discards preview and retains the saved layout', gridLayout.value.home === 'twoColumns' && target.getBoundingClientRect().width === 420)
    await pointAt(target, true)
    check('exit restores business interaction', businessClicks === 1)
    enterLayoutEditMode()
    await settle()
    const highest = mainAppRef.value!.appendChild(document.createElement('button'))
    highest.style.cssText = 'position:fixed;left:500px;top:400px;width:120px;height:32px;border-radius:8px;z-index:2147483647;background:white'
    highest.textContent = 'High layer'
    await pointAt(highest, true)
    await settle()
    check('unmapped high-layer objects are not editable', !activeLayoutEditTargetElement.value && !shadow.querySelector('.layout-editor-menu'))
    highest.remove()
    for (const [index, descriptor] of getLayoutEditableDescriptors().entries()) {
      auditTarget.value = descriptor.id
      auditRound.value = index % 2 === 0
      await settle()
      const node = shadow.querySelector<HTMLElement>('.fixture-audit')!
      await pointAt(node, true)
      await settle()
      const selection = shadow.querySelector<HTMLElement>('.layout-editor-outline:not(.layout-editor-outline--hovered)')
      const bounds = node.getBoundingClientRect()
      check(`registered target ${descriptor.id}: exact box, corners and setting controls`, activeLayoutEditTargetElement.value === node
      && activeLayoutEditTargetId.value === descriptor.id && !!selection
      && Math.abs(selection.getBoundingClientRect().left - bounds.left) < 1
      && Math.abs(selection.getBoundingClientRect().width - bounds.width) < 1
      && getComputedStyle(selection).borderTopLeftRadius === getComputedStyle(node).borderTopLeftRadius
      && getComputedStyle(selection).getPropertyValue('corner-shape') === getComputedStyle(node).getPropertyValue('corner-shape')
      && !!button('.layout-editor-menu button', 'apply_open_setting'))
    }
    auditTarget.value = undefined
    await settle()
    const card = target.appendChild(document.createElement('article'))
    card.style.marginTop = '80px'
    const title = card.appendChild(document.createElement('span'))
    title.textContent = 'Card title'
    const image = card.appendChild(document.createElement('img'))
    image.style.cssText = 'display:block;width:80px;height:40px'
    image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>'
    for (const [name, element] of [['title', title], ['image', image], ['card', card]] as const) {
      await pointAt(dock, true)
      await settle()
      await pointAt(element, true)
      await settle()
      check(`${name} selects the whole video-layout setting`, activeLayoutEditTargetElement.value === target && activeLayoutEditTargetId.value === 'home-video-grid')
    }
    await pointAt(image, true, 1)
    await settle()
    check('Alt cannot bypass setting-level selection', activeLayoutEditTargetElement.value === target)
    const disabled = card.appendChild(document.createElement('button'))
    disabled.disabled = true
    disabled.textContent = 'Disabled child'
    await pointAt(dock, true)
    await settle()
    await pointAt(disabled, true)
    await settle()
    check('disabled children also select their setting region', activeLayoutEditTargetElement.value === target)
    check('DOM hierarchy controls have been removed', !shadow.querySelector('.layout-editor-menu__navigation'))
    await pointAt(button('.layout-editor-toolbar button', 'common.operation.cancel'), true)
    await settle()
    let released = 0
    for (const type of ['pointerdown', 'pointerup', 'click', 'wheel', 'keydown', 'contextmenu']) {
      const callback = () => released++
      card.addEventListener(type, callback)
      card.dispatchEvent(new Event(type, { bubbles: true, composed: true, cancelable: true }))
      card.removeEventListener(type, callback)
    }
    check('cancel releases the interaction interceptors', released === 6)
    card.remove()
    const clip = mainAppRef.value!.appendChild(document.createElement('div'))
    clip.style.cssText = 'position:absolute;left:600px;top:300px;width:80px;height:80px;overflow:hidden'
    const floating = clip.appendChild(document.createElement('button'))
    floating.style.cssText = 'position:fixed;left:700px;top:420px;width:80px;height:40px;visibility:visible'
    check('fixed child escapes an absolute clipping ancestor', !!measureLayoutEditTarget(floating) && shadow.elementFromPoint(720, 440) === floating)
    clip.style.transform = 'translateZ(0)'
    check('a transformed ancestor clips a fixed child outside its box', !measureLayoutEditTarget(floating))
    floating.style.left = '20px'
    floating.style.top = '60px'
    check('transformed containing block preserves partial clipping', measureLayoutEditTarget(floating)?.visible.height === 20)
    clip.style.transform = ''
    clip.style.overflow = 'visible'
    clip.style.contain = 'paint'
    check('paint containment clips even without overflow hidden', measureLayoutEditTarget(floating)?.visible.height === 20)
    clip.style.contain = ''
    clip.style.visibility = 'hidden'
    check('a visible child may override inherited hidden visibility', !!measureLayoutEditTarget(floating))
    clip.remove()
    check('no runtime exceptions or observer loop errors', runtimeErrors.length === 0, runtimeErrors)
  }
  finally {
    exitLayoutEditMode()
    app.unmount()
    host.remove()
  }
}

window.fixtureDone = run().then(() => ({ checks }), error => ({ checks, error: String(error?.stack ?? error) })).then((result) => {
  const output = document.body.appendChild(document.createElement('pre'))
  output.id = 'result'
  output.textContent = JSON.stringify(result)
  return result
})
