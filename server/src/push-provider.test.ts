import assert from 'node:assert/strict'
import test from 'node:test'
import { androidVersion } from './app-version'
import { loadConfig } from './config'
import { choosePushProvider, fallbackOrder } from './push-domain'
import { pushProviderHealth } from './push-config'

test('大陆有厂商 token 时不改走 FCM', () => {
  assert.equal(choosePushProvider({
    platform: 'android',
    region: 'cn',
    gms: true,
    tokens: { xiaomi: 'x', fcm: 'f' },
  }), 'xiaomi')
})

test('大陆没有厂商 token 时才用 FCM', () => {
  assert.equal(choosePushProvider({
    platform: 'android',
    region: 'cn',
    gms: true,
    tokens: { fcm: 'f' },
  }), 'fcm')
})

test('海外有 GMS 时优先 FCM', () => {
  assert.equal(choosePushProvider({
    platform: 'android',
    region: 'global',
    gms: true,
    tokens: { huawei: 'h', fcm: 'f' },
  }), 'fcm')
})

test('没有 token 时不假装有通道', () => {
  assert.equal(choosePushProvider({ platform: 'android', region: 'cn', gms: false, tokens: {} }), 'none')
  assert.equal(choosePushProvider({ platform: 'ios', region: 'global', gms: false, tokens: {} }), 'none')
  assert.equal(choosePushProvider({ platform: 'ios', region: 'global', gms: false, tokens: { apns: 'a' } }), 'apns')
})

test('回退只包含真正有 token 的通道', () => {
  assert.deepEqual(fallbackOrder('xiaomi', { xiaomi: 'x', fcm: 'f' }), ['xiaomi', 'fcm'])
})

test('未配置的推送通道显示 not_configured', () => {
  const config = loadConfig({
    DAYS_SYNC_DATA_DIR: '/tmp/rishi-push',
    RISHI_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
    RISHI_SESSION_SECRET: 'test-secret-test-secret-test-secret',
    FIREBASE_PROJECT_ID: '',
  })
  const health = pushProviderHealth(config, {
    huaweiAppId: '',
    huaweiClientId: '',
    huaweiClientSecret: '',
    xiaomiAppSecret: '',
    xiaomiPackageName: 'com.yydsxwh.kemiao.days',
    oppoAppKey: '',
    oppoMasterSecret: '',
    vivoAppId: '',
    vivoAppKey: '',
    vivoAppSecret: '',
    honorAppId: '',
    honorClientId: '',
    honorClientSecret: '',
    apnsTeamId: '',
    apnsKeyId: '',
    apnsBundleId: '',
    apnsPrivateKey: '',
  })
  assert.equal(health.fcm, 'not_configured')
  assert.equal(health.huawei, 'not_configured')
  assert.equal(health.apns, 'not_configured')
})

test('版本接口缺省不会把最低版本抬到最新版', () => {
  const config = loadConfig({
    DAYS_SYNC_DATA_DIR: '/tmp/rishi-push',
    RISHI_PUBLIC_ORIGIN: 'https://www.yydsxwh.com',
    RISHI_SESSION_SECRET: 'test-secret-test-secret-test-secret',
  })
  const version = androidVersion(config, {})
  assert.equal(version.latestVersionCode, 26)
  assert.equal(version.latestVersionName, '2.6.6')
  assert.equal(version.minSupportedVersionCode, 0)
  assert.equal(version.forceUpdate, false)
  assert.equal(version.downloadUrl, 'https://www.yydsxwh.com/products/days/kemiao-days.apk')
})
