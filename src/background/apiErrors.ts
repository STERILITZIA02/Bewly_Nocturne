export class ApiRiskControlError extends Error {
  constructor(message: string = '检测到风控页面，API返回了HTML而不是JSON') {
    super(message)
    this.name = 'ApiRiskControlError'
  }
}
