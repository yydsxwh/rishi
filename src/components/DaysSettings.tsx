import { useEffect, useRef, useState } from 'react'
import { daysFetch } from '../lib/days-api'
import { loadWake, postJson, WEB_BUILD, type RemoteGrant } from '../lib/remote-alarm'

type DeviceStatus = {
  platform?: string
  lastSeenAt?: string
  nativeAlarm?: string
  remoteAlarm?: { exactAlarmPermission?: string; notificationPermission?: string; supported?: boolean }
}

type AndroidRelease = {
  latestVersionName?: string
  latestVersionCode?: number
  downloadUrl?: string
  releaseNotes?: string
}

export default function DaysSettings() {
  const [open, setOpen] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [given, setGiven] = useState<RemoteGrant[]>([])
  const [paused, setPaused] = useState(false)
  const [device, setDevice] = useState<DeviceStatus | null>(null)
  const [release, setRelease] = useState<AndroidRelease | null>(null)
  const [notice, setNotice] = useState('')
  const [permission, setPermission] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onAway = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onAway)
    return () => document.removeEventListener('mousedown', onAway)
  }, [open])

  useEffect(() => {
    if (!open) return
    setPermission(typeof Notification === 'undefined' ? '当前浏览器没有通知接口' : Notification.permission)
    void daysFetch('/api/days/app/version')
      .then((response) => response.json())
      .then((body: AndroidRelease) => setRelease(body))
      .catch(() => setRelease(null))
    void daysFetch('/api/days/auth/session')
      .then((response) => response.json())
      .then(async (body: { user?: { sub?: string } | null }) => {
        const ok = Boolean(body.user?.sub)
        setSignedIn(ok)
        if (!ok) return
        const [grants, , , settings] = await loadWake()
        setGiven(grants.given)
        setPaused(settings.settings.pausedAll)
        const status = await daysFetch('/api/days/devices/status')
        if (status.ok) {
          const payload = (await status.json()) as { device?: DeviceStatus }
          setDevice(payload.device || null)
        }
      })
      .catch(() => setSignedIn(false))
  }, [open])

  async function pause(cancelFuture: boolean) {
    await postJson('/api/days/remote-alarm/pause', 'POST', { cancelFuture })
    setPaused(true)
    setNotice(cancelFuture ? '已暂停并取消未来闹钟' : '已暂停，已设闹钟仍保留')
  }

  return (
    <div className="account-wrap" ref={wrapRef}>
      <button className="gear-btn" type="button" aria-label="设置" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        ⚙
      </button>
      {open && (
        <div className="account-panel settings-panel" role="dialog" aria-label="设置">
          <strong>设置</strong>
          <h4>好友叫醒</h4>
          <a href="#timetable/remind">打开授权和创建闹钟</a>
          <p className="muted">网页可以授权、创建和查看状态。关闭浏览器后不能替手机注册系统闹钟。</p>
          {!signedIn && <p className="muted">登录后才能看到授权和设备状态。</p>}
          {signedIn && (
            <>
              <p>{paused ? '已暂停所有好友远程闹钟' : '正在接收已授权好友的远程闹钟'}</p>
              {given.length === 0 && <p className="muted">当前没有授权</p>}
              {given.map((grant) => (
                <p key={grant.id}>
                  {grant.granteeName || grant.granteeUserId} · {grant.status}
                  {grant.status === 'ACTIVE' && (
                    <button className="btn ghost" type="button" onClick={() => void postJson(`/api/days/remote-alarm/grants/${grant.id}`, 'PATCH', { status: 'PAUSED' }).then(() => setGiven((rows) => rows.map((row) => row.id === grant.id ? { ...row, status: 'PAUSED' } : row)))}>暂停</button>
                  )}
                  {grant.status === 'PAUSED' && (
                    <button className="btn ghost" type="button" onClick={() => void postJson(`/api/days/remote-alarm/grants/${grant.id}`, 'PATCH', { status: 'ACTIVE' }).then(() => setGiven((rows) => rows.map((row) => row.id === grant.id ? { ...row, status: 'ACTIVE' } : row)))}>恢复</button>
                  )}
                </p>
              ))}
              <div className="row wrap">
                <button className="btn ghost" type="button" onClick={() => void pause(false)}>暂停接收</button>
                <button className="btn ghost" type="button" onClick={() => void postJson('/api/days/remote-alarm/resume', 'POST', {}).then(() => { setPaused(false); setNotice('已恢复接收') })}>恢复接收</button>
              </div>
              <p>{device?.platform === 'android' ? `Android 已登记。最近同步 ${device.lastSeenAt || '未知'}。精确闹钟 ${device.remoteAlarm?.exactAlarmPermission || '未知'}。系统闹钟能力 ${device.nativeAlarm || 'SUPPORTED'}。` : '还没有登记 Android 设备。对方需安装颗秒日事 Android App 才能注册系统闹钟。'}</p>
            </>
          )}
          <p><a href="/products/days/kemiao-days.apk">下载 Android App</a></p>
          {notice && <p>{notice}</p>}

          <h4>通知</h4>
          <p className="muted">浏览器通知权限：{permission || '未知'}。它只在页面打开时提醒，不能代替 Android 系统闹钟。</p>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              if (typeof Notification === 'undefined') return
              void Notification.requestPermission().then((value) => setPermission(value))
            }}
          >
            请求浏览器通知权限
          </button>
          <p className="muted">Android 上的通知、精确闹钟和「好友叫醒实时守护」在 App 的好友叫醒页查看。实时守护开启后会显示常驻通知。</p>

          <h4>关于</h4>
          <p>网页版 {WEB_BUILD}</p>
          <p>Android 最新 {release?.latestVersionName || '…'}{release?.latestVersionCode ? `（${release.latestVersionCode}）` : ''}</p>
          <p className="muted">{release?.releaseNotes || ''}</p>
          <p><a href={release?.downloadUrl || '/products/days/kemiao-days.apk'}>APK 下载</a></p>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              void daysFetch('/api/days/app/version')
                .then((response) => response.json())
                .then((body: AndroidRelease) => {
                  setRelease(body)
                  setNotice(body.latestVersionName ? `Android 最新版本 ${body.latestVersionName}` : '暂时读不到版本')
                })
                .catch(() => setNotice('暂时连不上版本服务'))
            }}
          >
            检查 Android 新版本
          </button>
        </div>
      )}
    </div>
  )
}
