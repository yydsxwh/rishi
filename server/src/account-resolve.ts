import { createHash } from 'node:crypto'
import type { DaysConfig } from './config'
import { randomToken } from './crypto'
import { cleanText, isAccountSub, RemoteAlarmDenied } from './remote-alarm-domain'
import { withLocationDb } from './location-store'

export type ResolvedAccount = {
  userSub: string
  displayName: string
  avatarUrl: string
  matchedBy: 'ACCOUNT' | 'KK_NUMBER' | 'EMAIL' | 'PHONE' | 'USER_SUB'
  maskedIdentifier: string
  accountName: string
  kkNumberMasked: string
}

const hits = new Map<string, number[]>()
const LIMIT = 10
const WINDOW_MS = 5 * 60 * 1000

export function resetResolveLimits(): void {
  hits.clear()
}

function allow(actorSub: string, now: number): boolean {
  const fresh = (hits.get(actorSub) || []).filter((at) => now - at < WINDOW_MS)
  if (fresh.length >= LIMIT) {
    hits.set(actorSub, fresh)
    return false
  }
  fresh.push(now)
  hits.set(actorSub, fresh)
  return true
}

function audit(config: DaysConfig, actorSub: string, outcome: string, matchedBy?: string, maskedIdentifier?: string) {
  return withLocationDb(config, (db) => {
    db.resolveAudit.push({
      id: `rs_${randomToken(8)}`,
      at: new Date().toISOString(),
      actorUserId: actorSub,
      outcome,
      matchedBy,
      maskedIdentifier,
    })
    if (db.resolveAudit.length > 500) db.resolveAudit.splice(0, db.resolveAudit.length - 500)
  })
}

export function resolveConfigured(config: DaysConfig): boolean {
  return Boolean(config.accountResolveUrl && config.accountInternalToken)
}

/** 登录用户发起的精确解析。未确认之前不要拿这个结果去创建授权。 */
export async function resolveAccountIdentifier(config: DaysConfig, actorSub: string, identifier: string, now = Date.now()): Promise<ResolvedAccount> {
  const text = cleanText(identifier, 120)
  if (!text) throw new RemoteAlarmDenied('ACCOUNT_NOT_FOUND', 404, '没有找到可授权的账号，请核对输入内容')
  if (!allow(actorSub, now)) {
    await audit(config, actorSub, 'rate_limited')
    throw new RemoteAlarmDenied('ACCOUNT_RATE_LIMITED', 429, '查询太频繁，请稍后再试')
  }
  if (!resolveConfigured(config)) {
    throw new RemoteAlarmDenied('ACCOUNT_RESOLVE_UNCONFIGURED', 503, '账号解析还没配置')
  }
  const response = await fetch(config.accountResolveUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.accountInternalToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ identifier: text }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!response) {
    await audit(config, actorSub, 'unavailable')
    throw new RemoteAlarmDenied('ACCOUNT_RESOLVE_UNAVAILABLE', 503, '暂时无法确认这个账号')
  }
  if (response.status === 429) {
    await audit(config, actorSub, 'rate_limited')
    throw new RemoteAlarmDenied('ACCOUNT_RATE_LIMITED', 429, '查询太频繁，请稍后再试')
  }
  if (!response.ok) {
    await audit(config, actorSub, 'not_found')
    throw new RemoteAlarmDenied('ACCOUNT_NOT_FOUND', 404, '没有找到可授权的账号，请核对输入内容')
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const userSub = typeof body?.userSub === 'string' ? body.userSub : ''
  if (!body || !isAccountSub(userSub) || userSub === actorSub) {
    await audit(config, actorSub, 'not_found')
    throw new RemoteAlarmDenied('ACCOUNT_NOT_FOUND', 404, '没有找到可授权的账号，请核对输入内容')
  }
  const matchedBy = body.matchedBy
  const resolved: ResolvedAccount = {
    userSub,
    displayName: cleanText(body.displayName, 40) || '用户',
    avatarUrl: cleanText(body.avatarUrl, 300),
    matchedBy: matchedBy === 'ACCOUNT' || matchedBy === 'KK_NUMBER' || matchedBy === 'EMAIL' || matchedBy === 'PHONE' || matchedBy === 'USER_SUB' ? matchedBy : 'USER_SUB',
    maskedIdentifier: cleanText(body.maskedIdentifier, 80),
    accountName: cleanText(body.accountName, 40),
    kkNumberMasked: cleanText(body.kkNumberMasked, 20),
  }
  await audit(config, actorSub, 'ok', resolved.matchedBy, resolved.maskedIdentifier)
  return resolved
}

/** 配置了账号中心时，授权对象必须是解析得到的 usr_。没配置时保留应急的直接填写。 */
export async function assertKnownAccount(config: DaysConfig, granteeUserId: string): Promise<void> {
  if (!resolveConfigured(config)) return
  const key = `grant:${createHash('sha256').update(granteeUserId).digest('hex').slice(0, 12)}`
  const resolved = await resolveAccountIdentifier(config, key, granteeUserId).catch((error: unknown) => {
    if (error instanceof RemoteAlarmDenied && error.code === 'ACCOUNT_RATE_LIMITED') throw error
    return null
  })
  if (!resolved || resolved.userSub !== granteeUserId) {
    throw new RemoteAlarmDenied('ACCOUNT_NOT_FOUND', 400, '请先确认账号后再授权')
  }
}
