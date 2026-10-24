export interface BundleLicensePackage {
  id: string
  name: string
  version: string | null
  license: string | null
  files: { name: string, asset: string }[]
  outputs: string[]
  issues: string[]
}

export interface BundleLicenseReport {
  schema: 1
  entry: string
  outputs: { file: string, hash: string }[]
  packages: BundleLicensePackage[]
  issues: string[]
}

export interface BundleLicenseIndex {
  schema: 1
  project: string | null
  entries: { entry: string, asset: string }[]
}
