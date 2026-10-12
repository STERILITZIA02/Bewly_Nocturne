import { resolveNativeSendState } from '~/utils/nativeSendState'

const labels = {
  'cmn-CN': { send: '发布评论', blocked: '此处暂不允许发表评论' },
  'cmn-TW': { send: '發佈評論', blocked: '此處暫不允許發佈評論' },
  'jyut': { send: '發佈評論', blocked: '呢度暫時唔可以發佈評論' },
  'en': { send: 'Post comment', blocked: 'Comments cannot be posted here' },
}
const roots = new WeakMap<ShadowRoot, { language?: string }>()

/**
 * Called from existing native Lit updates and the local editor's input event.
 * No observer, timer, click handler, or replacement of native business controls.
 */
export function updateCommentSendButton(root: ShadowRoot, language?: string) {
  let owner = roots.get(root)
  if (!owner) {
    owner = { language }
    roots.set(root, owner)
    const current = owner
    // The listener belongs to this shadow root and is collected with it; no
    // document-level listener retains detached comment editors.
    root.addEventListener('input', () => updateCommentSendButton(root, current.language))
  }
  owner.language = language
  const button = root.querySelector<HTMLButtonElement>('#pub button')
  if (!button)
    return
  const richInput = root.querySelector('bili-comment-rich-textarea')
  const editor = richInput?.shadowRoot?.querySelector<HTMLElement>('[contenteditable]')
    ?? root.querySelector<HTMLElement>('#editor [contenteditable], #editor textarea')
  const state = resolveNativeSendState({
    hasContent: Boolean((editor?.tagName === 'TEXTAREA' ? (editor as HTMLTextAreaElement).value : editor?.textContent)?.trim() || button.classList.contains('active')),
    inputDisabled: editor?.getAttribute('contenteditable') === 'false'
      || Boolean(editor?.matches(':disabled, [readonly], [aria-disabled="true"]') || richInput?.matches('[disabled], [aria-disabled="true"]')
        || root.querySelector('#editor')?.matches('[disabled], [aria-disabled="true"], [contenteditable="false"]')),
    buttonDisabled: button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('disabled'),
    busy: button.getAttribute('aria-busy') === 'true',
    buttonText: button.textContent ?? '',
    restrictionText: editor?.getAttribute('data-placeholder') ?? editor?.getAttribute('placeholder')
      ?? (!editor ? root.querySelector('#editor')?.textContent ?? '' : ''),
  })
  const copy = labels[language as keyof typeof labels] ?? labels['cmn-CN']
  if (!button.classList.contains('bew-send-button'))
    button.classList.add('bew-send-button')
  if (button.dataset.bewSendState !== state)
    button.dataset.bewSendState = state
  const label = state === 'blocked' ? copy.blocked : copy.send
  if (button.getAttribute('aria-label') !== label)
    button.setAttribute('aria-label', label)
  if (button.title !== label)
    button.title = label
}
