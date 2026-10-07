import { useEffect, useMemo, useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import { postJson } from '../lib/remote-alarm'
import {
  loadLocation,
  locationStatusText,
  publishLocation,
  readFriendLocation,
  type LocationGrantRecord,
  type LocationView,
  type TrustedAccount,
} from '../lib/location'
import LocationMap from './LocationMap'
import TrustPersonPicker from './TrustPersonPicker'

function localIso(date: string, time: string): string | null {
  if (!date || !time) return null
  const parsed = new Date(`${date}T${time}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export default function LocationGuard({ store }: { store: AppStore }) {
  const [given, setGiven] = useState<LocationGrantRecord[]>([])
  const [received, setReceived] = useState<LocationGrantRecord[]>([])
  const [audit, setAudit] = useState<{ id: string; at: string; summary: string }[]>([])
  const [paused, setPaused] = useState(false)
  const [person, setPerson] = useState<TrustedAccount | null>(null)
  const [scope, setScope] = useState<'TIME_RANGE' | 'PERMANENT' | 'ENTITY_BOUND'>('TIME_RANGE')
  const [mode, setMode] = useState<'LAST_KNOWN' | 'LIVE'>('LAST_KNOWN')
  const [precision, setPrecision] = useState<'APPROXIMATE' | 'PRECISE'>('APPROXIMATE')
  const [fromDate, setFromDate] = useState('')
  const [fromTime, setFromTime] = useState('09:00')
  const [untilDate, setUntilDate] = useState('')
  const [untilTime, setUntilTime] = useState('18:00')
  const [entityKey, setEntityKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [view, setView] = useState<LocationView | null>(null)
  const [viewName, setViewName] = useState('')

  const choices = useMemo(() => {
    return [
      ...store.data.todos.filter((todo) => !todo.done && todo.dueDate).map((todo) => ({ key: `todo:${todo.id}`, label: `待办 ${todo.title}` })),
      ...store.data.calendarEvents.map((event) => ({ key: `event:${event.id}`, label: `日程 ${event.title}` })),
      ...store.data.exams.map((exam) => ({ key: `exam:${exam.id}`, label: `考试 ${exam.name}` })),
    ]
  }, [store.data.todos, store.data.calendarEvents, store.data.exams])

  async function reload() {
    const body = await loadLocation()
    setGiven(body.grants.given || [])
    setReceived(body.grants.received || [])
    setAudit(body.audit || [])
    setPaused(Boolean(body.status.pausedAll))
  }

  useEffect(() => {
    void reload().catch((reason) => setError(reason instanceof Error ? reason.message : '请先登录后再使用位置守护'))
  }, [])

  async function authorize() {
    if (!person) {
      setError('请先确认要授权的人')
      return
    }
    const payload: Record<string, unknown> = {
      granteeUserId: person.userSub,
      granteeName: person.displayName,
      granteeAccountName: person.accountName,
      granteeKkMasked: person.kkNumberMasked,
      scope,
      mode,
      precision,
    }
    if (scope === 'TIME_RANGE') {
      const validFrom = localIso(fromDate, fromTime)
      const validUntil = localIso(untilDate, untilTime)
      if (!validFrom || !validUntil) {
        setError('请填写位置授权的起止时间')
        return
      }
      payload.validFrom = validFrom
      payload.validUntil = validUntil
    }
    if (scope === 'ENTITY_BOUND') {
      const type = entityKey.split(':')[0]
      const id = entityKey.split(':')[1]
      const entity = entityOf(store, type, id)
      if (!entity) {
        setError('请选择一个有时间的事项')
        return
      }
      Object.assign(payload, {
        entityType: type,
        entityId: id,
        entityTitle: entity.title,
        entityStartsAt: entity.start,
        entityEndsAt: entity.end,
        leadHours: 1,
        trailHours: 1,
      })
    }
    try {
      await postJson('/api/days/location/grants', 'POST', payload)
      setMessage(`已允许 ${person.displayName} 查看位置。这不会让对方给你设闹钟，也看不到你的日程全文。`)
      setPerson(null)
      setError('')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '授权失败')
    }
  }

  async function shareHere() {
    if (!navigator.geolocation) {
      setError('当前浏览器不能定位')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void publishLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          source: 'GPS',
        })
          .then(() => {
            setMessage('已更新最近位置。网页版不会在后台持续定位。')
            setError('')
          })
          .catch((reason) => setError(reason instanceof Error ? reason.message : '上传失败'))
      },
      () => setError('没有拿到定位权限，已停止上传'),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  async function openPerson(grant: LocationGrantRecord) {
    setError('')
    try {
      const location = await readFriendLocation(grant.ownerUserId)
      setView(location)
      setViewName(grant.ownerName || '好友')
    } catch (reason) {
      setView(null)
      setError(reason instanceof Error ? reason.message : '现在看不到位置')
    }
  }

  return (
    <div className="card">
      <h3>位置守护</h3>
      <p className="muted">谁可以看你的位置，和谁可以给你设闹钟，是两套分开的授权。默认谁都不能看。</p>
      {error && <p className="muted">{error}</p>}
      {message && <p>{message}</p>}
      <p>{paused ? '已暂停全部位置共享' : '位置共享开着。永久授权也不会在后台偷偷高频定位，实时共享要在手机上明确打开。'}</p>
      <div className="row wrap">
        {paused ? (
          <button className="btn primary" type="button" onClick={() => void postJson('/api/days/location/resume', 'POST', {}).then(() => reload())}>恢复位置共享</button>
        ) : (
          <button className="btn ghost" type="button" onClick={() => void postJson('/api/days/location/pause', 'POST', {}).then(() => reload())}>暂停全部位置共享</button>
        )}
        <button className="btn ghost" type="button" onClick={shareHere}>更新我的最近位置</button>
      </div>

      <h4>谁可以查看我的位置</h4>
      {given.length === 0 && <p className="muted">还没有位置授权</p>}
      {given.map((grant) => (
        <div key={grant.id}>
          <strong>{grant.granteeName || grant.granteeUserId}</strong>
          <span> · {grant.status} · {grant.precision === 'PRECISE' ? '精确' : '模糊'} · {grant.mode === 'LIVE' ? '实时' : '最近位置'}</span>
          <div className="row wrap">
            {grant.status === 'ACTIVE' && <button className="btn ghost" type="button" onClick={() => void postJson(`/api/days/location/grants/${grant.id}`, 'PATCH', { status: 'PAUSED' }).then(() => reload())}>暂停</button>}
            {grant.status === 'PAUSED' && <button className="btn ghost" type="button" onClick={() => void postJson(`/api/days/location/grants/${grant.id}`, 'PATCH', { status: 'ACTIVE' }).then(() => reload())}>恢复</button>}
            <button className="btn ghost" type="button" onClick={() => void postJson(`/api/days/location/grants/${grant.id}`, 'DELETE', {}).then(() => reload())}>撤销</button>
          </div>
        </div>
      ))}

      {person ? <p>已确认：{person.displayName}。闹钟权限请在上面的好友叫醒里单独开。</p> : <p className="muted">还没有确认授权对象。</p>}
      <TrustPersonPicker onConfirm={setPerson} />
      <div className="row wrap">
        <button className="btn ghost" type="button" onClick={() => setScope('TIME_RANGE')}>{scope === 'TIME_RANGE' ? '一段时间 ✓' : '一段时间'}</button>
        <button className="btn ghost" type="button" onClick={() => setScope('PERMANENT')}>{scope === 'PERMANENT' ? '永久 ✓' : '永久'}</button>
        <button className="btn ghost" type="button" onClick={() => setScope('ENTITY_BOUND')}>{scope === 'ENTITY_BOUND' ? '跟随事项 ✓' : '跟随事项'}</button>
      </div>
      <div className="row wrap">
        <button className="btn ghost" type="button" onClick={() => setMode('LAST_KNOWN')}>{mode === 'LAST_KNOWN' ? '最近位置 ✓' : '最近位置'}</button>
        <button className="btn ghost" type="button" onClick={() => setMode('LIVE')}>{mode === 'LIVE' ? '实时守护 ✓' : '实时守护'}</button>
        <button className="btn ghost" type="button" onClick={() => setPrecision('APPROXIMATE')}>{precision === 'APPROXIMATE' ? '模糊 ✓' : '模糊'}</button>
        <button className="btn ghost" type="button" onClick={() => setPrecision('PRECISE')}>{precision === 'PRECISE' ? '精确 ✓' : '精确'}</button>
      </div>
      {scope === 'TIME_RANGE' && (
        <div className="row wrap">
          <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input className="input" type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} />
          <input className="input" type="date" value={untilDate} onChange={(event) => setUntilDate(event.target.value)} />
          <input className="input" type="time" value={untilTime} onChange={(event) => setUntilTime(event.target.value)} />
        </div>
      )}
      {scope === 'ENTITY_BOUND' && choices.map((choice) => (
        <button key={choice.key} className="btn ghost" type="button" onClick={() => setEntityKey(choice.key)}>{entityKey === choice.key ? `${choice.label} ✓` : choice.label}</button>
      ))}
      {mode === 'LIVE' && <p className="muted">实时共享会在 Android 上显示「正在共享位置」。关掉系统定位权限后会马上停止上传。</p>}
      <button className="btn primary" type="button" onClick={() => void authorize()}>授权查看位置</button>

      <h4>我可以查看谁的位置</h4>
      {received.length === 0 && <p className="muted">还没有人授权你</p>}
      <div className="row wrap">
        {received.map((grant) => (
          <button key={grant.id} className="btn ghost" type="button" onClick={() => void openPerson(grant)}>{grant.ownerName || '好友'}</button>
        ))}
      </div>
      {view && (
        <div>
          <h4>{viewName}的位置</h4>
          <p>状态：{view.statusLabel || locationStatusText(view.status)}</p>
          {view.capturedAt && <p>最后更新：{view.capturedAt}</p>}
          {view.accuracyMeters != null && <p>定位精度：约 {view.accuracyMeters} 米</p>}
          {view.advice && <p>{view.advice}</p>}
          {view.latitude != null && view.longitude != null ? (
            <LocationMap latitude={view.latitude} longitude={view.longitude} />
          ) : (
            <p className="muted">现在没有可以画在地图上的位置。</p>
          )}
        </div>
      )}
      <h4>谁看过我的位置</h4>
      {audit.slice(0, 8).map((event) => <p key={event.id}>{event.at} {event.summary}</p>)}
    </div>
  )
}

function entityOf(store: AppStore, type: string, id: string): { title: string; start: string; end: string } | null {
  const toIso = (date?: string, time?: string) => (date ? localIso(date, time || '09:00') : null)
  if (type === 'todo') {
    const todo = store.data.todos.find((item) => item.id === id && !item.done)
    const start = toIso(todo?.dueDate, todo?.dueTime)
    if (!todo || !start) return null
    return { title: todo.title, start, end: toIso(todo.dueDate, todo.dueEndTime || todo.dueTime) || start }
  }
  if (type === 'event') {
    const event = store.data.calendarEvents.find((item) => item.id === id)
    const start = toIso(event?.date, event?.startTime)
    if (!event || !start) return null
    return { title: event.title, start, end: toIso(event.date, event.endTime || event.startTime) || start }
  }
  if (type === 'exam') {
    const exam = store.data.exams.find((item) => item.id === id)
    const start = toIso(exam?.date, exam?.startTime)
    if (!exam || !start) return null
    return { title: exam.name, start, end: toIso(exam.date, exam.endTime || exam.startTime) || start }
  }
  return null
}
