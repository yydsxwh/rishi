import { describe, expect, it } from 'vitest'
import { alarmClockError, clockToIso, defaultClock, localDateTimeToIso, monthCells, previewClock } from './clock-picker'

describe('好友闹钟时分秒', () => {
  it('08:05:09 和 23:59:59 的秒数会回到本地时间', () => {
    for (const sample of [
      { hour: 8, minute: 5, second: 9 },
      { hour: 23, minute: 59, second: 59 },
    ]) {
      const iso = clockToIso({ date: '2026-10-10', ...sample })
      expect(iso).toBeTruthy()
      const back = new Date(iso || '')
      expect(back.getFullYear()).toBe(2026)
      expect(back.getMonth()).toBe(9)
      expect(back.getDate()).toBe(10)
      expect(back.getHours()).toBe(sample.hour)
      expect(back.getMinutes()).toBe(sample.minute)
      expect(back.getSeconds()).toBe(sample.second)
    }
  })

  it('带秒的字符串不会把秒清成 0', () => {
    const iso = localDateTimeToIso('2026-10-10', '08:05:09')
    expect(new Date(iso || '').getSeconds()).toBe(9)
    expect(localDateTimeToIso('2026-10-10', '08:05')).toBeTruthy()
    expect(new Date(localDateTimeToIso('2026-10-10', '08:05') || '').getSeconds()).toBe(0)
    expect(localDateTimeToIso('2026-10-10', '24:00:00')).toBeNull()
  })

  it('预览包含秒，过去时间给出中文提示', () => {
    expect(previewClock({ date: '2026-10-10', hour: 8, minute: 30, second: 15 })).toBe('2026-10-10 08:30:15')
    expect(alarmClockError({ date: '2020-01-01', hour: 0, minute: 0, second: 1 }, new Date('2026-10-10T00:00:00Z'))).toBe('不能设置过去或 30 秒内的时间')
  })

  it('默认时间大约在 5 分钟后', () => {
    const now = new Date('2026-10-10T00:00:10.000Z')
    const next = defaultClock(now)
    const iso = clockToIso(next)
    expect(Date.parse(iso || '') - now.getTime()).toBeGreaterThanOrEqual(5 * 60 * 1000 - 1000)
    expect(Date.parse(iso || '') - now.getTime()).toBeLessThanOrEqual(5 * 60 * 1000 + 1000)
  })

  it('月历固定 42 格并且从周一开始', () => {
    const cells = monthCells(2026, 10)
    expect(cells).toHaveLength(42)
    expect(cells.find((cell) => cell.iso === '2026-10-01')?.inMonth).toBe(true)
    expect(cells[0].iso).toBe('2026-09-28')
  })
})
