import { describe, expect, it } from 'vitest'
import { maskEmail, remoteAlarmStatusText } from './remote-alarm'

describe('远程闹钟状态', () => {
  it('服务端已创建时只表示还在等设备', () => {
    expect(remoteAlarmStatusText('CREATED', false)).toBe('等待对方设备接收')
    expect(remoteAlarmStatusText('DELIVERY_PENDING', false)).toBe('等待对方设备接收')
    expect(remoteAlarmStatusText('DELIVERED', false)).toBe('已发送')
  })

  it('只有设备回执后才显示已设置', () => {
    expect(remoteAlarmStatusText('DEVICE_SCHEDULED', true)).toBe('对方手机已成功设置')
    expect(remoteAlarmStatusText('FIRED', true)).toBe('已响铃')
    expect(remoteAlarmStatusText('FAILED', false)).toBe('失败')
    expect(remoteAlarmStatusText('CANCELLED', false)).toBe('已取消')
    expect(remoteAlarmStatusText('EXPIRED', false)).toBe('已过期')
  })

  it('邮箱只显示脱敏结果', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com')
    expect(maskEmail('')).toBe('邮箱未返回')
  })
})
