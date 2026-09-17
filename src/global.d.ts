declare const __DEV__: boolean
declare const __BUILD_COMMIT__: string
declare const __BEWLY_BUILD_ID__: string

declare module '*.vue' {
  const component: any
  export default component
}
