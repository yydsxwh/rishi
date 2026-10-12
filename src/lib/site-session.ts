import type { UserSub } from '@yydsxwh/shared/auth/identity'
import { daysApiUrl, daysFetch } from './days-api'
import { configuredAccountUrl } from './public-env'

/**
 * 日事自己的会话。Web 用 HttpOnly Cookie，Android 用一次性 handoff 换到的
 * rishi session token。身份键永远是账号中心 OIDC `sub`。
 */
export type SiteUser = {
  id: UserSub
  sub: UserSub
  name: string
  avatarUrl: string
  email?: string
}

export function accountCenterUrl(): string {
  return configuredAccountUrl()
}

/** @deprecated 使用 accountCenterUrl()。空字符串表示这次构建没有配置账号中心地址。 */
export const ACCOUNT_CENTER_URL = accountCenterUrl()

export async function fetchSiteUser(signal?: AbortSignal): Promise<SiteUser | null> {
  const response = await daysFetch('/api/days/auth/session', { signal })
  if (!response.ok) throw new Error(`SESSION_${response.status}`)
  const body = (await response.json()) as { user?: SiteUser | null }
  if (!body.user?.id && !body.user?.sub) return null
  const sub = body.user.sub || body.user.id
  try {
    sessionStorage.setItem("yyds.days.sub", sub)
  } catch {
    // 隐私模式写不进 sessionStorage 时，本地数据仍留在未分区的键上
  }
  return {
    id: sub,
    sub,
    name: body.user.name || '我',
    avatarUrl: body.user.avatarUrl || '',
    email: body.user.email || '',
  }
}

export function loginUrl(): string {
  const back = typeof window === 'undefined' ? '/products/days/' : window.location.href
  return daysApiUrl(`/api/days/auth/login?returnTo=${encodeURIComponent(back)}`)
}

export function logoutUrl(): string {
  const back = typeof window === 'undefined' ? '/products/days/' : window.location.href
  return daysApiUrl(`/api/days/auth/logout?returnTo=${encodeURIComponent(back)}`)
}

export function avatarInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? [...trimmed][0].toUpperCase() : '我'
}
