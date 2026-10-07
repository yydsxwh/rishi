export type DaysConfig = {
  host: string
  port: number
  dataDir: string
  allowedOrigins: string[]
  publicOrigin: string
  cookieSecure: boolean
  sessionSecret: string
  sessionTtlSec: number
  accountIssuer: string
  accountClientId: string
  accountClientSecret: string
  accountRedirectUri: string
  accountScopes: string
  wwwSessionUrl: string
  platformBaseUrl: string
  platformServiceToken: string
  platformClientId: string
  wwwOcrUrl: string
  nativeHandoffUri: string
  adminSubs: string[]
  configEncryptionKey: string
  accountDirectoryUrl: string
  accountResolveUrl: string
  accountInternalToken: string
  kkchatApiUrl: string
  kkchatServiceToken: string
  geoUpstream: string
  firebaseProjectId: string
  firebaseClientEmail: string
  firebasePrivateKey: string
}

function optionalUrl(value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'off') return ''
  return trimmed.replace(/\/+$/, '')
}

function splitList(value: string | undefined, fallback: string): string[] {
  return (value || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function requiredInProduction(name: string, value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (trimmed) return trimmed
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error(`BLOCKED: missing ${name}`)
  }
  return fallback
}

function publicOriginFrom(env: NodeJS.ProcessEnv): string {
  const trimmed = (env.RISHI_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '')
  if (trimmed) return trimmed
  if ((env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('BLOCKED: missing RISHI_PUBLIC_ORIGIN')
  }
  return 'http://127.0.0.1:5173'
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaysConfig {
  const publicOrigin = publicOriginFrom(env)
  const production = (env.NODE_ENV || '').toLowerCase() === 'production'
  const dataDir = env.DAYS_SYNC_DATA_DIR?.trim()
  if (!dataDir && production) throw new Error('BLOCKED: missing DAYS_SYNC_DATA_DIR')

  return {
    host: env.DAYS_SYNC_HOST || '127.0.0.1',
    port: Number(env.DAYS_SYNC_PORT || 3120),
    dataDir: dataDir || './data',
    allowedOrigins: splitList(
      env.DAYS_SYNC_ALLOWED_ORIGINS,
      `${publicOrigin},https://localhost,capacitor://localhost,http://localhost:5173,http://127.0.0.1:5173`,
    ),
    publicOrigin,
    cookieSecure: env.RISHI_COOKIE_SECURE ? env.RISHI_COOKIE_SECURE === '1' : publicOrigin.startsWith('https:'),
    sessionSecret: requiredInProduction('RISHI_SESSION_SECRET', env.RISHI_SESSION_SECRET, 'dev-only-rishi-session-secret'),
    sessionTtlSec: Number(env.RISHI_SESSION_TTL_SEC || 30 * 24 * 60 * 60),
    accountIssuer: (env.ACCOUNT_ISSUER || '').replace(/\/+$/, ''),
    accountClientId: env.ACCOUNT_CLIENT_ID || 'rishi',
    accountClientSecret: env.ACCOUNT_CLIENT_SECRET || '',
    accountRedirectUri: env.ACCOUNT_REDIRECT_URI || `${publicOrigin}/api/days/auth/callback`,
    accountScopes: env.ACCOUNT_SCOPES || 'openid profile email offline_access',
    // 未设置时按当前公网 origin 推导；留空或 off 时完全不访问旧主站会话。
    wwwSessionUrl: optionalUrl(env.DAYS_SYNC_SESSION_URL, `${publicOrigin}/api/auth/session`),
    platformBaseUrl: (env.PLATFORM_API_URL || env.PLATFORM_BASE_URL || '').replace(/\/+$/, ''),
    platformServiceToken: env.PLATFORM_SERVICE_TOKEN || '',
    platformClientId: env.PLATFORM_CLIENT_ID || 'rishi',
    // OCR 是可选的外部回退能力。不能默认指向本 BFF 的同一路由，否则会自调用直至失败。
    wwwOcrUrl: optionalUrl(env.DAYS_OCR_FALLBACK_URL, ''),
    nativeHandoffUri: env.RISHI_NATIVE_HANDOFF_URI || 'kemiao-days://auth',
    adminSubs: splitList(env.RISHI_ADMIN_SUBS, ''),
    configEncryptionKey: env.RISHI_CONFIG_ENCRYPTION_KEY || '',
    accountDirectoryUrl: optionalUrl(env.ACCOUNT_DIRECTORY_URL, env.ACCOUNT_ISSUER ? `${env.ACCOUNT_ISSUER.replace(/\/+$/, '')}/api/internal/directory/users` : ''),
    accountResolveUrl: optionalUrl(env.ACCOUNT_RESOLVE_URL, env.ACCOUNT_ISSUER ? `${env.ACCOUNT_ISSUER.replace(/\/+$/, '')}/api/internal/users/resolve-identifier` : ''),
    accountInternalToken: env.ACCOUNT_INTERNAL_TOKEN || '',
    kkchatApiUrl: optionalUrl(env.KKCHAT_API_URL, ''),
    kkchatServiceToken: env.KKCHAT_SERVICE_TOKEN || '',
    geoUpstream: optionalUrl(env.GEO_UPSTREAM_URL, 'https://www.yydsxwh.com'),
    firebaseProjectId: env.FIREBASE_PROJECT_ID || '',
    firebaseClientEmail: env.FIREBASE_CLIENT_EMAIL || '',
    firebasePrivateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }
}

export function fcmConfigured(config: DaysConfig): boolean {
  return Boolean(config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey)
}

export function oidcConfigured(config: DaysConfig): boolean {
  return Boolean(config.accountIssuer && config.accountClientId && config.accountClientSecret && config.accountRedirectUri)
}

export function platformConfigured(config: DaysConfig): boolean {
  return Boolean(config.platformBaseUrl && config.platformServiceToken)
}
