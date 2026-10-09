import { useState } from 'react'
import { alarmClockError, monthCells, pad2, previewClock, type ClockParts } from '../lib/clock-picker'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/** 自己画的日历和时分秒下拉。手机微信、Safari 不依赖系统日期弹窗。 */
export default function ClockPicker({
  label,
  value,
  onChange,
  futureOnly = false,
}: {
  label: string
  value: ClockParts
  onChange: (next: ClockParts) => void
  futureOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => monthOf(value.date))
  const error = futureOnly ? alarmClockError(value) : null
  const cells = monthCells(cursor.year, cursor.month)

  function shift(delta: number) {
    const next = new Date(cursor.year, cursor.month - 1 + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() + 1 })
  }

  function setPart(part: 'hour' | 'minute' | 'second', raw: string) {
    onChange({ ...value, [part]: Number(raw) })
  }

  return (
    <fieldset className="clock-picker">
      <legend>{label}</legend>
      <button
        className="btn ghost clock-open"
        type="button"
        aria-expanded={open}
        onClick={() => {
          setCursor(monthOf(value.date))
          setOpen((current) => !current)
        }}
      >
        选择日期
      </button>
      {open && (
        <div className="clock-cal" role="dialog" aria-label={`${label}日历`}>
          <div className="clock-nav">
            <button className="btn ghost" type="button" onClick={() => shift(-1)}>上个月</button>
            <strong>{cursor.year}年{cursor.month}月</strong>
            <button className="btn ghost" type="button" onClick={() => shift(1)}>下个月</button>
          </div>
          <div className="clock-week" aria-hidden>
            {WEEK.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="clock-grid">
            {cells.map((cell) => (
              <button
                key={cell.iso}
                type="button"
                className={`clock-day${cell.inMonth ? '' : ' outside'}${cell.iso === value.date ? ' selected' : ''}`}
                onClick={() => {
                  onChange({ ...value, date: cell.iso })
                  setOpen(false)
                }}
              >
                {cell.day}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="clock-parts">
        <label>
          时
          <select aria-label={`${label}时`} value={value.hour} onChange={(event) => setPart('hour', event.target.value)}>
            {options(24)}
          </select>
        </label>
        <label>
          分
          <select aria-label={`${label}分`} value={value.minute} onChange={(event) => setPart('minute', event.target.value)}>
            {options(60)}
          </select>
        </label>
        <label>
          秒
          <select aria-label={`${label}秒`} value={value.second} onChange={(event) => setPart('second', event.target.value)}>
            {options(60)}
          </select>
        </label>
      </div>
      <p className="clock-preview">预览 {previewClock(value)}</p>
      {error && <p className="clock-error">{error}</p>}
    </fieldset>
  )
}

function options(count: number) {
  return Array.from({ length: count }, (_, value) => (
    <option key={value} value={value}>{pad2(value)}</option>
  ))
}

function monthOf(date: string): { year: number; month: number } {
  const [year, month] = date.split('-').map(Number)
  if (!year || !month) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  return { year, month }
}
