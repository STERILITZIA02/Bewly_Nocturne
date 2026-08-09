function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function getIframeMessageData(
  event: MessageEvent,
  iframe: Pick<HTMLIFrameElement, 'contentWindow'> | null | undefined,
): Record<string, unknown> | undefined {
  if (event.source !== iframe?.contentWindow || !isRecord(event.data))
    return undefined
  return event.data
}
