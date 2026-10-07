import { describe, expect, it } from 'vitest'
import { remoteAlarmStatusText } from './remote-alarm'

describe('远程闹钟状态', () => {
  it('服务端已创建时不假装手机已经设好', () => {
    expect(remoteAlarmStatusText('DELIVERY_PENDING', false)).toBe('已发送，等待对方手机注册闹钟')
    expect(remoteAlarmStatusText('DELIVERED', false)).toBe('已发送，等待对方手机注册闹钟')
  })

  it('只有设备回执后才显示已设置', () => {
    expect(remoteAlarmStatusText('DEVICE_SCHEDULED', true)).toBe('对方手机已成功设置闹钟')
    expect(remoteAlarmStatusText('FIRED', true)).toBe('已响铃')
  })
})
