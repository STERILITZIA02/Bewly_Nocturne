export enum MenuType {
  General = 'General',
  BewlyPages = 'BewlyPages',
  BewlyComponents = 'BewlyComponents',
  Bilibili = 'Bilibili',
  Appearance = 'Appearance',
  About = 'About',
}

export interface MenuItem {
  value: MenuType
  icon: string
  iconActivated: string
  titleKey: string
  badge?: string
  sectionStart?: boolean
}
