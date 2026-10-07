import type { DaysConfig } from './config'
import { PUSH_PROVIDERS, type PushHealth, type PushProviderId } from './push-domain'

export type PushCredentials = {
  huaweiAppId: string
  huaweiClientId: string
  huaweiClientSecret: string
  xiaomiAppSecret: string
  xiaomiPackageName: string
  oppoAppKey: string
  oppoMasterSecret: string
  vivoAppId: string
  vivoAppKey: string
  vivoAppSecret: string
  honorAppId: string
  honorClientId: string
  honorClientSecret: string
  apnsTeamId: string
  apnsKeyId: string
  apnsBundleId: string
  apnsPrivateKey: string
}

export function readPushCredentials(env: NodeJS.ProcessEnv = process.env): PushCredentials {
  return {
    huaweiAppId: text(env.HUAWEI_APP_ID),
    huaweiClientId: text(env.HUAWEI_CLIENT_ID),
    huaweiClientSecret: text(env.HUAWEI_CLIENT_SECRET),
    xiaomiAppSecret: text(env.XIAOMI_APP_SECRET),
    xiaomiPackageName: text(env.XIAOMI_RESTRICTED_PACKAGE) || 'com.yydsxwh.kemiao.days',
    oppoAppKey: text(env.OPPO_APP_KEY),
    oppoMasterSecret: text(env.OPPO_MASTER_SECRET),
    vivoAppId: text(env.VIVO_APP_ID),
    vivoAppKey: text(env.VIVO_APP_KEY),
    vivoAppSecret: text(env.VIVO_APP_SECRET),
    honorAppId: text(env.HONOR_APP_ID),
    honorClientId: text(env.HONOR_CLIENT_ID),
    honorClientSecret: text(env.HONOR_CLIENT_SECRET),
    apnsTeamId: text(env.APNS_TEAM_ID),
    apnsKeyId: text(env.APNS_KEY_ID),
    apnsBundleId: text(env.APNS_BUNDLE_ID),
    apnsPrivateKey: (env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }
}

const outcomes = new Map<string, 'ok' | 'fail'>()

export function rememberPushOutcome(provider: string, ok: boolean) {
  outcomes.set(provider, ok ? 'ok' : 'fail')
}

export function pushProviderHealth(config: DaysConfig, credentials = readPushCredentials()): Record<string, PushHealth> {
  const result = {} as Record<string, PushHealth>
  for (const provider of PUSH_PROVIDERS) {
    result[provider] = statusOf(provider, config, credentials)
  }
  return result
}

export function pushReady(health: Record<string, PushHealth>): boolean {
  return Object.values(health).some((item) => item === 'healthy' || item === 'configured' || item === 'degraded')
}

function statusOf(provider: PushProviderId, config: DaysConfig, credentials: PushCredentials): PushHealth {
  if (!configured(provider, config, credentials)) return 'not_configured'
  const last = outcomes.get(provider)
  if (last === 'ok') return 'healthy'
  if (last === 'fail') return 'degraded'
  return 'configured'
}

function configured(provider: PushProviderId, config: DaysConfig, credentials: PushCredentials): boolean {
  if (provider === 'fcm') return Boolean(config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey)
  if (provider === 'huawei') return Boolean(credentials.huaweiAppId && credentials.huaweiClientId && credentials.huaweiClientSecret)
  if (provider === 'xiaomi') return Boolean(credentials.xiaomiAppSecret)
  if (provider === 'oppo') return Boolean(credentials.oppoAppKey && credentials.oppoMasterSecret)
  if (provider === 'vivo') return Boolean(credentials.vivoAppId && credentials.vivoAppKey && credentials.vivoAppSecret)
  if (provider === 'honor') return Boolean(credentials.honorAppId && credentials.honorClientId && credentials.honorClientSecret)
  if (provider === 'apns') return Boolean(credentials.apnsTeamId && credentials.apnsKeyId && credentials.apnsBundleId && credentials.apnsPrivateKey)
  return false
}

function text(value: string | undefined): string {
  return (value || '').trim()
}
