export function isFestivalPage(url = document.URL): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(url)
}
