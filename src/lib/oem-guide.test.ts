import { describe, expect, it } from 'vitest'
import { oemGuide } from './oem-guide'

describe('厂商设置指引', () => {
  it('识别常见品牌，并给其余机型通用步骤', () => {
    expect(oemGuide('Xiaomi 14').brand).toBe('Xiaomi')
    expect(oemGuide('samsung SM-S9180').steps[0]).toMatch(/电池/)
    expect(oemGuide('HONOR Magic6').brand).toBe('Honor')
    expect(oemGuide('unknown phone').brand).toBe('Android')
  })
})
