import { useEffect, useMemo, useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import { loadWake, postJson, remoteAlarmStatusText, type RemoteAlarmRecord, type RemoteGrant } from '../lib/remote-alarm'
import type { TrustedAccount } from '../lib/location'
import TrustPersonPicker from './TrustPersonPicker'

function localIso(date: string, time: string): string | null {
  if (!date || !time) return null
  const parsed = new Date(`${date}T${time}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
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
  const [fromDate, setFromDate] = useState('')
  const [fromTime, setFromTime] = useState('20:00')
  const [untilDate, setUntilDate] = useState('')
  const [untilTime, setUntilTime] = useState('14:00')
  const [entityKey, setEntityKey] = useState('')
  const [lead, setLead] = useState(24)
  const [trail, setTrail] = useState(2)
  const [grantId, setGrantId] = useState('')
  const [alarmDate, setAlarmDate] = useState('')
  const [alarmTime, setAlarmTime] = useState('10:30')
  const [title, setTitle] = useState('起床啦')
  const [note, setNote] = useState('')
  const [revokeId, setRevokeId] = useState('')

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
    // 只在进入提醒页时拉一次。事项删除用墓碑判断，避免每次渲染都打接口。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        const validFrom = localIso(fromDate, fromTime)
        const validUntil = localIso(untilDate, untilTime)
        if (!validFrom || !validUntil) {
          setError('请填写起止日期和时间')
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
    const triggerAt = localIso(alarmDate, alarmTime)
    if (!target || !triggerAt || !title.trim()) {
      setError('请选择好友，并填写时间和标题')
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
        <div className="row wrap">
          <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input className="input" type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} />
          <input className="input" type="date" value={untilDate} onChange={(event) => setUntilDate(event.target.value)} />
          <input className="input" type="time" value={untilTime} onChange={(event) => setUntilTime(event.target.value)} />
        </div>
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
      <div className="row wrap">
        <input className="input" type="date" value={alarmDate} onChange={(event) => setAlarmDate(event.target.value)} />
        <input className="input" type="time" value={alarmTime} onChange={(event) => setAlarmTime(event.target.value)} />
      </div>
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
    </div>
  )
}

