/** 好友叫醒的本地日期和时分秒。不依赖浏览器原生日期弹窗。 */

export type ClockParts = {
  date: string
  hour: number
  minute: number
  second: number
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function previewClock(parts: ClockParts): string {
  return `${parts.date} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`
}

/** 默认落在当前时间 5 分钟后，秒数保留。 */
export function defaultClock(now = new Date(), leadMs = 5 * 60 * 1000): ClockParts {
  const next = new Date(now.getTime() + leadMs)
  next.setMilliseconds(0)
  return {
    date: formatDate(next),
    hour: next.getHours(),
    minute: next.getMinutes(),
    second: next.getSeconds(),
  }
}

export function clockToIso(parts: ClockParts): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parts.date)) return null
  if (![parts.hour, parts.minute, parts.second].every((value) => Number.isInteger(value))) return null
  if (parts.hour < 0 || parts.hour > 23 || parts.minute < 0 || parts.minute > 59 || parts.second < 0 || parts.second > 59) return null
  const [year, month, day] = parts.date.split('-').map(Number)
  const local = new Date(year, month - 1, day, parts.hour, parts.minute, parts.second, 0)
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) return null
  return local.toISOString()
}

/** 课程和授权里的 HH:mm 仍可用。带秒时秒数必须原样保留。 */
export function localDateTimeToIso(date: string, time: string): string | null {
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim())
  if (!clock) return null
  return clockToIso({
    date: date.trim(),
    hour: Number(clock[1]),
    minute: Number(clock[2]),
    second: clock[3] == null ? 0 : Number(clock[3]),
  })
}

export function alarmClockError(parts: ClockParts, now = new Date()): string | null {
  const iso = clockToIso(parts)
  if (!iso) return '请选择完整的日期、时、分、秒'
  if (Date.parse(iso) <= now.getTime() + 30_000) return '不能设置过去或 30 秒内的时间'
  return null
}

/** 周一开头的六周格子，方便手机点选，不调用系统日期控件。 */
export function monthCells(year: number, month: number): { iso: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1)
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month - 1, 1 - lead)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return { iso: formatDate(day), day: day.getDate(), inMonth: day.getMonth() === month - 1 }
  })
}
