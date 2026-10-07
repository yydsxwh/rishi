import { useEffect, useRef, useState } from 'react'
import { daysFetch } from '../lib/days-api'
import { maskEmail } from '../lib/remote-alarm'
import { ACCOUNT_CENTER_URL, avatarInitial, loginUrl, logoutUrl } from '../lib/site-session'
import { clearNativeSession, startNativeLogin } from '../lib/native-auth'
import { isNativeApp } from '../lib/native'
import type { CloudSync } from '../hooks/useCloudSync'
import type { AppData } from '../types'

const STATE_TEXT: Record<CloudSync['state'], string> = {
  starting: '正在检查登录…',
  signedOut: '未登录，数据只存在这台设备',
  syncing: '正在同步…',
  synced: '已同步到云端',
  offline: '云端连不上，改动已存在本机',
  error: '同步出错，改动已存在本机',
  localOnly: '未登录，数据只存在这台设备',
}

function syncTone(state: CloudSync['state'], pending: boolean): string {
  if (state === 'offline' || state === 'error') return 'warn'
  if (state === 'syncing' || pending) return 'busy'
  if (state === 'synced') return 'ok'
  return 'idle'
}

function relativeTime(at: number | null): string {
  if (!at) return ''
  const seconds = Math.round((Date.now() - at) / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}

export default function AccountCenter({ sync, data }: { sync: CloudSync; data: AppData }) {
  const [open, setOpen] = useState(false)
  const [admin, setAdmin] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void daysFetch('/api/days/admin/me')
      .then((res) => (res.ok ? res.json() : { admin: false }))
      .then((body: { admin?: boolean }) => {
        if (!cancelled) setAdmin(Boolean(body.admin))
      })
      .catch(() => {
        if (!cancelled) setAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onAway = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onAway)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onAway)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const { user, state, pendingChanges, lastSyncedAt } = sync
  const tone = syncTone(state, pendingChanges)

  if (!user) {
    if (isNativeApp()) {
      return (
        <div className="account-wrap" ref={wrapRef}>
          <button className="btn primary slim" type="button" onClick={() => void startNativeLogin()}>
            登录
          </button>
        </div>
      )
    }
    return (
      <div className="account-wrap" ref={wrapRef}>
        <a className="btn primary slim" href={loginUrl()}>
          登录
        </a>
      </div>
    )
  }

  const counts = [
    { label: '待办', value: data.todos.filter((t) => !t.done).length },
    { label: '倒数日', value: data.countdowns.length },
    { label: '便签', value: data.notes.length },
    { label: '课程', value: data.courses.length },
    { label: '考试', value: data.exams.length },
  ]

  return (
    <div className="account-wrap" ref={wrapRef}>
      <button
        className="avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`个人中心：${user.name}`}
        title={user.name}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" />
        ) : (
          <span className="avatar-initial">{avatarInitial(user.name)}</span>
        )}
        <span className={`avatar-dot ${tone}`} aria-hidden />
      </button>

      {open && (
        <div className="account-panel" role="dialog" aria-label="个人中心">
          <header className="account-head">
            {user.avatarUrl ? (
              <img className="account-face" src={user.avatarUrl} alt="" />
            ) : (
              <span className="account-face initial">{avatarInitial(user.name)}</span>
            )}
            <div>
              <strong>{user.name}</strong>
              <p className="muted">账号 {user.sub}</p>
              <p className="muted">{maskEmail(user.email)}</p>
              <p className="muted">KK号、手机号：账号中心这次登录没有带回</p>
            </div>
          </header>

          <div className={`sync-line ${tone}`}>
            <span className="sync-dot" aria-hidden />
            <div>
              <strong>{pendingChanges && state !== 'syncing' ? '有改动待上传' : STATE_TEXT[state]}</strong>
              {lastSyncedAt && <p className="muted">上次同步 {relativeTime(lastSyncedAt)}</p>}
            </div>
          </div>

          <p className="account-hint">改动会自动存到云端，换台设备登录同一个账号就能接着用。</p>

          <button className="btn primary block" onClick={sync.syncNow} disabled={state === 'syncing'}>
            {state === 'syncing' ? '同步中…' : '立即同步'}
          </button>

          <dl className="account-stats">
            {counts.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.value}</dd>
              </div>
            ))}
          </dl>

          <div className="account-links">
            {admin ? <a href="#admin">管理后台</a> : null}
            {ACCOUNT_CENTER_URL ? (
              <a href={`${ACCOUNT_CENTER_URL}/`} target="_blank" rel="noreferrer">
                账号中心设置
              </a>
            ) : null}
            <a href={logoutUrl()} onClick={() => void clearNativeSession()}>
              退出登录
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
