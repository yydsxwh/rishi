import type { DeviceCapabilities, DevicePlatform, NativeAlarmSupport, PermissionLevel, UserDevice } from './remote-alarm-store'

export type PublicDeviceStatus = {
  platform: DevicePlatform | 'unknown'
  lastSeenAt?: string
  remoteAlarm: {
    supported: boolean
    exactAlarmPermission: PermissionLevel
    notificationPermission: PermissionLevel
    batteryRestricted: boolean
  }
  location: {
    foregroundPermission: PermissionLevel
    backgroundPermission: PermissionLevel
    precise: boolean
    sharingEnabled: boolean
  }
  push: { ready: boolean }
  nativeAlarm: NativeAlarmSupport
}

const EMPTY: PublicDeviceStatus = {
  platform: 'unknown',
  remoteAlarm: { supported: false, exactAlarmPermission: 'unknown', notificationPermission: 'unknown', batteryRestricted: false },
  location: { foregroundPermission: 'unknown', backgroundPermission: 'unknown', precise: false, sharingEnabled: false },
  push: { ready: false },
  nativeAlarm: 'NOT_APPLICABLE',
}

/** 好友可见的能力。不带厂商、型号、系统版本和推送 token。 */
export function publicDeviceStatus(devices: UserDevice[]): PublicDeviceStatus {
  const device = devices
    .filter((item) => item.enabled)
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))[0]
  if (!device) return EMPTY
  const caps = device.capabilities
  return {
    platform: device.platform,
    lastSeenAt: device.lastSeenAt,
    remoteAlarm: {
      supported: Boolean(caps?.remoteAlarm.supported) && device.platform === 'android',
      exactAlarmPermission: caps?.remoteAlarm.exactAlarmPermission || 'unknown',
      notificationPermission: caps?.remoteAlarm.notificationPermission || 'unknown',
      batteryRestricted: Boolean(caps?.remoteAlarm.batteryRestricted),
    },
    location: {
      foregroundPermission: caps?.location.foregroundPermission || 'unknown',
      backgroundPermission: caps?.location.backgroundPermission || 'unknown',
      precise: Boolean(caps?.location.precise),
      sharingEnabled: Boolean(caps?.location.sharingEnabled),
    },
    push: { ready: Boolean(caps?.push.ready && device.pushToken) },
    nativeAlarm: device.platform === 'ios' ? 'NOT_VERIFIED' : caps?.nativeAlarm || (device.platform === 'android' ? 'SUPPORTED' : 'UNSUPPORTED'),
  }
}

export function normalizeCapabilities(platform: DevicePlatform, input: unknown): DeviceCapabilities {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const remote = raw.remoteAlarm && typeof raw.remoteAlarm === 'object' ? (raw.remoteAlarm as Record<string, unknown>) : {}
  const location = raw.location && typeof raw.location === 'object' ? (raw.location as Record<string, unknown>) : {}
  const push = raw.push && typeof raw.push === 'object' ? (raw.push as Record<string, unknown>) : {}
  const level = (value: unknown): PermissionLevel => (value === 'granted' || value === 'denied' ? value : 'unknown')
  return {
    osVersion: text(raw.osVersion, 40),
    manufacturer: text(raw.manufacturer, 40),
    model: text(raw.model, 40),
    remoteAlarm: {
      supported: platform === 'android',
      exactAlarmPermission: level(remote.exactAlarmPermission),
      notificationPermission: level(remote.notificationPermission),
      batteryRestricted: Boolean(remote.batteryRestricted),
      lastScheduledAt: text(remote.lastScheduledAt, 40) || undefined,
    },
    location: {
      foregroundPermission: level(location.foregroundPermission),
      backgroundPermission: level(location.backgroundPermission),
      precise: Boolean(location.precise),
      sharingEnabled: Boolean(location.sharingEnabled),
      lastLocationAt: text(location.lastLocationAt, 40) || undefined,
    },
    push: {
      ready: platform === 'web' ? false : Boolean(push.ready),
      lastTokenAt: text(push.lastTokenAt, 40) || undefined,
      lastPushAt: text(push.lastPushAt, 40) || undefined,
    },
    nativeAlarm: platform === 'android' ? 'SUPPORTED' : platform === 'ios' ? 'NOT_VERIFIED' : 'UNSUPPORTED',
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}
