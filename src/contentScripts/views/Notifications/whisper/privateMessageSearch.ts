import type { ParsedPrivateMessageContent } from './privateMessageRenderers'

export function privateMessageSearchText(content: ParsedPrivateMessageContent): string {
  switch (content.type) {
    case 'text': return `${content.segments.map(segment => segment.text).join('')} ${content.segments.flatMap(segment => segment.type === 'link' ? [segment.href] : []).join(' ')}`
    case 'notification': return [content.title, content.text, ...content.modules.flatMap(item => [item.title, item.detail]), ...content.links.flatMap(item => [item.text, item.href])].join(' ')
    case 'share-v2': return [content.title, content.headline, content.author, content.href].join(' ')
    case 'video-card': return [content.title, content.attachMessage, content.href].join(' ')
    case 'article-card': return [content.title, content.summary, content.href].join(' ')
    case 'common-share-card': return [content.title, content.author, content.href].join(' ')
    case 'text-share': return [content.title, content.text, content.href].join(' ')
    case 'business-card': return [content.title, ...content.cards.flatMap(item => [...item.fields, item.href])].join(' ')
    case 'tip': return content.lines.join(' ')
    default: return ''
  }
}
