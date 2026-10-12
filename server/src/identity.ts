import type { IncomingMessage } from 'node:http'
import type { DaysConfig } from './config'
import { bearerToken, readCookies } from './http'
import { isSessionRevoked, readSessionToken, sessionFromRequest } from './session'
import { sessionForWebTab } from './tab-device'
import { markLegacyChecked, readUser } from './users'

export type Caller = {
  key: string
  sub: string
  name: string
  email: string
  avatarUrl: string
  source: 'rishi' | 'www'
  legacyId: string | null
}

/**
 * 旧主站会话只用于一次性迁移。主站挂了不能拖住已经持有 rishi_session 的请求。
 * 1.5s 是「还能等一下迁移」的上限，不是同步接口的预算。
 */
const WWW_SESSION_TIMEOUT_MS = 1_500
const WWW_CACHE_TTL_MS = 10_000
/** 主站探活失败后，同一用户短时间内不再打主站，避免每次同步都空等超时。 */
const WWW_FAILURE_COOLDOWN_MS = 60_000

const wwwCache = new Map<string, { user: Caller | null; expires: number }>()
const wwwFailureUntil = new Map<string, number>()

async function resolveWwwUser(config: DaysConfig, cookie: string | undefined): Promise<Caller | null> {
  if (!cookie || !config.wwwSessionUrl) return null
  const { createHash } = await import('node:crypto')
  const key = createHash('sha256').update(cookie).digest('hex')
  const cached = wwwCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.user
  let response: Response
  try {
    response = await fetch(config.wwwSessionUrl, {
      headers: { cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(WWW_SESSION_TIMEOUT_MS),
    })
  } catch {
    throw new Error('SESSION_UNAVAILABLE')
  }
  if (!response.ok) throw new Error('SESSION_UNAVAILABLE')
  const body = (await response.json().catch(() => ({}))) as { user?: { id?: string; name?: string; avatarUrl?: string } | null }
  const user = body.user?.id
    ? {
        key: String(body.user.id),
        sub: String(body.user.id),
        name: body.user.name || '我',
        email: '',
        avatarUrl: body.user.avatarUrl || '',
        source: 'www' as const,
        legacyId: String(body.user.id),
      }
    : null
  wwwCache.set(key, { user, expires: Date.now() + WWW_CACHE_TTL_MS })
  if (wwwCache.size > 500) wwwCache.clear()
  return user
}

/**
 * 已登录日事的用户，身份以本地 session 为准。
 * 问主站只是为了把旧 userId 的云端文件迁一次；问失败、主站宕机，都不影响本次请求。
 */
async function legacyIdForRishiSession(
  config: DaysConfig,
  sub: string,
  cookie: string | undefined,
): Promise<string | null> {
  const user = await readUser(config, sub)
  if (user?.legacyCheckedAt || user?.migratedAt) return user.legacyUserIds[0] ?? null
  const cooled = wwwFailureUntil.get(sub) ?? 0
  if (cooled > Date.now()) return null
  if (!cookie || !config.wwwSessionUrl) return null
  try {
    const www = await resolveWwwUser(config, cookie)
    wwwFailureUntil.delete(sub)
    const legacyId = www?.legacyId ?? null
    await markLegacyChecked(config, sub, legacyId)
    return legacyId
  } catch {
    wwwFailureUntil.set(sub, Date.now() + WWW_FAILURE_COOLDOWN_MS)
    return null
  }
}

export async function resolveCaller(req: IncomingMessage, config: DaysConfig): Promise<Caller | null> {
  const bearer = readSessionToken(bearerToken(req), config)
  if (bearer) {
    if (await isSessionRevoked(config, bearer.sid)) return null
    const legacyId = await legacyIdForRishiSession(config, bearer.sub, req.headers.cookie)
    return {
      key: bearer.sub,
      sub: bearer.sub,
      name: bearer.name,
      email: bearer.email,
      avatarUrl: bearer.avatarUrl,
      source: 'rishi',
      legacyId,
    }
  }
  const tabbed = await sessionForWebTab(req, config)
  if (tabbed === 'ambiguous') return null
  const session = tabbed || sessionFromRequest(req, config)
  if (session) {
    if (await isSessionRevoked(config, session.sid)) return null
    const legacyId = await legacyIdForRishiSession(config, session.sub, req.headers.cookie)
    return {
      key: session.sub,
      sub: session.sub,
      name: session.name,
      email: session.email,
      avatarUrl: session.avatarUrl,
      source: 'rishi',
      legacyId,
    }
  }
  return resolveWwwUser(config, req.headers.cookie)
}

export function cookieHeaderValue(req: IncomingMessage): string | undefined {
  return req.headers.cookie
}

export { readCookies }
