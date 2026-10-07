import { daysFetch } from './days-api'
import { postJson } from './remote-alarm'

export type LocationViewStatus = 'live' | 'last_known' | 'stale' | 'unavailable' | 'offline' | 'permission_off'

export type TrustedAccount = {
  userSub: string
  displayName: string
  avatarUrl: string
  matchedBy: string
  maskedIdentifier: string
  accountName: string
  kkNumberMasked: string
}

export type LocationGrantRecord = {
  id: string
  ownerUserId: string
  ownerName?: string
  granteeUserId: string
  granteeName?: string
  scope: string
  status: string
  validFrom?: string
  validUntil?: string
  entityTitle?: string
  mode: 'LAST_KNOWN' | 'LIVE'
  precision: 'APPROXIMATE' | 'PRECISE'
}

export type LocationView = {
  status: LocationViewStatus
  statusLabel: string
  latitude?: number
  longitude?: number
  accuracyMeters?: number
  capturedAt?: string
  mode?: string
  precision?: string
  advice?: string
  source?: string
}

export function locationStatusText(status: string): string {
  if (status === 'live') return '实时'
  if (status === 'last_known') return '最近位置'
  if (status === 'stale') return '位置已过期'
  if (status === 'offline') return '手机离线'
  if (status === 'permission_off') return '定位权限关闭'
  return '不可用'
}

export async function resolveAccount(identifier: string): Promise<TrustedAccount> {
  const body = await postJson('/api/days/account/resolve', 'POST', { identifier })
  return body.account as TrustedAccount
}

export async function loadContacts(): Promise<{ contacts: { sub: string; displayName: string; username: string | null; kkNumber: number | null }[]; source: string }> {
  const response = await daysFetch('/api/days/contacts/kkchat')
  const body = (await response.json().catch(() => ({}))) as { contacts?: { sub: string; displayName: string; username: string | null; kkNumber: number | null }[]; source?: string; message?: string }
  if (!response.ok) throw new Error(body.message || '暂时无法读取最近联系人')
  return { contacts: body.contacts || [], source: body.source || 'ok' }
}

export async function loadLocation() {
  const [grants, audit, status] = await Promise.all([
    daysFetch('/api/days/location/grants').then((response) => response.json()) as Promise<{ given: LocationGrantRecord[]; received: LocationGrantRecord[] }>,
    daysFetch('/api/days/location/audit').then((response) => response.json()) as Promise<{ events: { id: string; at: string; summary: string }[] }>,
    daysFetch('/api/days/location/status').then((response) => response.json()) as Promise<{ pausedAll: boolean; liveRequired: boolean }>,
  ])
  return { grants, audit: audit.events || [], status }
}

export function publishLocation(input: { latitude: number; longitude: number; accuracyMeters?: number; capturedAt: string; source: string }) {
  return postJson('/api/days/location/snapshot', 'PUT', input)
}

export async function readFriendLocation(ownerUserId: string): Promise<LocationView> {
  const response = await daysFetch(`/api/days/location/people/${encodeURIComponent(ownerUserId)}`)
  const body = (await response.json().catch(() => ({}))) as { location?: LocationView; message?: string }
  if (!response.ok || !body.location) throw new Error(body.message || '现在看不到这个位置')
  return body.location
}
