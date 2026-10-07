/** 推送通道选择。业务只认结果，不直接叫某一家 SDK。 */

export const PUSH_PROVIDERS = ['huawei', 'xiaomi', 'oppo', 'vivo', 'honor', 'fcm', 'apns'] as const
export type PushProviderId = (typeof PUSH_PROVIDERS)[number] | 'none'
export type PushHealth = 'healthy' | 'configured' | 'degraded' | 'unavailable' | 'not_configured'
export type PushRegion = 'cn' | 'global' | 'unknown'

const VENDORS: PushProviderId[] = ['huawei', 'xiaomi', 'oppo', 'vivo', 'honor']

export function isPushProvider(value: string): value is PushProviderId {
  return value === 'none' || (PUSH_PROVIDERS as readonly string[]).includes(value)
}

/**
 * 以这台设备实际拿到的 token 为准。
 * 大陆优先厂商通道，海外且有 GMS 时优先 FCM。没有 token 的通道不能被选中。
 */
export function choosePushProvider(input: {
  platform: string
  region: PushRegion
  gms: boolean
  tokens: Partial<Record<string, string>>
}): PushProviderId {
  const has = (id: PushProviderId) => Boolean(input.tokens[id])
  if (input.platform === 'ios') return has('apns') ? 'apns' : 'none'
  if (input.platform !== 'android') return 'none'
  const vendor = VENDORS.find((id) => has(id))
  const fcm = input.gms && has('fcm')
  if (input.region === 'global') {
    if (fcm) return 'fcm'
    return vendor || 'none'
  }
  if (vendor) return vendor
  if (fcm) return 'fcm'
  return 'none'
}

export function fallbackOrder(chosen: PushProviderId, tokens: Partial<Record<string, string>>): PushProviderId[] {
  const rest = PUSH_PROVIDERS.filter((id) => id !== chosen && tokens[id])
  return chosen === 'none' ? rest : [chosen, ...rest]
}
