import { daysFetch } from './days-api'

export type AlarmGrantScope = 'TIME_RANGE' | 'PERMANENT' | 'ENTITY_BOUND'

export type RemoteGrant = {
  id: string
  ownerUserId: string
  ownerName?: string
  granteeUserId: string
  granteeName?: string
  scope: AlarmGrantScope
  status: string
  validFrom?: string
  validUntil?: string
  entityType?: string
  entityId?: string
  entityTitle?: string
  entityStartsAt?: string
  entityEndsAt?: string
  canCreate?: boolean
  blockReason?: string | null
}

export type RemoteAlarmRecord = {
  id: string
  ownerUserId: string
  creatorName?: string
  title: string
  note?: string
  triggerAt: string
  timezone: string
  status: string
  entityTitle?: string
  deviceReady?: boolean
  acceptance?: string
}

/** 只有手机回执之后才说「已设置」。服务端创建成功一律是已发送。 */
export function remoteAlarmStatusText(status: string, deviceReady = false): string {
  if (deviceReady && status === 'FIRED') return '已响铃'
  if (deviceReady || status === 'DEVICE_SCHEDULED') return '对方手机已成功设置闹钟'
  if (status === 'MISSED') return '错过了，没有补响'
  if (status === 'CANCELLED') return '已取消'
  if (status === 'FAILED') return '手机没能登记闹钟'
  if (status === 'EXPIRED') return '授权已失效'
  return '已发送，等待对方手机注册闹钟'
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!response.ok) {
    const error = new Error(body.message || body.error || '请求失败')
    ;(error as Error & { code?: string }).code = body.error
    throw error
  }
  return body
}

export function loadWake() {
  return Promise.all([
    daysFetch('/api/days/remote-alarm/grants').then((response) => parse<{ given: RemoteGrant[]; received: RemoteGrant[] }>(response)),
    daysFetch('/api/days/remote-alarm/allowed-targets').then((response) => parse<{ targets: RemoteGrant[] }>(response)),
    daysFetch('/api/days/remote-alarm/alarms').then((response) => parse<{ alarms: RemoteAlarmRecord[] }>(response)),
    daysFetch('/api/days/remote-alarm/settings').then((response) => parse<{ settings: { pausedAll: boolean; maxPerHour: number; maxPerDay: number; allowNight: boolean } }>(response)),
    daysFetch('/api/days/remote-alarm/audit').then((response) => parse<{ events: { id: string; at: string; summary: string }[] }>(response)),
  ])
}

export function postJson(path: string, method: string, body: unknown) {
  return daysFetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((response) => parse<Record<string, unknown>>(response))
}
