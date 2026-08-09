/**
 * 收藏弹窗增强工具函数
 * 用于在B站收藏弹窗添加清空已选按钮和放大样式
 */

import { settings } from '~/logic'

let bootstrapObserver: MutationObserver | null = null
let dialogObserver: MutationObserver | null = null
let portalObserver: MutationObserver | null = null
let enhanceTimer: number | null = null

/**
 * 创建清空已选按钮
 */
function createClearButton(container: Element): HTMLElement {
  const clearBtn = document.createElement('button')
  clearBtn.className = 'bewly-clear-selection-btn btn'
  clearBtn.textContent = '清空已选'

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
  if (settings.value.enlargeFavoriteDialog) {
    dialog.classList.add('bewly-enlarged-favorite-dialog')
  }
  else {
    dialog.classList.remove('bewly-enlarged-favorite-dialog')
  }
}

/**
 * 注入清空按钮到收藏弹窗
 */
function injectClearButton(dialog: Element) {
  // 检查是否已经注入过
  if (dialog.querySelector('.bewly-clear-selection-btn')) {
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
    bootstrapObserver?.disconnect()
    bootstrapObserver = null
    dialogObserver?.disconnect()
    portalObserver?.disconnect()

    enhanceFavoriteDialog(dialog)
    dialogObserver = new MutationObserver(() => {
      if (enhanceTimer !== null)
        clearTimeout(enhanceTimer)
      enhanceTimer = window.setTimeout(() => {
        enhanceTimer = null
        enhanceFavoriteDialog(dialog)
      }, 100)
    })
    dialogObserver.observe(dialog, { childList: true, subtree: true })

    const portal = dialog.parentElement
    if (portal) {
      portalObserver = new MutationObserver(() => {
        if (!dialog.isConnected)
          startBootstrapObserver()
      })
      portalObserver.observe(portal, { childList: true })
    }
  }

  startBootstrapObserver = () => {
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
}

function stopFavoriteDialogObservers() {
  bootstrapObserver?.disconnect()
  dialogObserver?.disconnect()
  portalObserver?.disconnect()
  bootstrapObserver = null
  dialogObserver = null
  portalObserver = null
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
