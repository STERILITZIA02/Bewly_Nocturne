let channelId: string | undefined

export function setPageBridgeChannelId(value: string): boolean {
  if (channelId)
    return channelId === value

  channelId = value
  return true
}

export function getPageBridgeChannelId(): string | undefined {
  return channelId
}
