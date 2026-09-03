export interface MomentTextSources {
  archiveText: string
  articleText: string
  commonText: string
  dynamicText: string
  isVideo: boolean
  opusText: string
}

function pickText(...values: string[]) {
  return values.find(value => value.trim())?.trim() ?? ''
}

export function resolveMomentTextSources(sources: MomentTextSources) {
  const selfText = sources.isVideo
    ? pickText(sources.opusText, sources.commonText)
    : pickText(
        sources.opusText,
        sources.dynamicText,
        sources.archiveText,
        sources.articleText,
        sources.commonText,
      )
  const inheritedText = sources.isVideo
    ? pickText(sources.dynamicText, sources.archiveText, sources.articleText)
    : ''

  return {
    descInherited: sources.isVideo && !selfText && Boolean(inheritedText),
    inheritedText,
    selfText,
    text: pickText(selfText, inheritedText),
  }
}

export function isMomentDescriptionOverflowing(
  element: Pick<HTMLElement, 'clientHeight' | 'scrollHeight'>,
) {
  return element.scrollHeight > element.clientHeight + 1
}
