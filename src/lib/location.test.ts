import { describe, expect, it } from 'vitest'
import { locationStatusText } from './location'

describe('位置状态', () => {
  it('过期和实时用不同的说法', () => {
    expect(locationStatusText('live')).toBe('实时')
    expect(locationStatusText('last_known')).toBe('最近位置')
    expect(locationStatusText('stale')).toBe('位置已过期')
    expect(locationStatusText('stale')).not.toBe('实时')
    expect(locationStatusText('permission_off')).toBe('定位权限关闭')
    expect(locationStatusText('offline')).toBe('手机离线')
  })
})
