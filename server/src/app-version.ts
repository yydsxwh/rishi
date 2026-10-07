import type { DaysConfig } from './config'

export type AppVersionInfo = {
  platform: 'android' | 'ios'
  latestVersionName: string
  latestVersionCode: number
  minSupportedVersionCode: number
  forceUpdate: boolean
  downloadUrl: string
  releaseNotes: string
  publishedAt: string
}

/** 版本以环境变量为准。接口失败时客户端继续使用，不会把所有人锁在外面。 */
export function androidVersion(config: DaysConfig, env: NodeJS.ProcessEnv = process.env): AppVersionInfo {
  const code = positive(env.DAYS_ANDROID_VERSION_CODE, 20)
  const min = positive(env.DAYS_ANDROID_MIN_VERSION_CODE, 0)
  return {
    platform: 'android',
    latestVersionName: (env.DAYS_ANDROID_VERSION_NAME || '2.6.0').trim(),
    latestVersionCode: code,
    minSupportedVersionCode: Math.min(min, code),
    forceUpdate: env.DAYS_ANDROID_FORCE_UPDATE === '1' && min > 0,
    downloadUrl: (env.DAYS_ANDROID_DOWNLOAD_URL || `${config.publicOrigin}/products/days/kemiao-days.apk`).trim(),
    releaseNotes: (env.DAYS_ANDROID_RELEASE_NOTES || '个人中心、设置、检查更新，以及可切换的推送通道。没有配置厂商推送时仍可使用。').trim(),
    publishedAt: (env.DAYS_ANDROID_PUBLISHED_AT || '').trim(),
  }
}

export function iosVersion(): AppVersionInfo {
  return {
    platform: 'ios',
    latestVersionName: '',
    latestVersionCode: 0,
    minSupportedVersionCode: 0,
    forceUpdate: false,
    downloadUrl: '',
    releaseNotes: 'iPhone 正式包尚未发布。',
    publishedAt: '',
  }
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}
