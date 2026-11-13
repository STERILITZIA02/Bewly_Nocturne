export const BILIBILI_LOGIN_URL = 'https://passport.bilibili.com/login'

export function jumpToLoginPage() {
  location.href = BILIBILI_LOGIN_URL
}
