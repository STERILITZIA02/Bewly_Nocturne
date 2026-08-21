import { AppPage } from '~/enums/appEnums'

export interface DockPageItem {
  page: AppPage
}

export function resolveActiveDockItemPage(
  items: readonly DockPageItem[],
  activatedPage: AppPage,
  useIntegratedSearch: boolean,
  onHomePage: boolean,
): AppPage | undefined {
  if (!onHomePage)
    return undefined

  const activePage = activatedPage === AppPage.SearchResults
    ? useIntegratedSearch ? AppPage.Home : AppPage.Search
    : activatedPage

  return items.some(item => item.page === activePage) ? activePage : undefined
}
