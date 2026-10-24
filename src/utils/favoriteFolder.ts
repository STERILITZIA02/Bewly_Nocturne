interface FavoriteFolderAttr {
  attr: number
}

export function isFavoriteFolderPrivate(folder: FavoriteFolderAttr): boolean {
  return (folder.attr & 1) === 1
}

export function getFavoriteFolderEditedAttr(attr: number, isPublic: boolean): number {
  return isPublic ? attr & ~1 : attr | 1
}
