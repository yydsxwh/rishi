import type { DaysConfig } from './config'
import { isAccountSub } from './remote-alarm-domain'

export type DirectContact = {
  sub: string
  displayName: string
  avatarUrl: string
  kkNumber: number | null
  username: string | null
}

/** KKChat 最近私聊只是快捷选择。不是好友，也不决定能不能授权。 */
export async function listDirectContacts(config: DaysConfig, accountSub: string): Promise<{ contacts: DirectContact[]; source: 'ok' | 'unconfigured' | 'unavailable' }> {
  if (!config.kkchatApiUrl || !config.kkchatServiceToken) return { contacts: [], source: 'unconfigured' }
  if (!isAccountSub(accountSub)) return { contacts: [], source: 'unavailable' }
  try {
    const url = new URL(`${config.kkchatApiUrl}/api/service/contacts`)
    url.searchParams.set('accountSub', accountSub)
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${config.kkchatServiceToken}`,
        'x-kkchat-product': 'rishi',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return { contacts: [], source: 'unavailable' }
    const body = (await response.json().catch(() => ({}))) as { contacts?: unknown }
    if (!Array.isArray(body.contacts)) return { contacts: [], source: 'ok' }
    const contacts: DirectContact[] = []
    for (const raw of body.contacts) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      const sub = typeof row.sub === 'string' ? row.sub : ''
      if (!isAccountSub(sub) || sub === accountSub) continue
      contacts.push({
        sub,
        displayName: typeof row.displayName === 'string' ? row.displayName.slice(0, 40) : '用户',
        avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl.slice(0, 300) : '',
        kkNumber: typeof row.kkNumber === 'number' ? row.kkNumber : null,
        username: typeof row.username === 'string' ? row.username.slice(0, 40) : null,
      })
    }
    return { contacts, source: 'ok' }
  } catch {
    return { contacts: [], source: 'unavailable' }
  }
}
