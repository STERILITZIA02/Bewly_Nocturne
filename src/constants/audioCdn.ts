// DASH URL validation, host permissions and the listening tab's network rules
// must agree on which CDN hosts serve media.
export const AUDIO_CDN_HOSTS = ['*.bilivideo.com', '*.bilivideo.cn', '*.bilivideo.net', '*.hdslb.com', 'upos-hz-mirrorakam.akamaized.net']
export const AUDIO_CDN_DOMAINS = AUDIO_CDN_HOSTS.map(host => host.replace(/^\*\./, ''))

export function isAudioCdnHost(hostname: string) {
  return AUDIO_CDN_HOSTS.some((host, index) => hostname === AUDIO_CDN_DOMAINS[index]
    || (host.startsWith('*.') && hostname.endsWith(host.slice(1))))
}
