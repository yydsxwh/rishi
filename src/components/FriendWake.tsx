import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import { daysFetch } from '../lib/days-api'
import { alarmClockError, clockToIso, defaultClock, formatDate, localDateTimeToIso, type ClockParts } from '../lib/clock-picker'
import { loadWake, postJson, remoteAlarmStatusText, type RemoteAlarmRecord, type RemoteGrant } from '../lib/remote-alarm'
import ClockPicker from './ClockPicker'
import type { TrustedAccount } from '../lib/location'
import TrustPersonPicker from './TrustPersonPicker'

function localIso(date: string, time: string): string | null {
  return localDateTimeToIso(date, time)
}

function grantWindow(now = new Date()): { from: ClockParts; until: ClockParts } {
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return {
    from: { date: formatDate(now), hour: 20, minute: 0, second: 0 },
    until: { date: formatDate(end), hour: 14, minute: 0, second: 0 },
  }
}

function entityOf(store: AppStore, type: string, id: string): { title: string; start: string; end: string } | null {
  const toIso = (date?: string, time?: string) => {
    if (!date) return null
    return localIso(date, time || '09:00')
  }
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
    if (!exam) return null
    const start = toIso(exam.date, exam.startTime)
    if (!start) return null
    return { title: exam.name, start, end: toIso(exam.date, exam.endTime || exam.startTime) || start }
  }
  return null
}

