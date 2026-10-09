/**
 * 收藏弹窗增强工具函数
 * 用于在B站收藏弹窗添加清空已选按钮和放大样式
 */

import { watch } from 'vue'

import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { readNativeFavoriteDialog } from '~/utils/videoMetadataBridge'

let bootstrapObserver: MutationObserver | null = null
let dialogObserver: MutationObserver | null = null
let portalObserver: MutationObserver | null = null
let enhanceTimer: number | null = null
let currentDialog: HTMLElement | null = null
let currentGuard: ReturnType<typeof createFullFolderGuard> | undefined
let stopSettingsWatch: (() => void) | undefined

function createFullFolderGuard(dialog: HTMLElement) {
  interface Row { input: HTMLInputElement, id: string, aid: number, original: boolean, disabled: boolean, restored: boolean, aria: string | null }
  const rows = new Map<HTMLElement, Row>()
  let message: HTMLElement | undefined
  let messageTimer: ReturnType<typeof setTimeout> | undefined
  function clearMessage() {
    clearTimeout(messageTimer)
    messageTimer = undefined
    message?.remove()
    message = undefined
  }
  function releaseRow(label: HTMLElement, row: Row, restore = true) {
    label.classList.remove('bewly-full-disabled', 'bewly-full-restorable')
    if (restore && row.restored && !row.input.disabled)
      row.input.disabled = row.disabled
    if (row.aria === null)
      row.input.removeAttribute('aria-disabled')
    else row.input.setAttribute('aria-disabled', row.aria)
    rows.delete(label)
  }
  function clearRows() {
    const snapshot = readNativeFavoriteDialog(dialog)
    const labels = Array.from(dialog.querySelectorAll<HTMLElement>('.group-list > ul > li > label'))
    for (const [label, row] of rows) {
      const folder = snapshot?.folders[labels.indexOf(label)]
      releaseRow(label, row, !snapshot || (snapshot.aid === row.aid && folder?.id === row.id))
    }
    clearMessage()
  }
  function refresh() {
    if (!dialog.isConnected || dialog.getClientRects().length === 0) {
      clearRows()
      return
    }
    const snapshot = readNativeFavoriteDialog(dialog)
    const labels = Array.from(dialog.querySelectorAll<HTMLElement>('.group-list > ul > li > label'))
    for (const [label, row] of rows) {
      const folder = snapshot?.folders[labels.indexOf(label)]
      if (!snapshot || snapshot.aid !== row.aid || folder?.id !== row.id || label.querySelector('input') !== row.input) {
        releaseRow(label, row, !snapshot)
        if (row.restored && folder?.count !== undefined && folder.capacity !== undefined)
          row.input.disabled = folder.count >= folder.capacity
        clearMessage()
      }
    }
    if (!snapshot || labels.length !== snapshot.folders.length)
      return
    labels.forEach((label, index) => {
      const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]')
      const folder = snapshot.folders[index]
      if (!input || !folder)
        return
      const full = folder.count !== undefined && folder.capacity !== undefined && folder.count >= folder.capacity
      let row = rows.get(label)
      if (!full) {
        if (row)
          releaseRow(label, row, false)
        return
      }
      if (!row) {
        row = { input, id: folder.id, aid: snapshot.aid, original: folder.original, disabled: input.disabled, restored: false, aria: input.getAttribute('aria-disabled') }
        rows.set(label, row)
      }
      const blocked = !row.original
      for (const [name, enabled] of [['bewly-full-disabled', blocked], ['bewly-full-restorable', !blocked]] as const) {
        if (label.classList.contains(name) !== enabled)
          label.classList.toggle(name, enabled)
      }
      if (input.getAttribute('aria-disabled') !== String(blocked))
        input.setAttribute('aria-disabled', String(blocked))
      // Native max_count can disable a full folder even when this video was
      // already in it. Preserve its business change event, only restore access.
      if (row.original && input.disabled) {
        row.restored = true
        input.disabled = false
      }
    })
  }
  function showFullMessage(label: HTMLElement) {
    clearMessage()
    message = document.createElement('div')
    message.className = 'bili-msg error show bewly-favorite-full-message'
    message.setAttribute('role', 'status')
    message.textContent = String(i18n.global.t('common.favorite_folder_full'))
    document.body.append(message)
    const rect = label.getBoundingClientRect()
    message.style.position = 'fixed'
    message.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - message.offsetWidth - 8))}px`
    message.style.top = `${Math.max(8, rect.top - message.offsetHeight - 8)}px`
    messageTimer = setTimeout(clearMessage, 2000)
  }
  function guard(event: MouseEvent) {
    const target = event.target
    if (!(target instanceof Element))
      return
    const label = target.closest<HTMLElement>('.group-list > ul > li > label')
    if (!label)
      return
    refresh()
    const row = rows.get(label)
    // Checkbox click preactivation has already flipped checked. Label clicks
    // have not. preventDefault lets the browser undo the preactivation itself.
    if (row && !row.original && (target === row.input ? row.input.checked : !row.input.checked)) {
      event.preventDefault()
      event.stopPropagation()
      showFullMessage(label)
    }
  }
  dialog.addEventListener('click', guard, true)
  return {
    refresh,
    dispose() {
      dialog.removeEventListener('click', guard, true)
      clearRows()
    },
  }
}

/**
 * 创建清空已选按钮
 */
function createClearButton(container: Element): HTMLElement {
  const clearBtn = document.createElement('button')
  clearBtn.className = 'bewly-clear-selection-btn btn'
  clearBtn.type = 'button'
  clearBtn.textContent = String(i18n.global.t('common.clear_selection'))

  // 添加点击事件
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    clearAllSelections(container)
  })

  return clearBtn
}

/**
 * 清空所有选中的收藏夹
 */
function clearAllSelections(container: Element) {
  const checkboxes = container.querySelectorAll<HTMLInputElement>('.group-list ul li input[type="checkbox"]:checked')

  checkboxes.forEach((checkbox) => {
    // 模拟点击来取消选中，这样可以触发 Vue 的响应式更新
    checkbox.click()
  })
}

/**
 * 应用放大样式到收藏弹窗
 */
function applyEnlargedStyle(dialog: Element) {
  if (dialog.classList.contains('bewly-enlarged-favorite-dialog') !== settings.value.enlargeFavoriteDialog)
    dialog.classList.toggle('bewly-enlarged-favorite-dialog', settings.value.enlargeFavoriteDialog)
}

/**
 * 注入清空按钮到收藏弹窗
 */
function injectClearButton(dialog: Element) {
  // 检查是否已经注入过
  const existing = dialog.querySelector('.bewly-clear-selection-btn')
  if (existing) {
    const label = String(i18n.global.t('common.clear_selection'))
    if (existing.textContent !== label)
      existing.textContent = label
    return
  }

  // 找到底部按钮容器
  const bottomContainer = dialog.querySelector('.bottom')
  if (!bottomContainer) {
    return
  }

  // 创建清空按钮
  const clearBtn = createClearButton(dialog)

  // 找到确认按钮
  const submitBtn = bottomContainer.querySelector('.btn')
  if (submitBtn) {
    // 将清空按钮插入到确认按钮之前
    bottomContainer.insertBefore(clearBtn, submitBtn)
  }
  else {
    // 如果没有确认按钮，直接追加到容器开头
    bottomContainer.prepend(clearBtn)
  }
}

/**
 * 增强收藏弹窗
 */
function enhanceFavoriteDialog(dialog: Element) {
  currentGuard?.refresh()
  if (dialog.getClientRects().length === 0) {
    if (dialog.classList.contains('bewly-enlarged-favorite-dialog'))
      dialog.classList.remove('bewly-enlarged-favorite-dialog')
    dialog.querySelector('.bewly-clear-selection-btn')?.remove()
    return
  }
  // 应用放大样式
  applyEnlargedStyle(dialog)

  // 注入清空按钮
  injectClearButton(dialog)
}

/**
 * 初始化收藏弹窗增强功能
 * 监听 DOM 变化，当收藏弹窗出现时应用增强功能（清空按钮和放大样式）
 */
export function initFavoriteDialogEnhancement() {
  stopFavoriteDialogObservers()
  let startBootstrapObserver: () => void

  const bindDialog = (dialog: Element) => {
    if (!(dialog instanceof HTMLElement))
      return
    releaseCurrentDialog()
    bootstrapObserver?.disconnect()
    bootstrapObserver = null
    dialogObserver?.disconnect()
    portalObserver?.disconnect()
    currentDialog = dialog
    currentGuard = createFullFolderGuard(dialog)
    enhanceFavoriteDialog(dialog)
    dialogObserver = new MutationObserver(() => {
      if (currentDialog !== dialog)
        return
      if (enhanceTimer !== null)
        clearTimeout(enhanceTimer)
      enhanceTimer = window.setTimeout(() => {
        enhanceTimer = null
        if (currentDialog === dialog && dialog.isConnected)
          enhanceFavoriteDialog(dialog)
      }, 100)
    })
    dialogObserver.observe(dialog, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden'] })

    const portal = dialog.parentElement
    if (portal) {
      portalObserver = new MutationObserver(() => {
        if (currentDialog === dialog && !dialog.isConnected)
          startBootstrapObserver()
      })
      portalObserver.observe(portal, { childList: true })
    }
  }

  startBootstrapObserver = () => {
    releaseCurrentDialog()
    dialogObserver?.disconnect()
    portalObserver?.disconnect()
    dialogObserver = null
    portalObserver = null
    if (bootstrapObserver || !document.body)
      return

    bootstrapObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 检查新增的节点
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            // 检查是否是收藏弹窗或包含收藏弹窗
            const dialog = node.classList?.contains('collection-m-exp')
              ? node
              : node.querySelector?.('.collection-m-exp')

            if (dialog) {
              bindDialog(dialog)
              return
            }
          }
        }
      }
    })

    bootstrapObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  // 同时检查页面上是否已存在收藏弹窗
  const existingDialog = document.querySelector('.collection-m-exp')
  if (existingDialog)
    bindDialog(existingDialog)
  else
    startBootstrapObserver()
  stopSettingsWatch = watch([() => settings.value.enlargeFavoriteDialog, () => settings.value.language], () => {
    if (currentDialog)
      enhanceFavoriteDialog(currentDialog)
  }, { flush: 'post' })
}

function releaseCurrentDialog() {
  if (enhanceTimer !== null)
    clearTimeout(enhanceTimer)
  enhanceTimer = null
  currentGuard?.dispose()
  currentGuard = undefined
  currentDialog?.classList.remove('bewly-enlarged-favorite-dialog')
  currentDialog?.querySelector('.bewly-clear-selection-btn')?.remove()
  currentDialog = null
}

function stopFavoriteDialogObservers() {
  bootstrapObserver?.disconnect()
  dialogObserver?.disconnect()
  portalObserver?.disconnect()
  bootstrapObserver = null
  dialogObserver = null
  portalObserver = null
  stopSettingsWatch?.()
  stopSettingsWatch = undefined
  releaseCurrentDialog()
  if (enhanceTimer !== null) {
    clearTimeout(enhanceTimer)
    enhanceTimer = null
  }
}

/**
 * 停止收藏弹窗增强功能
 */
export function stopFavoriteDialogEnhancement() {
  stopFavoriteDialogObservers()

  // 移除所有已注入的按钮
  document.querySelectorAll('.bewly-clear-selection-btn').forEach(btn => btn.remove())
}