export default function FriendWake({ store }: { store: AppStore }) {
  const [given, setGiven] = useState<RemoteGrant[]>([])
  const [targets, setTargets] = useState<RemoteGrant[]>([])
  const [alarms, setAlarms] = useState<RemoteAlarmRecord[]>([])
  const [paused, setPaused] = useState(false)
  const [audit, setAudit] = useState<{ id: string; at: string; summary: string }[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [person, setPerson] = useState<TrustedAccount | null>(null)
  const [scope, setScope] = useState<'TIME_RANGE' | 'PERMANENT' | 'ENTITY_BOUND'>('TIME_RANGE')
  const initialWindow = grantWindow()
  const [fromClock, setFromClock] = useState<ClockParts>(initialWindow.from)
  const [untilClock, setUntilClock] = useState<ClockParts>(initialWindow.until)
  const [entityKey, setEntityKey] = useState('')
  const [lead, setLead] = useState(24)
  const [trail, setTrail] = useState(2)
  const [grantId, setGrantId] = useState('')
  const [alarmClock, setAlarmClock] = useState<ClockParts>(() => defaultClock())
  const [title, setTitle] = useState('起床啦')
  const [note, setNote] = useState('')
  const [revokeId, setRevokeId] = useState('')
  const [me, setMe] = useState('')
  const notified = useRef(new Set<string>())

  const choices = useMemo(() => {
    return [
      ...store.data.todos.filter((todo) => !todo.done && todo.dueDate).map((todo) => ({ key: `todo:${todo.id}`, label: `待办 ${todo.title}` })),
      ...store.data.calendarEvents.map((event) => ({ key: `event:${event.id}`, label: `日程 ${event.title}` })),
      ...store.data.exams.map((exam) => ({ key: `exam:${exam.id}`, label: `考试 ${exam.name}` })),
    ]
  }, [store.data.todos, store.data.calendarEvents, store.data.exams])

  async function reload() {
    try {
      const [grants, allowed, alarmBody, settings, events] = await loadWake()
      for (const grant of grants.given) {
        if (grant.scope !== 'ENTITY_BOUND' || !grant.entityType || !grant.entityId || grant.status === 'REVOKED') continue
        if (store.data.tombstones?.some((item) => item.id === grant.entityId)) {
          await postJson(`/api/days/remote-alarm/grants/${grant.id}`, 'PATCH', { entityActive: false, cancelFuture: true })
        }
      }
      const fresh = store.data.tombstones?.length ? await loadWake() : [grants, allowed, alarmBody, settings, events] as const
      const [nextGrants, nextAllowed, nextAlarms, nextSettings, nextEvents] = fresh
      setGiven(nextGrants.given)
      setTargets(nextAllowed.targets)
      setAlarms(nextAlarms.alarms)
      setPaused(nextSettings.settings.pausedAll)
      setAudit(nextEvents.events)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '请先登录后再使用好友叫醒')
    }
  }

  useEffect(() => {
    void reload()
    void daysFetch('/api/days/auth/session')
      .then((response) => response.json())
      .then((body: { user?: { sub?: string; id?: string } | null }) => setMe(body.user?.sub || body.user?.id || ''))
      .catch(() => setMe(''))
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, 20_000)
    return () => window.clearInterval(timer)
    // 打开提醒页后按固定间隔刷新闹钟状态。事项删除用墓碑判断。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!me || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const now = Date.now()
    for (const alarm of alarms) {
      if (alarm.ownerUserId !== me || notified.current.has(alarm.id)) continue
      const trigger = Date.parse(alarm.triggerAt)
      if (!Number.isFinite(trigger) || trigger - now > 120_000 || trigger < now - 60_000) continue
      notified.current.add(alarm.id)
      try {
        void new Notification('颗秒日事提醒', { body: `${alarm.title}。这是页面打开时的浏览器通知，不是 Android 系统闹钟。` })
      } catch {
        // 浏览器拒绝时不影响闹钟状态。
      }
    }
  }, [alarms, me])

  async function authorize() {
    setError('')
    if (!person) {
      setError('请先确认要授权的人。查找成功后还要点「确认是此人」。')
      return
    }
    const granteeUserId = person.userSub
    const granteeName = person.displayName || '好友'
    try {
      if (scope === 'PERMANENT') {
        await postJson('/api/days/remote-alarm/grants', 'POST', { granteeUserId, granteeName, scope })
      } else if (scope === 'ENTITY_BOUND') {
        const type = entityKey.split(':')[0]
        const id = entityKey.split(':')[1]
        const entity = entityOf(store, type, id)
        if (!entity) {
          setError('请选择一个有时间的事项')
          return
        }
        await postJson('/api/days/remote-alarm/grants', 'POST', {
          granteeUserId,
          granteeName,
          scope,
          entityType: type,
          entityId: id,
          entityTitle: entity.title,
          entityStartsAt: entity.start,
          entityEndsAt: entity.end,
          leadHours: lead,
          trailHours: trail,
        })
      } else {
        const validFrom = clockToIso(fromClock)
        const validUntil = clockToIso(untilClock)
        if (!validFrom || !validUntil || Date.parse(validUntil) <= Date.parse(validFrom)) {
          setError('请选择授权的起止日期和时分秒，结束要晚于开始')
          return
        }
        await postJson('/api/days/remote-alarm/grants', 'POST', {
          granteeUserId,
          granteeName,
          scope,
          validFrom,
          validUntil,
        })
      }
      setMessage('已授权对方给你设闹钟。这不会同时开放定位，位置要在下面单独开。')
      setPerson(null)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '授权失败')
    }
  }

  async function sendAlarm() {
    const target = targets.find((item) => item.id === grantId)
    const clockError = alarmClockError(alarmClock)
    const triggerAt = clockToIso(alarmClock)
    if (!target || !title.trim()) {
      setError('请选择好友，并填写标题')
      return
    }
    if (!triggerAt || clockError) {
      setError(clockError || '请选择日期和时分秒')
      return
    }
    try {
      const body = await postJson('/api/days/remote-alarm/alarms', 'POST', {
        ownerUserId: target.ownerUserId,
        grantId: target.id,
        triggerAt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
        title: title.trim(),
        note,
        clientNonce: crypto.randomUUID(),
      })
      const alarm = body.alarm as RemoteAlarmRecord | undefined
      setMessage(remoteAlarmStatusText(alarm?.status || 'DELIVERY_PENDING', alarm?.deviceReady))
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有设成')
    }
  }

  return (
    <div className="card">
      <h3>好友叫醒</h3>
      <p className="muted">授权指定好友，在你的 Android 手机上设置真正的闹钟。默认任何好友都没有这个权限。</p>
      {error && <p className="muted">{error}</p>}
      {message && <p>{message}</p>}
      <p>{paused ? '已暂停所有好友远程闹钟' : '正在接收已授权好友的远程闹钟'}</p>
      <div className="row wrap">
        {paused ? (
          <button className="btn primary" onClick={() => void postJson('/api/days/remote-alarm/resume', 'POST', {}).then(() => reload())}>恢复接收</button>
        ) : (
          <>
            <button className="btn ghost" onClick={() => void postJson('/api/days/remote-alarm/pause', 'POST', { cancelFuture: false }).then(() => reload())}>暂停，保留已设闹钟</button>
            <button className="btn ghost" onClick={() => void postJson('/api/days/remote-alarm/pause', 'POST', { cancelFuture: true }).then(() => reload())}>暂停并取消未来闹钟</button>
          </>
        )}
      </div>

      <h4>谁可以给我设闹钟</h4>
      {given.length === 0 && <p className="muted">还没有授权</p>}
      {given.map((grant) => (
        <div key={grant.id}>
          <strong>{grant.granteeName || grant.granteeUserId}</strong>
          <span> · {grant.status} · {grant.scope === 'PERMANENT' ? '永久有效，直到你主动撤销' : grant.scope === 'ENTITY_BOUND' ? `仅限「${grant.entityTitle || '事项'}」` : `${grant.validFrom || ''} 至 ${grant.validUntil || ''}`}</span>
          <div className="row wrap">
            {grant.status === 'ACTIVE' && <button className="btn ghost" onClick={() => void postJson(`/api/days/remote-alarm/grants/${grant.id}`, 'PATCH', { status: 'PAUSED' }).then(() => reload())}>暂停</button>}
            {grant.status === 'PAUSED' && <button className="btn ghost" onClick={() => void postJson(`/api/days/remote-alarm/grants/${grant.id}`, 'PATCH', { status: 'ACTIVE' }).then(() => reload())}>恢复</button>}
            <button className="btn ghost" onClick={() => setRevokeId(grant.id)}>撤销</button>
          </div>
          {revokeId === grant.id && (
            <div className="row wrap">
              <span>是否同时取消该好友已经为你设置、但尚未触发的未来闹钟？</span>
              <button className="btn ghost" onClick={() => void postJson(`/api/days/remote-alarm/grants/${grant.id}`, 'DELETE', { cancelFuture: false }).then(() => { setRevokeId(''); return reload() })}>只撤销权限</button>
              <button className="btn primary" onClick={() => void postJson(`/api/days/remote-alarm/grants/${grant.id}`, 'DELETE', { cancelFuture: true }).then(() => { setRevokeId(''); return reload() })}>撤销并取消闹钟</button>
            </div>
          )}
        </div>
      ))}
      {person ? <p>已确认：{person.displayName}</p> : <p className="muted">还没有确认授权对象。</p>}
      <TrustPersonPicker onConfirm={setPerson} />
      <div className="row wrap">
        <button className="btn ghost" onClick={() => setScope('TIME_RANGE')}>{scope === 'TIME_RANGE' ? '一段时间 ✓' : '一段时间'}</button>
        <button className="btn ghost" onClick={() => setScope('PERMANENT')}>{scope === 'PERMANENT' ? '永久 ✓' : '永久'}</button>
        <button className="btn ghost" onClick={() => setScope('ENTITY_BOUND')}>{scope === 'ENTITY_BOUND' ? '跟随事项 ✓' : '跟随事项'}</button>
      </div>
      {scope === 'PERMANENT' && <p>永久有效，直到你主动撤销</p>}
      {scope === 'TIME_RANGE' && (
        <>
          <ClockPicker label="授权开始" value={fromClock} onChange={setFromClock} />
          <ClockPicker label="授权结束" value={untilClock} onChange={setUntilClock} />
        </>
      )}
      {scope === 'ENTITY_BOUND' && (
        <>
          {choices.map((choice) => (
            <button key={choice.key} className="btn ghost" onClick={() => setEntityKey(choice.key)}>{entityKey === choice.key ? `${choice.label} ✓` : choice.label}</button>
          ))}
          <label>事项前几小时<input className="input slim" type="number" min={0} value={lead} onChange={(event) => setLead(Number(event.target.value) || 0)} /></label>
          <label>事项后几小时<input className="input slim" type="number" min={0} value={trail} onChange={(event) => setTrail(Number(event.target.value) || 0)} /></label>
        </>
      )}
      <button className="btn primary" onClick={() => void authorize()}>授权这位好友</button>
      <p className="muted">聊天记录和 KKChat 好友都不会自动变成授权。确认是此人之后才会保存对方的 usr_ 账号。</p>

      <h4>我可以给谁设闹钟</h4>
      {targets.filter((item) => item.canCreate).length === 0 && <p className="muted">还没有人授权你</p>}
      {targets.filter((item) => item.canCreate).map((target) => (
        <button key={target.id} className="btn ghost" onClick={() => setGrantId(target.id)}>{grantId === target.id ? `${target.ownerName} ✓` : target.ownerName}</button>
      ))}
      {grantId && <DeviceHint target={targets.find((item) => item.id === grantId)} />}
      <ClockPicker label="闹钟时间" value={alarmClock} onChange={setAlarmClock} futureOnly />
      <label>标题<input className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>备注<input className="input" value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <button className="btn primary" onClick={() => void sendAlarm()}>设置闹钟</button>

      <h4>闹钟</h4>
      {alarms.map((alarm) => (
        <p key={alarm.id}>
          {alarm.creatorName || alarm.ownerUserId} · {alarm.title} · {alarm.triggerAt} · {remoteAlarmStatusText(alarm.status, alarm.deviceReady)}
          {alarm.status !== 'CANCELLED' && alarm.status !== 'FIRED' && (
            <button className="btn ghost" onClick={() => void postJson(`/api/days/remote-alarm/alarms/${alarm.id}`, 'DELETE', {}).then(() => reload())}>取消</button>
          )}
        </p>
      ))}
      <h4>记录</h4>
      {audit.slice(0, 8).map((event) => <p key={event.id}>{event.at} {event.summary}</p>)}
      <p className="muted">关闭浏览器后，网页不能替对方注册 Android 系统闹钟。浏览器通知只在这个页面开着时作辅助。</p>
    </div>
  )
}

function DeviceHint({ target }: { target?: RemoteGrant }) {
  if (!target) return null
  const device = target.device
  if (device?.platform !== 'android') {
    return <p>对方需安装颗秒日事 Android App 才能注册系统闹钟</p>
  }
  const seen = device.lastSeenAt ? device.lastSeenAt.replace('T', ' ').slice(0, 16) : '还没有同步时间'
  const exact = device.remoteAlarm?.exactAlarmPermission === 'granted' ? '精确闹钟已允许' : '精确闹钟状态未知或未允许'
  return <p>对方 Android 最近同步 {seen}。{exact}。只有回执「对方手机已成功设置」才算设好。</p>
}

